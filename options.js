const DEFAULT_PUSH_ENDPOINT = 'http://localhost:8000/api/contacts';

document.addEventListener('DOMContentLoaded', function() {
  const includeOrderIdCheckbox = document.getElementById('includeOrderId');
  const clearDataAfterExportCheckbox = document.getElementById('clearDataAfterExport');
  const pushEnabledCheckbox = document.getElementById('pushEnabled');
  const pushEndpointInput = document.getElementById('pushEndpoint');
  const downloadCsvCheckbox = document.getElementById('downloadCsv');
  const saveButton = document.getElementById('saveButton');
  const resetButton = document.getElementById('resetButton');
  const statusDiv = document.getElementById('status');

  // Load saved options
  chrome.storage.sync.get([
    'includeOrderId',
    'clearDataAfterExport',
    'pushEnabled',
    'pushEndpoint',
    'downloadCsv'
  ], function(result) {
    includeOrderIdCheckbox.checked = result.includeOrderId !== false;
    clearDataAfterExportCheckbox.checked = result.clearDataAfterExport === true;
    pushEnabledCheckbox.checked = result.pushEnabled === true;
    pushEndpointInput.value = result.pushEndpoint || DEFAULT_PUSH_ENDPOINT;
    downloadCsvCheckbox.checked = result.downloadCsv !== false;
  });

  // Chrome blocks a fetch to any host that isn't covered by host_permissions,
  // and it fails at request time with nothing in the options UI to explain it.
  // localhost:8000 ships in the manifest; anything else has to be granted, and
  // chrome.permissions.request needs a user gesture — this click is one.
  function ensureHostPermission(endpoint) {
    let origin;
    try {
      origin = new URL(endpoint).origin + '/*';
    } catch (e) {
      return Promise.resolve({ ok: false, message: 'That endpoint is not a valid URL.' });
    }

    return chrome.permissions.contains({ origins: [origin] }).then(function(granted) {
      if (granted) return { ok: true };
      return chrome.permissions.request({ origins: [origin] }).then(function(approved) {
        return approved
          ? { ok: true }
          : { ok: false, message: `Saved, but Chrome access to ${origin} was declined — the push will fail until you allow it.` };
      });
    }).catch(function(error) {
      return { ok: false, message: `Saved, but the permission check failed: ${error.message}` };
    });
  }

  saveButton.addEventListener('click', function() {
    const endpoint = pushEndpointInput.value.trim() || DEFAULT_PUSH_ENDPOINT;
    const options = {
      includeOrderId: includeOrderIdCheckbox.checked,
      clearDataAfterExport: clearDataAfterExportCheckbox.checked,
      pushEnabled: pushEnabledCheckbox.checked,
      pushEndpoint: endpoint,
      downloadCsv: downloadCsvCheckbox.checked
    };

    // Only ask for host access when the push is actually switched on —
    // a permission prompt for a feature you left off is just noise.
    const permissionCheck = options.pushEnabled
      ? ensureHostPermission(endpoint)
      : Promise.resolve({ ok: true });

    permissionCheck.then(function(permission) {
      chrome.storage.sync.set(options, function() {
        if (permission.ok) {
          showStatus('Options saved successfully!', 'success');
        } else {
          showStatus(permission.message, 'error');
        }
        setTimeout(function() {
          statusDiv.classList.remove('success');
          statusDiv.classList.remove('error');
          statusDiv.style.display = 'none';
        }, permission.ok ? 3000 : 8000);
      });
    });
  });

  resetButton.addEventListener('click', function() {
    if (confirm('Reset all options to defaults?')) {
      includeOrderIdCheckbox.checked = true;
      clearDataAfterExportCheckbox.checked = false;
      pushEnabledCheckbox.checked = false;
      pushEndpointInput.value = DEFAULT_PUSH_ENDPOINT;
      downloadCsvCheckbox.checked = true;

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
    statusDiv.style.display = 'block';
  }
});
