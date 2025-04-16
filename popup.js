// Popup.js - Handles the popup UI functionality

// DOM Elements
const toggle = document.getElementById("enabledToggle");
const countDisplay = document.getElementById("count");
const resetBtn = document.getElementById("resetCounter");

// Debug helper function
function logDebug(message, data = null) {
  chrome.storage.sync.get(["debugMode"], (result) => {
    // Only log if debug mode is enabled
    if (result.debugMode === true) {
      console.log(message, data);
    }
  });
}

// Function to update UI with current values
function updateUI() {
  chrome.storage.sync.get(["filterEnabled", "filteredCount"], (result) => {
    logDebug("Storage values retrieved:", result);

    // Update filter toggle state
    const isEnabled = result.filterEnabled !== false;
    toggle.checked = isEnabled;

    // Update counter display
    const count = result.filteredCount || 0;
    countDisplay.textContent = count;
  });
}

// Initialize popup
document.addEventListener("DOMContentLoaded", () => {
  const toggleElement = document.getElementById("enabledToggle");
  const countElement = document.getElementById("count");
  const resetButton = document.getElementById("resetCounter");

  // Load current settings
  try {
    chrome.storage.sync.get(["filterEnabled", "filteredCount"], (result) => {
      if (chrome.runtime.lastError) {
        console.log(
          "[KillTheNoise Popup] Error loading settings:",
          chrome.runtime.lastError
        );
        return;
      }

      // Set toggle state
      toggleElement.checked = result.filterEnabled !== false;

      // Set counter value
      countElement.textContent = result.filteredCount || "0";
    });
  } catch (error) {
    console.log("[KillTheNoise Popup] Error accessing chrome APIs:", error);
  }

  // Handle toggle changes
  toggleElement.addEventListener("change", () => {
    const enabled = toggleElement.checked;

    try {
      // Save setting to storage
      chrome.storage.sync.set({ filterEnabled: enabled }, () => {
        if (chrome.runtime.lastError) {
          console.log(
            "[KillTheNoise Popup] Error saving settings:",
            chrome.runtime.lastError
          );
          return;
        }

        // Send message to active tab to enable/disable filter
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chrome.runtime.lastError) {
            console.log(
              "[KillTheNoise Popup] Error querying tabs:",
              chrome.runtime.lastError
            );
            return;
          }

          if (tabs.length === 0) return;

          try {
            chrome.tabs.sendMessage(
              tabs[0].id,
              { action: "toggleFilter", enabled },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.log(
                    "[KillTheNoise Popup] Error sending message:",
                    chrome.runtime.lastError
                  );
                }
              }
            );
          } catch (error) {
            console.log("[KillTheNoise Popup] Error sending message:", error);
          }
        });
      });
    } catch (error) {
      console.log("[KillTheNoise Popup] Error setting storage:", error);
    }
  });

  // Handle reset counter button
  resetButton.addEventListener("click", () => {
    try {
      // Reset the counter in storage
      chrome.storage.sync.set({ filteredCount: 0 }, () => {
        if (chrome.runtime.lastError) {
          console.log(
            "[KillTheNoise Popup] Error resetting counter:",
            chrome.runtime.lastError
          );
          return;
        }

        // Update UI
        countElement.textContent = "0";

        // Send message to reset content script counters
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chrome.runtime.lastError) {
            console.log(
              "[KillTheNoise Popup] Error querying tabs:",
              chrome.runtime.lastError
            );
            return;
          }

          if (tabs.length === 0) return;

          try {
            chrome.tabs.sendMessage(
              tabs[0].id,
              { action: "resetCount" },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.log(
                    "[KillTheNoise Popup] Error sending reset message:",
                    chrome.runtime.lastError
                  );
                }
              }
            );
          } catch (error) {
            console.log(
              "[KillTheNoise Popup] Error sending reset message:",
              error
            );
          }
        });
      });
    } catch (error) {
      console.log("[KillTheNoise Popup] Error resetting counter:", error);
    }
  });
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  logDebug("Storage changed:", changes);
  updateUI();
});
