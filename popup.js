document.addEventListener('DOMContentLoaded', function() {
  const startButton = document.getElementById('startButton');
  const stopButton = document.getElementById('stopButton');
  const optionsButton = document.getElementById('optionsButton');
  const loadingSpinner = document.getElementById('loadingSpinner');
  const loadingText = document.getElementById('loadingText');
  const statusDiv = document.getElementById('status');

  optionsButton.addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });

  startButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0].url.includes('https://www.etsy.com/your/orders/sold')) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "start"}, function(response) {
          if (chrome.runtime.lastError) {
            console.error('Error starting collection:', chrome.runtime.lastError.message);
            updateStatus("Error: Please refresh the Etsy Sold Orders page and try again.");
          } else if (response && response.status === "started") {
            startButton.style.display = 'none';
            stopButton.style.display = 'block';
            showLoading("Reading page 1…");
            // Collection runs in the page, not here, so closing this popup no
            // longer ends the run — it only stops the progress display.
            updateStatus("Collecting every page. You can close this popup.");
          }
        });
      } else {
        updateStatus("Please navigate to the Etsy Sold Orders page before starting.");
      }
    });
  });

  stopButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "stop"}, function(response) {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          updateStatus("Error: Please refresh the Etsy Sold Orders page and try again.");
        } else if (response && response.status === "stopped") {
          resetUI();
          updateStatus("Stopping — exporting what has been collected so far…");
        }
      });
    });
  });

  function updateStatus(message) {
    statusDiv.textContent = message;
  }

  function resetUI() {
    startButton.style.display = 'block';
    stopButton.style.display = 'none';
    hideLoading();
  }

  function showLoading(message) {
    loadingText.textContent = message || "Processing…";
    loadingSpinner.style.display = 'block';
  }

  function hideLoading() {
    loadingSpinner.style.display = 'none';
  }

  // Progress from the content script, and the export result from the service
  // worker. A popup opened mid-run starts blank and fills in on the next
  // message — the run itself is unaffected either way.
  chrome.runtime.onMessage.addListener(function(request) {
    if (request.action === "updateStatus") {
      updateStatus(request.status);
    } else if (request.action === "showLoading") {
      showLoading(request.message);
    } else if (request.action === "hideLoading") {
      resetUI();
    }
  });
});
