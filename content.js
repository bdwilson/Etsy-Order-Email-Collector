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

    const nextPageButton = document.querySelector('.btn-group button[title="Next page"]');
    if (nextPageButton && !nextPageButton.disabled) {
      promptNextPage();
    } else {
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
      const nextPageButton = document.querySelector('.btn-group button[title="Next page"]');
      if (nextPageButton) {
        nextPageButton.click();
        currentPage++;
        showLoading("Loading next page...");
        collectOrders();
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
