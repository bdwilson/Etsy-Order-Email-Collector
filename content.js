let isCollecting = false;
let ordersCollected = [];
let seenOrderIds = new Set();
let currentPage = 1;

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
    collectOrders();
    sendResponse({status: "started"});
  } else if (request.action === "stop") {
    isCollecting = false;
    sendOrdersToBackground();
    sendResponse({status: "stopped"});
  }
  return true;
});

// Merges everything seen so far - buffered network responses plus the
// server-rendered inline script - and returns how many were new.
function drainAvailableOrders() {
  const found = pendingOrders.splice(0, pendingOrders.length);

  if (ordersCollected.length === 0) {
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

// The SPA's response can land well after the click that triggered it, so poll
// rather than guessing a single fixed delay.
function waitForOrders(timeoutMs) {
  return new Promise(resolve => {
    let added = drainAvailableOrders();
    if (added > 0) return resolve(added);

    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      added = drainAvailableOrders();
      if (added > 0 || Date.now() > deadline) {
        clearInterval(timer);
        resolve(added);
      }
    }, 500);
  });
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

function collectOrders() {
  if (!isCollecting) return;

  showLoading("Processing current page...");

  waitForOrders(20000).then(added => {
    hideLoading();

    console.log(`Etsy collector: page ${currentPage} added ${added} order(s), ${ordersCollected.length} total`);

    if (ordersCollected.length === 0) {
      updateStatus("No orders found. Try reloading the Etsy orders page and starting again.");
    } else if (added === 0) {
      updateStatus(`No new orders on page ${currentPage}. ${ordersCollected.length} collected so far.`);
    } else {
      updateStatus(`Collected ${ordersCollected.length} order(s) from ${currentPage} page(s)`);
    }

    return waitForNextPageButton(8000);
  }).then(nextPageButton => {
    if (!isCollecting) return;

    if (nextPageButton) {
      promptNextPage();
    } else {
      console.log('Etsy collector: no enabled "Next page" control found, finishing.');
      isCollecting = false;
      sendOrdersToBackground();
    }
  });
}

function promptNextPage() {
  chrome.runtime.sendMessage({
    action: "promptNextPage",
    message: `Collected ${ordersCollected.length} order(s) from ${currentPage} page(s).`,
    currentPage: currentPage,
    totalOrders: ordersCollected.length
  }, function(response) {
    if (chrome.runtime.lastError) {
      console.error('Error in promptNextPage:', chrome.runtime.lastError);
      isCollecting = false;
      sendOrdersToBackground();
    } else if (response && response.proceed) {
      // Re-query rather than reusing the earlier reference: the SPA replaces
      // these nodes on every render, so the old one may be detached by now.
      const nextPageButton = findNextPageButton();
      if (nextPageButton) {
        nextPageButton.click();
        currentPage++;
        showLoading("Loading next page...");
        collectOrders();
      } else {
        console.log('Etsy collector: "Next page" control vanished before the click, finishing.');
        isCollecting = false;
        sendOrdersToBackground();
      }
    } else {
      isCollecting = false;
      sendOrdersToBackground();
    }
  });
}

function sendOrdersToBackground() {
  chrome.runtime.sendMessage({
    action: "downloadCSV",
    orders: ordersCollected
  });
}

function updateStatus(message) {
  chrome.runtime.sendMessage({
    action: "updateStatus",
    status: message
  });
}

function showLoading(message) {
  chrome.runtime.sendMessage({
    action: "showLoading",
    message: message
  });
}

function hideLoading() {
  chrome.runtime.sendMessage({
    action: "hideLoading"
  });
}
