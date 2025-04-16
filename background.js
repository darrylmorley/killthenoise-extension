const DEFAULT_KEYWORDS = [
  "exposed",
  "disaster",
  "meltdown",
  "destroyed",
  "collapsing",
  "falling apart",
  "the end of",
  "what nobody tells you",
  "what no one is saying",
  "you won't believe",
  "unbelievable",
  "shocking",
  "gone wrong",
  "worst ever",
  "biggest mistake",
  "is over",
  "humiliated",
  "embarrassed",
  "crisis",
  "scandal",
  "fraud",
  "rage",
  "rant",
  "fails",
  "explodes",
  "backlash",
  "cancelled",
  "tragedy",
  "heartbreaking",
  "ruined",
  "outburst",
  "breaking down",
  "rage quit",
  "why no one talks about",
  "left in tears",
  "freaks out",
  "gone too far",
  "must watch",
  "dark truth",
  "shut down",
  "fired",
  "quit live",
  "insane",
  "blunder",
  "triggered",
  "brutal",
  "emotional",
  "controversy",
  "🔥",
  "😱",
];

// Debug helper
function debugLog(...args) {
  try {
    chrome.storage.sync.get(["debugMode"], (result) => {
      if (chrome.runtime.lastError) {
        // Extension context may be invalidated, log to console directly
        console.log(
          "[KillTheNoise Background] Extension context error:",
          chrome.runtime.lastError
        );
        return;
      }

      if (result.debugMode === true) {
        console.log("[KillTheNoise Background]", ...args);
      }
    });
  } catch (error) {
    // If chrome.storage is not available, extension might be reloading
    console.log(
      "[KillTheNoise Background] Error accessing chrome APIs:",
      error
    );
  }
}

// Handle navigation preload - this addresses the warning about preloadResponse
self.addEventListener("activate", (event) => {
  // Disable navigation preload if it's supported
  if (self.registration.navigationPreload) {
    event.waitUntil(self.registration.navigationPreload.disable());
  }
});

// Initialize settings on install or update
chrome.runtime.onInstalled.addListener((details) => {
  debugLog("Extension installed/updated:", details.reason);

  // Get existing settings first
  chrome.storage.sync.get(null, (result) => {
    debugLog("Current storage state:", result);

    const toSet = {};

    // Set default keywords if needed
    if (
      !Array.isArray(result.blockKeywords) ||
      result.blockKeywords.length === 0
    ) {
      toSet.blockKeywords = DEFAULT_KEYWORDS;
    }

    // Initialize blockHashtags if undefined
    if (!Array.isArray(result.blockHashtags)) {
      toSet.blockHashtags = [];
    }

    // Set filterEnabled to true by default if undefined
    if (typeof result.filterEnabled === "undefined") {
      toSet.filterEnabled = true;
    }

    // Initialize filteredCount if undefined
    if (typeof result.filteredCount === "undefined") {
      toSet.filteredCount = 0;
    }

    // Initialize debugMode if undefined (default to false)
    if (typeof result.debugMode === "undefined") {
      toSet.debugMode = false;
    }

    // Apply updates if needed
    if (Object.keys(toSet).length) {
      debugLog("Initializing storage with:", toSet);
      chrome.storage.sync.set(toSet, () => {
        debugLog("Storage initialized");
      });
    }
  });
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog("Message received:", message, "from:", sender);

  if (message.action === "updateCount") {
    debugLog("Count updated:", message.count);
    sendResponse({ received: true });
  }

  // Return true to keep message channel open for async response
  return true;
});
