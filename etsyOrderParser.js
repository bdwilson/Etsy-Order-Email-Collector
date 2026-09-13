// Extracts {orderId, email} pairs from the Etsy.Context blob embedded in the
// sold-orders page. Content scripts run in an isolated world and cannot read
// window.Etsy, so the JSON is parsed out of the inline <script> text instead.
//
// Only the orders_search sub-object is parsed rather than the whole context
// blob: the surrounding config is ~200KB of unrelated fields, and a single
// malformed one there would otherwise cost us every order on the page.

function sliceBalancedObject(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function parseOrdersSearch(scriptText) {
  const key = '"orders_search"';
  let from = 0;

  while (true) {
    const keyIndex = scriptText.indexOf(key, from);
    if (keyIndex === -1) return null;

    const objectStart = scriptText.indexOf('{', keyIndex + key.length);
    if (objectStart === -1) return null;

    const json = sliceBalancedObject(scriptText, objectStart);
    if (json) {
      try {
        const parsed = JSON.parse(json);
        if (parsed && (parsed.orders || parsed.buyers)) return parsed;
      } catch (e) {
        // Fall through and try the next occurrence.
      }
    }

    from = keyIndex + key.length;
  }
}

function ordersFromSearch(search) {
  if (!search) return [];

  const emailByBuyerId = {};
  (search.buyers || []).forEach(buyer => {
    if (buyer && buyer.buyer_id != null && buyer.email) {
      emailByBuyerId[String(buyer.buyer_id)] = buyer.email;
    }
  });

  return (search.orders || [])
    .filter(order => order && order.order_id != null)
    .map(order => ({
      orderId: String(order.order_id),
      email: emailByBuyerId[String(order.buyer_id)] || ''
    }));
}

function extractOrdersFromDocument(doc) {
  const scripts = doc.querySelectorAll('script');

  for (let i = 0; i < scripts.length; i++) {
    const text = scripts[i].textContent;
    if (!text || text.indexOf('orders_search') === -1) continue;

    const orders = ordersFromSearch(parseOrdersSearch(text));
    if (orders.length) return orders;
  }

  return [];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseOrdersSearch, ordersFromSearch, extractOrdersFromDocument };
}
