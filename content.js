let isCollecting = false;
let ordersCollected = [];
let seenOrderIds = new Set();
let currentPage = 1;

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

function collectOrders() {
  if (!isCollecting) return;

  showLoading("Processing current page...");

  setTimeout(() => {
    const found = extractOrdersFromDocument(document);
    let added = 0;

    found.forEach(order => {
      if (seenOrderIds.has(order.orderId)) return;
      seenOrderIds.add(order.orderId);
      ordersCollected.push(order);
      added++;
    });

    console.log(`Etsy collector: page ${currentPage} exposed ${found.length} order(s), ${added} new`);

    hideLoading();

    if (ordersCollected.length === 0) {
      updateStatus("No orders found on this page. Try reloading the Etsy orders page.");
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
  }, 5000);
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
        setTimeout(collectOrders, 5000);
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
