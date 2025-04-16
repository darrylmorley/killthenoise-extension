// Popup.js - Handles the popup UI functionality

// DOM Elements
const toggle = document.getElementById("enabledToggle");
const countDisplay = document.getElementById("count");
const resetBtn = document.getElementById("resetCounter");
const debugInfo = document.getElementById("debugInfo");

// Debug helper function
function logDebug(message, data = null) {
  console.log(message, data);

  // Add to debug div in popup
  const timestamp = new Date().toLocaleTimeString();
  const logMessage = data
    ? `${timestamp}: ${message} ${JSON.stringify(data)}`
    : `${timestamp}: ${message}`;

  debugInfo.innerHTML += `${logMessage}<br>`;
}

// Function to update UI with current values
function updateUI() {
  chrome.storage.sync.get(["filterEnabled", "filteredCount"], (result) => {
    logDebug("Storage values retrieved:", result);

    // Update toggle state - explicitly check if it's false
    const isEnabled = result.filterEnabled !== false;
    toggle.checked = isEnabled;
    logDebug(
      `Setting toggle to: ${isEnabled} (storage value: ${result.filterEnabled})`
    );

    // Update counter display
    const count = result.filteredCount || 0;
    countDisplay.textContent = count;
  });
}

// Initialize popup
document.addEventListener("DOMContentLoaded", () => {
  logDebug("Popup opened");

  // Force refresh settings from storage
  chrome.storage.sync.get(null, (allData) => {
    logDebug("All storage data:", allData);
  });

  // Update UI elements
  updateUI();
});

// Add listener for toggle changes
toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  logDebug("Toggle changed to:", enabled);

  // Immediately update UI to reflect the change
  toggle.disabled = true; // Disable during update

  // Make sure we're setting a boolean value, not undefined or null
  chrome.storage.sync.set({ filterEnabled: enabled === true }, () => {
    toggle.disabled = false; // Re-enable after update
    logDebug("Storage updated. filterEnabled set to:", enabled);

    // Verify the storage was updated correctly
    chrome.storage.sync.get(["filterEnabled"], (result) => {
      logDebug(
        "Verification - filterEnabled in storage is now:",
        result.filterEnabled
      );
    });

    // Notify content script to reapply filter immediately
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes("youtube.com")) {
        logDebug("Sending toggle message to tab:", tabs[0].id);

        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: "toggleFilter",
            enabled: enabled,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              logDebug("Error sending message:", chrome.runtime.lastError);
            } else if (response) {
              logDebug("Response from content script:", response);
            }
          }
        );
      } else {
        logDebug("No YouTube tab found to send message to");
      }
    });
  });
});

// Add reset counter button handler
resetBtn.addEventListener("click", () => {
  logDebug("Reset button clicked");

  chrome.storage.sync.set({ filteredCount: 0 }, () => {
    countDisplay.textContent = "0";
    logDebug("Counter reset to 0");

    // Notify content script to reset its local tracking
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes("youtube.com")) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "resetCount" });
      }
    });
  });
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  logDebug("Storage changed:", changes);
  updateUI();
});
