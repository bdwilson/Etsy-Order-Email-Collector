// Extracts {orderId, email} pairs from the sold-orders page, which exposes them
// through two separate channels:
//
// 1. The first render embeds them in an inline Etsy.Context <script>. Content
//    scripts run in an isolated world and cannot read window.Etsy, so that
//    script's text is parsed instead. Only the orders_search sub-object is
//    parsed, not the whole ~200KB context blob, so one malformed unrelated
//    field cannot cost us every order on the page.
//
// 2. Paging and the New/Completed tabs are client-side: they fetch fresh data
//    and never update that inline script. Those responses are captured by
//    pageHook.js and parsed here too.

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

// Walks an arbitrary parsed JSON value collecting every buyer (buyer_id +
// email) and every order (order_id + buyer_id), then joins them. Deliberately
// shape-agnostic: the server-rendered blob nests these under
// initial_data.orders.orders_search, but the SPA's XHR responses use a
// different envelope, and both flow through here.
function ordersFromAnyJson(root) {
  const emailByBuyerId = {};
  const orders = [];
  const queue = [root];
  const visited = new Set();

  // Breadth-first with an index cursor rather than shift()/pop(): keeps rows in
  // the order Etsy lists them, and avoids O(n^2) shifting on large pages.
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const node = queue[cursor];
    if (!node || typeof node !== 'object') continue;
    if (visited.has(node)) continue;
    visited.add(node);

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) queue.push(node[i]);
      continue;
    }

    if (node.buyer_id != null && typeof node.email === 'string' && node.email) {
      emailByBuyerId[String(node.buyer_id)] = node.email;
    }

    if (node.order_id != null && node.buyer_id != null) {
      orders.push({ orderId: String(node.order_id), buyerId: String(node.buyer_id) });
    }

    for (const key in node) {
      if (Object.prototype.hasOwnProperty.call(node, key)) queue.push(node[key]);
    }
  }

  const seen = new Set();
  return orders
    .filter(order => {
      if (seen.has(order.orderId)) return false;
      seen.add(order.orderId);
      return true;
    })
    .map(order => ({
      orderId: order.orderId,
      email: emailByBuyerId[order.buyerId] || ''
    }));
}

function ordersFromSearch(search) {
  return search ? ordersFromAnyJson(search) : [];
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

// Entry point for SPA network responses, which arrive as raw JSON text.
function extractOrdersFromJsonText(text) {
  if (!text || text.indexOf('order_id') === -1) return [];

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return [];
  }

  return ordersFromAnyJson(parsed);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseOrdersSearch,
    ordersFromSearch,
    ordersFromAnyJson,
    extractOrdersFromDocument,
    extractOrdersFromJsonText
  };
}
