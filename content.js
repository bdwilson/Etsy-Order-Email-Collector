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
    // Try multiple times to get Etsy Context data (it may load asynchronously)
    let attempts = 0;
    const maxAttempts = 5;

    function tryExtractData() {
      attempts++;
      console.log(`Extraction attempt ${attempts}/${maxAttempts}`);

      if (window.Etsy && window.Etsy.Context && window.Etsy.Context.data) {
        const contextData = window.Etsy.Context.data;
        console.log("Etsy Context data available", contextData);

        if (contextData.initial_data && contextData.initial_data.orders) {
          const ordersData = contextData.initial_data.orders;
          console.log("Orders data found:", ordersData);

          // Build a map of buyer_id -> email from the buyers array
          const buyerEmailMap = {};
          if (ordersData.orders_search && ordersData.orders_search.buyers) {
            console.log("Buyers found:", ordersData.orders_search.buyers);
            ordersData.orders_search.buyers.forEach(buyer => {
              buyerEmailMap[buyer.buyer_id] = buyer.email;
            });
          }

          // Process each order and match with buyer email
          if (ordersData.orders_search && ordersData.orders_search.orders) {
            console.log("Orders found:", ordersData.orders_search.orders);
            ordersData.orders_search.orders.forEach(order => {
              const email = buyerEmailMap[order.buyer_id];
              console.log(`Order ${order.order_id}: buyer_id=${order.buyer_id}, email=${email}`);

              if (email && email.includes('@')) {
                ordersCollected.push({
                  orderId: order.order_id ? order.order_id.toString() : '',
                  email: email
                });
              }
            });
          }

          finishCollection();
          return true;
        }
      }

      console.log("Etsy Context not available, retrying...");

      // Retry with increasing delay
      if (attempts < maxAttempts) {
        setTimeout(tryExtractData, 2000);
        return false;
      } else {
        console.log("Max attempts reached, trying DOM fallback");
        // Fallback: try to extract from visible page elements
        tryDOMFallback();
        return false;
      }
    }

    function tryDOMFallback() {
      console.log("Attempting DOM-based extraction");

      // Look for order containers - these selectors may vary
      const orderElements = document.querySelectorAll(
        '[data-order-id], [data-receipt-id], .order-row, [class*="order"], [class*="receipt"]'
      );

      console.log(`Found ${orderElements.length} potential order elements`);

      // Log the page structure for debugging
      console.log("Page HTML sample:", document.body.innerHTML.substring(0, 2000));

      finishCollection();
    }

    function finishCollection() {
      console.log("Total collected:", ordersCollected);

      hideLoading();
      updateStatus(`Collected ${ordersCollected.length} order(s) from ${currentPage} page(s)`);

      const nextPageButton = document.querySelector('.btn-group button[title="Next page"]');
      if (nextPageButton && !nextPageButton.disabled) {
        promptNextPage();
      } else {
        isCollecting = false;
        sendOrdersToBackground();
      }
    }

    tryExtractData();
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