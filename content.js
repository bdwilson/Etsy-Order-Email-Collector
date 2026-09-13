let isCollecting = false;
let ordersCollected = [];
let currentPage = 1;

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "start") {
    isCollecting = true;
    ordersCollected = [];
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
    // Find all order rows and extract order ID + email from each
    const orderRows = document.querySelectorAll('[class*="order-row"], [class*="receipt"]');

    orderRows.forEach(row => {
      // Try to find order ID in the row (typically in first few elements)
      const orderIdElement = row.querySelector('[class*="receipt-id"], [class*="order-id"], .order-code, a[href*="/receipt/"]');
      const orderIdText = orderIdElement?.textContent?.trim() || orderIdElement?.getAttribute('href')?.match(/\d+/)?.[0];

      // Find email in the dropdown menu (existing approach)
      const emailElement = row.querySelector('.dropdown-body ul li:last-child a');
      const email = emailElement?.textContent?.trim();

      if (email && email.includes('@')) {
        ordersCollected.push({
          orderId: orderIdText || '',
          email: email
        });
      }
    });

    hideLoading();
    updateStatus(`Collected ${ordersCollected.length} order(s) from ${currentPage} page(s)`);

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