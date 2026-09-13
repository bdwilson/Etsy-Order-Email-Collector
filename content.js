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
    // Extract from Etsy.Context embedded JavaScript data
    if (window.Etsy && window.Etsy.Context && window.Etsy.Context.data) {
      const contextData = window.Etsy.Context.data;

      if (contextData.initial_data && contextData.initial_data.orders) {
        const ordersData = contextData.initial_data.orders;

        // Build a map of buyer_id -> email from the buyers array
        const buyerEmailMap = {};
        if (ordersData.orders_search && ordersData.orders_search.buyers) {
          ordersData.orders_search.buyers.forEach(buyer => {
            buyerEmailMap[buyer.buyer_id] = buyer.email;
          });
        }

        // Process each order and match with buyer email
        if (ordersData.orders_search && ordersData.orders_search.orders) {
          ordersData.orders_search.orders.forEach(order => {
            const email = buyerEmailMap[order.buyer_id];

            if (email && email.includes('@')) {
              ordersCollected.push({
                orderId: order.order_id ? order.order_id.toString() : '',
                email: email
              });
            }
          });
        }
      }
    }

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