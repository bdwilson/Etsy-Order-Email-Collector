let isCollecting = false;
let ordersCollected = [];
let seenOrderIds = new Set();
let currentPage = 1;
let scannedDocument = false;
// Whether to walk the pagination or stop after the page already on screen.
// Set per run from the popup, since it's a per-run decision — "just today's
// orders" one time, the whole history the next.
let collectAllPages = true;

// How long to keep draining a page after the last new order arrived. The SPA
// can deliver a page's orders in more than one response, so stopping at the
// first batch that yields anything under-collects the page.
const SETTLE_QUIET_MS = 1500;
// Hard cap on waiting for a page to produce anything at all.
const PAGE_TIMEOUT_MS = 20000;
const NEXT_BUTTON_TIMEOUT_MS = 8000;
// Runaway guard. Per-page progress is also checked, so this only matters if
// "Next" somehow keeps working forever.
const MAX_PAGES = 200;

// Filled continuously by pageHook.js (MAIN world) as the SPA fetches data.
// Buffering from page load means orders already loaded before the user pressed
// Start are not missed.
const pendingOrders = [];

window.addEventListener('message', function(event) {
  if (event.source !== window) return;

  const data = event.data;
  if (!data || data.type !== 'ETSY_ORDER_COLLECTOR_DATA') return;

  (data.orders || []).forEach(order => pendingOrders.push(order));
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "start") {
    isCollecting = true;
    ordersCollected = [];
    seenOrderIds = new Set();
    currentPage = 1;
    scannedDocument = false;
    collectAllPages = request.allPages !== false;
    runCollection();
    sendResponse({status: "started"});
  } else if (request.action === "stop") {
    isCollecting = false;
    sendResponse({status: "stopped"});
  }
  return true;
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Merges everything seen so far - buffered network responses plus the
// server-rendered inline script - and returns how many were new.
function drainAvailableOrders() {
  const found = pendingOrders.splice(0, pendingOrders.length);

  // The inline Etsy.Context script only ever holds the first render and is
  // never updated as the SPA pages, so read it exactly once, at the start.
  if (!scannedDocument) {
    scannedDocument = true;
    extractOrdersFromDocument(document).forEach(order => found.push(order));
  }

  let added = 0;
  found.forEach(order => {
    if (!order || !order.orderId || seenOrderIds.has(order.orderId)) return;
    seenOrderIds.add(order.orderId);
    ordersCollected.push(order);
    added++;
  });

  return added;
}

// Collect one page to completion: keep draining until the page has been quiet
// for SETTLE_QUIET_MS rather than returning at the first batch that yields
// anything. The SPA's response can also land well after the click that
// triggered it, so this polls instead of guessing a single fixed delay.
async function collectCurrentPage() {
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  let addedTotal = 0;
  let lastAddAt = Date.now();

  while (isCollecting && Date.now() < deadline) {
    const added = drainAvailableOrders();

    if (added > 0) {
      addedTotal += added;
      lastAddAt = Date.now();
      updateStatus(`Collected ${ordersCollected.length} order(s) from ${currentPage} page(s)…`);
    } else if (addedTotal > 0 && Date.now() - lastAddAt >= SETTLE_QUIET_MS) {
      break;
    }

    await sleep(250);
  }

  return addedTotal;
}

const NEXT_PAGE_SELECTORS = [
  '.btn-group button[title="Next page"]',
  'button[title="Next page"]',
  'a[title="Next page"]',
  'button[aria-label="Next page"]',
  'a[aria-label="Next page"]'
];

function isDisabled(element) {
  return element.disabled === true ||
    element.getAttribute('aria-disabled') === 'true' ||
    element.classList.contains('disabled') ||
    element.classList.contains('is-disabled');
}

function findNextPageButton() {
  for (let i = 0; i < NEXT_PAGE_SELECTORS.length; i++) {
    const candidates = document.querySelectorAll(NEXT_PAGE_SELECTORS[i]);
    for (let j = 0; j < candidates.length; j++) {
      if (!isDisabled(candidates[j])) return candidates[j];
    }
  }
  return null;
}

// The SPA repaints its pagination controls after the response lands, so the
// button can be briefly absent or disabled at the moment the data arrives.
// Checking once there made collection stop early and report itself finished.
function waitForNextPageButton(timeoutMs) {
  return new Promise(resolve => {
    const button = findNextPageButton();
    if (button) return resolve(button);

    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      const found = findNextPageButton();
      if (found || Date.now() > deadline) {
        clearInterval(timer);
        resolve(found);
      }
    }, 300);
  });
}

// Walks every page on its own.
//
// This used to stop after each page and ask the popup whether to continue,
// which had a failure mode worse than the inconvenience: the popup is an
// ordinary extension page that closes the moment it loses focus, so the
// "continue?" message would find no listener, set chrome.runtime.lastError,
// and the run would quietly finish and export whatever that one page produced.
// Nothing here depends on the popup any more — collection keeps running with
// it closed, and status messages sent to a closed popup are simply dropped.
async function runCollection() {
  let stopReason = "";

  while (isCollecting && currentPage <= MAX_PAGES) {
    showLoading(`Reading page ${currentPage}…`);
    const added = await collectCurrentPage();

    console.log(`Etsy collector: page ${currentPage} added ${added} order(s), ${ordersCollected.length} total`);

    if (!isCollecting) {
      stopReason = "Collection stopped.";
      break;
    }

    if (added === 0) {
      // No progress: either the page never produced data, or "Next" isn't
      // actually advancing. Continuing would spin until MAX_PAGES.
      stopReason = ordersCollected.length === 0
        ? "No orders found. Try reloading the Etsy orders page and starting again."
        : `No new orders on page ${currentPage} — stopping with ${ordersCollected.length} collected.`;
      break;
    }

    updateStatus(`Collected ${ordersCollected.length} order(s) from ${currentPage} page(s)`);

    if (!collectAllPages) {
      console.log('Etsy collector: current page only, finishing.');
      break;
    }

    const nextPageButton = await waitForNextPageButton(NEXT_BUTTON_TIMEOUT_MS);
    if (!nextPageButton) {
      console.log('Etsy collector: no enabled "Next page" control found, finishing.');
      break;
    }
    if (!isCollecting) {
      stopReason = "Collection stopped.";
      break;
    }

    // Freshly queried above rather than reusing an earlier reference: the SPA
    // replaces these nodes on every render, so an older one may be detached.
    nextPageButton.click();
    currentPage++;
    showLoading(`Loading page ${currentPage}…`);
    // Give the SPA a moment to fire its request before polling for results.
    await sleep(500);
  }

  isCollecting = false;
  hideLoading();

  if (stopReason) {
    updateStatus(stopReason);
  } else {
    updateStatus(`Collected ${ordersCollected.length} order(s) from ${currentPage} page(s). Exporting…`);
  }

  sendOrdersToBackground();
}

function sendOrdersToBackground() {
  send({
    action: "downloadCSV",
    orders: ordersCollected
  });
}

// The popup may well be closed — it is not required for collection to run, and
// a message with no listener rejects. Status is advisory, so a dropped one must
// never interrupt the run.
function send(message) {
  try {
    const result = chrome.runtime.sendMessage(message);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (e) {
    // Extension context invalidated (e.g. reloaded mid-run) — nothing to do.
  }
}

function updateStatus(message) {
  send({ action: "updateStatus", status: message });
}

function showLoading(message) {
  send({ action: "showLoading", message: message });
}

function hideLoading() {
  send({ action: "hideLoading" });
}
