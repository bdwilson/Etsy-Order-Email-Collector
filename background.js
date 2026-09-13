const DEFAULT_PUSH_ENDPOINT = "http://localhost:8000/api/contacts";

const DEFAULT_SETTINGS = {
  pushEnabled: false,
  pushEndpoint: DEFAULT_PUSH_ENDPOINT,
  downloadCsv: true
};

// The popup is a normal extension page: it is gone the moment it loses focus,
// and sending to a closed popup rejects. Status is advisory, so a failed
// delivery must never take down the export it is narrating.
function setStatus(status) {
  chrome.runtime.sendMessage({ action: "updateStatus", status }).catch(() => {});
}

function buildCsv(orders) {
  const escape = value => `"${String(value || '').replace(/"/g, '""')}"`;
  let csv = "Order ID,Email\n";
  orders.forEach(order => {
    csv += `${escape(order.orderId)},${escape(order.email)}\n`;
  });
  return csv;
}

function downloadCsv(orders) {
  return new Promise((resolve, reject) => {
    const url = "data:text/csv;charset=utf-8," + encodeURIComponent(buildCsv(orders));
    const today = new Date().toISOString().slice(0, 10);

    chrome.downloads.download({
      url: url,
      filename: `etsy-order-email-collect-${today}.csv`,
      saveAs: true
    }, function() {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

// Push to etsy-lettertrack's /api/contacts endpoint.
//
// Sends {email, order_id} pairs rather than raw page text: this extension
// reads Etsy's own JSON, so the order number is known exactly. That matters on
// the receiving end — an address arriving WITH an order number is an exact
// join and is saved outright, while one arriving without is queued for manual
// review, since a wrong match emails one buyer another buyer's order details.
//
// Runs here in the service worker, not the content script: with the endpoint's
// host in host_permissions, extension workers are exempt from CORS, so there is
// no preflight and nothing for Etsy's own page CSP to block.
async function pushToApi(orders, endpoint) {
  const contacts = orders
    .filter(order => order && order.orderId && order.email)
    .map(order => ({ email: order.email, order_id: order.orderId }));

  if (!contacts.length) {
    return { skipped: true };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contacts: contacts })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${endpoint}`);
  }

  const result = await response.json();
  return {
    pushed: contacts.length,
    saved: (result.saved || []).length,
    queued: (result.queued || []).length,
    excluded: (result.excluded || []).length
  };
}

async function handleCollectedOrders(orders) {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const messages = [];
  let pushFailed = false;

  if (settings.pushEnabled) {
    setStatus("Pushing to etsy-lettertrack…");
    try {
      const result = await pushToApi(orders, settings.pushEndpoint || DEFAULT_PUSH_ENDPOINT);
      if (result.skipped) {
        messages.push("Nothing to push (no order/email pairs collected)");
      } else {
        const detail = [`${result.saved} matched to an order`];
        if (result.queued) detail.push(`${result.queued} need review`);
        if (result.excluded) detail.push(`${result.excluded} of your own skipped`);
        messages.push(`Pushed ${result.pushed}: ${detail.join(", ")}`);
      }
    } catch (error) {
      pushFailed = true;
      messages.push(`Push failed (${error.message}). Is etsy-lettertrack running?`);
    }
  }

  // The CSV is still written when a push fails: losing a whole collection run
  // because a local service was down would be the worse outcome, and the CSV
  // can always be imported by hand afterwards.
  const wantCsv = settings.downloadCsv || !settings.pushEnabled || pushFailed;
  if (wantCsv) {
    try {
      await downloadCsv(orders);
      messages.push("CSV downloaded");
    } catch (error) {
      console.error("CSV download failed", error);
      messages.push(`CSV download failed: ${error.message}`);
    }
  }

  setStatus(messages.join(" · ") || "Nothing collected.");
}

chrome.runtime.onMessage.addListener(function(request) {
  if (request.action === "downloadCSV") {
    // Deliberately not awaited and no `return true`: nothing sends a response
    // on this message, and the worker stays alive for the fetch and download.
    handleCollectedOrders(request.orders || []);
  }
});
