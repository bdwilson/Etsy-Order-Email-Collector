// Runs in the page's MAIN world so it can wrap the page's own fetch/XHR.
//
// The sold-orders page is a single-page app: only the first render is in the
// inline Etsy.Context script. Paging, and switching between the New/Completed
// tabs, fetch fresh data over the network and never update that script. So the
// responses are read as they arrive and handed to the isolated-world content
// script via postMessage.

(function () {
  const MESSAGE_TYPE = 'ETSY_ORDER_COLLECTOR_DATA';

  function publish(orders) {
    if (!orders || !orders.length) return;
    window.postMessage({ type: MESSAGE_TYPE, orders: orders }, window.location.origin);
  }

  function handleBody(text) {
    try {
      publish(extractOrdersFromJsonText(text));
    } catch (e) {
      // A malformed or unrelated response must never break the page.
    }
  }

  function looksLikeJson(contentType) {
    return typeof contentType === 'string' && contentType.indexOf('json') !== -1;
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function () {
      const result = originalFetch.apply(this, arguments);

      try {
        result.then(response => {
          try {
            if (response && response.ok && looksLikeJson(response.headers.get('content-type'))) {
              response.clone().text().then(handleBody, () => {});
            }
          } catch (e) {
            // Ignore: never interfere with the page's own handling.
          }
        }, () => {});
      } catch (e) {
        // Ignore.
      }

      return result;
    };
  }

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    try {
      this.addEventListener('load', function () {
        try {
          const type = this.getResponseHeader('content-type');
          if (!looksLikeJson(type)) return;
          if (this.responseType === '' || this.responseType === 'text') {
            handleBody(this.responseText);
          } else if (this.responseType === 'json' && this.response) {
            publish(ordersFromAnyJson(this.response));
          }
        } catch (e) {
          // Ignore.
        }
      });
    } catch (e) {
      // Ignore.
    }

    return originalSend.apply(this, arguments);
  };
})();
