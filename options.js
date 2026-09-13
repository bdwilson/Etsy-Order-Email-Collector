document.addEventListener('DOMContentLoaded', function() {
  const includeOrderIdCheckbox = document.getElementById('includeOrderId');
  const clearDataAfterExportCheckbox = document.getElementById('clearDataAfterExport');
  const saveButton = document.getElementById('saveButton');
  const resetButton = document.getElementById('resetButton');
  const statusDiv = document.getElementById('status');

  // Load saved options
  chrome.storage.sync.get([
    'includeOrderId',
    'clearDataAfterExport'
  ], function(result) {
    includeOrderIdCheckbox.checked = result.includeOrderId !== false;
    clearDataAfterExportCheckbox.checked = result.clearDataAfterExport === true;
  });

  saveButton.addEventListener('click', function() {
    const options = {
      includeOrderId: includeOrderIdCheckbox.checked,
      clearDataAfterExport: clearDataAfterExportCheckbox.checked
    };

    chrome.storage.sync.set(options, function() {
      showStatus('Options saved successfully!', 'success');
      setTimeout(function() {
        statusDiv.classList.remove('success');
        statusDiv.style.display = 'none';
      }, 3000);
    });
  });

  resetButton.addEventListener('click', function() {
    if (confirm('Reset all options to defaults?')) {
      includeOrderIdCheckbox.checked = true;
      clearDataAfterExportCheckbox.checked = false;

      chrome.storage.sync.clear(function() {
        showStatus('Options reset to defaults!', 'success');
        setTimeout(function() {
          statusDiv.classList.remove('success');
          statusDiv.style.display = 'none';
        }, 3000);
      });
    }
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = type;
  }
});
