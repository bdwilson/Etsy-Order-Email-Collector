chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "downloadCSV") {
    const orders = request.orders || [];

    // Generate CSV with Order ID and Email columns
    let csvContent = "Order ID,Email\n";
    orders.forEach(order => {
      const orderId = order.orderId || '';
      const email = order.email || '';
      // Escape quotes and wrap in quotes if needed
      const escapedId = `"${orderId.replace(/"/g, '""')}"`;
      const escapedEmail = `"${email.replace(/"/g, '""')}"`;
      csvContent += `${escapedId},${escapedEmail}\n`;
    });

    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
    const today = new Date().toISOString().slice(0, 10);
    const filename = `etsy-order-email-collect-${today}.csv`;

    chrome.downloads.download({
      url: encodedUri,
      filename: filename,
      saveAs: true
    }, function(downloadId) {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        chrome.runtime.sendMessage({
          action: "updateStatus",
          status: "Error downloading CSV. Please try again."
        });
      } else {
        chrome.runtime.sendMessage({
          action: "updateStatus",
          status: "CSV downloaded successfully."
        });
      }
    });
  }
});