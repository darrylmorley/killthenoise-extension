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

// Track which videos we've already processed to avoid double counting
const processedVideos = new Set();

// Simple local counter for debugging
let localRemovedCount = 0;

// Debug helper
function debugLog(...args) {
  console.log("[KillTheNoise]", ...args);
}

// Create and cache regex patterns for keywords to avoid repeated creation
const regexCache = new Map();

// Helper to create regex patterns for a keyword
function createKeywordRegexes(keyword) {
  try {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return {
      word: new RegExp(`\\b${escapedKeyword}\\b`, "i"),
      possessiveS: new RegExp(`\\b${escapedKeyword}'s\\b`, "i"),
      plural: new RegExp(`\\b${escapedKeyword}s\\b`, "i"),
      possessive: new RegExp(`\\b${escapedKeyword}'\\b`, "i"),
    };
  } catch (e) {
    debugLog(`Error creating regex for "${keyword}":`, e);
    return null;
  }
}

// Get (or create and cache) regex patterns for a keyword
function getKeywordRegexes(keyword) {
  const lowerKeyword = keyword.toLowerCase().trim();
  if (!regexCache.has(lowerKeyword)) {
    regexCache.set(lowerKeyword, createKeywordRegexes(lowerKeyword));
  }
  return regexCache.get(lowerKeyword);
}

// Debounce helper function
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    const later = () => {
      timeout = null;
      func.apply(this, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Get a reliable video ID for tracking processed videos
function getVideoId(el) {
  // Look for YouTube's native video ID first (most reliable and fastest)
  const idAttribute =
    el.getAttribute("data-video-id") || el.getAttribute("data-videoId");

  if (idAttribute) return `vid:${idAttribute}`;

  // Fall back to href parsing which is still quite reliable
  const linkEl = el.querySelector("a#thumbnail") || el.querySelector("a");
  if (linkEl && linkEl.href) {
    const match = linkEl.href.match(/(?:v=|\/)([\w-]{11})(?:\?|&|\/|$)/);
    if (match) return `href:${match[1]}`;
    return `url:${linkEl.href}`;
  }

  // Last resort: use the title text
  const titleEl = el.querySelector("#video-title") || el.querySelector("h3");
  return titleEl ? `title:${titleEl.textContent.trim()}` : `el:${Date.now()}`;
}

// Add CSS style for hiding filtered videos
function addHidingStyle() {
  if (document.getElementById("killthenoise-style")) return;

  const style = document.createElement("style");
  style.id = "killthenoise-style";
  style.textContent = ".killthenoise-filtered { display: none !important; }";
  document.head.appendChild(style);
  debugLog("Added CSS style for hiding videos");
}

// Periodically clean up the processed videos set to manage memory
function cleanupProcessedVideos() {
  // If we have more than 1000 entries, keep only the most recent 500
  if (processedVideos.size > 1000) {
    const entries = Array.from(processedVideos);
    const toKeep = entries.slice(-500);
    processedVideos.clear();
    toKeep.forEach((id) => processedVideos.add(id));
    debugLog(
      `Cleaned up processedVideos: ${entries.length} → ${processedVideos.size}`
    );
  }
}

// Process a single video element (check against keywords and filter if matched)
function processVideoElement(el, blockKeywords) {
  // Get a unique identifier for the video
  const videoId = getVideoId(el);

  // Skip if we've already processed this video
  if (processedVideos.has(videoId)) return false;

  // Mark as processed
  processedVideos.add(videoId);

  // Get title text
  const titleEl = el.querySelector("#video-title") || el.querySelector("h3");
  if (!titleEl) return false;
  const titleText = titleEl.textContent.trim();
  const lowerTitle = titleText.toLowerCase();

  // Get description text if available
  const descriptionEl = el.querySelector(
    "#description-text, .metadata-snippet-text, yt-formatted-string.metadata-snippet-text"
  );
  const descriptionText = descriptionEl
    ? descriptionEl.textContent.trim().toLowerCase()
    : "";

  // Check if video matches any keywords
  for (let keyword of blockKeywords) {
    const lowerKeyword = keyword.toLowerCase().trim();
    let matched = false;

    // For single words, use cached regex patterns for word boundary matching
    if (lowerKeyword.indexOf(" ") === -1) {
      const regexes = getKeywordRegexes(lowerKeyword);

      if (regexes) {
        // Check title with regexes
        if (
          regexes.word.test(lowerTitle) ||
          regexes.possessiveS.test(lowerTitle) ||
          regexes.plural.test(lowerTitle) ||
          regexes.possessive.test(lowerTitle)
        ) {
          matched = true;
          debugLog(
            `Filtered video: "${titleText}" (title word match: ${keyword})`
          );
        }
        // Check description with regexes
        else if (
          descriptionText &&
          (regexes.word.test(descriptionText) ||
            regexes.possessiveS.test(descriptionText) ||
            regexes.plural.test(descriptionText) ||
            regexes.possessive.test(descriptionText))
        ) {
          matched = true;
          debugLog(
            `Filtered video: "${titleText}" (description word match: ${keyword})`
          );
        }
      } else {
        // Fall back to simple inclusion if regex creation failed
        if (lowerTitle.includes(lowerKeyword)) {
          matched = true;
          debugLog(
            `Filtered video: "${titleText}" (title simple match: ${keyword})`
          );
        } else if (descriptionText && descriptionText.includes(lowerKeyword)) {
          matched = true;
          debugLog(
            `Filtered video: "${titleText}" (description simple match: ${keyword})`
          );
        }
      }
    }
    // For phrases, use simple inclusion
    else {
      if (lowerTitle.includes(lowerKeyword)) {
        matched = true;
        debugLog(
          `Filtered video: "${titleText}" (title phrase match: ${keyword})`
        );
      } else if (descriptionText && descriptionText.includes(lowerKeyword)) {
        matched = true;
        debugLog(
          `Filtered video: "${titleText}" (description phrase match: ${keyword})`
        );
      }
    }

    if (matched) {
      // Use CSS class instead of inline style
      el.classList.add("killthenoise-filtered");
      localRemovedCount++;
      return true; // Video was filtered
    }
  }

  return false; // Video was not filtered
}

function cleanYouTubeFeed(blockKeywords) {
  const videoElements = document.querySelectorAll(
    "ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer"
  );

  debugLog(`Checking ${videoElements.length} video elements`);

  // Process in smaller batches to avoid blocking the main thread
  const batchSize = 10;
  let currentBatch = 0;
  let removedThisRun = 0;

  function processBatch() {
    const end = Math.min(currentBatch + batchSize, videoElements.length);

    for (let i = currentBatch; i < end; i++) {
      const el = videoElements[i];
      if (processVideoElement(el, blockKeywords)) {
        removedThisRun++;
      }
    }

    currentBatch = end;

    if (currentBatch < videoElements.length) {
      // Schedule next batch to avoid blocking the UI
      setTimeout(processBatch, 0);
    } else if (removedThisRun > 0) {
      // Only update count when all processing is done
      updateFilteredCount(removedThisRun);
    }
  }

  // Start processing batches
  processBatch();
}

// Separate function to update the filtered count
function updateFilteredCount(count) {
  chrome.storage.sync.get(["filteredCount"], (result) => {
    const currentCount = result.filteredCount || 0;
    const newCount = currentCount + count;

    chrome.storage.sync.set({ filteredCount: newCount }, () => {
      debugLog(`Updated filtered count: ${currentCount} → ${newCount}`);
    });
  });
}

// Create a debounced version of runFilter
const debouncedRunFilter = debounce(runFilter, 300);

// Main filter function
function runFilter() {
  chrome.storage.sync.get(["blockKeywords", "filterEnabled"], (result) => {
    debugLog("Filter state:", result.filterEnabled);

    if (result.filterEnabled === false) {
      debugLog("Filter is disabled, skipping");
      return;
    }

    const blockKeywords = result.blockKeywords || DEFAULT_KEYWORDS;
    debugLog("Running filter with keywords:", blockKeywords);

    cleanYouTubeFeed(blockKeywords);
  });
}

// Initialize on page load
debugLog("Content script loaded");
setTimeout(() => {
  // Add CSS style for hiding videos
  addHidingStyle();

  // Run the filter
  runFilter();

  // Setup periodic cleanup of processed videos
  setInterval(cleanupProcessedVideos, 60000); // Every minute

  // Report current stats
  chrome.storage.sync.get(["filteredCount", "filterEnabled"], (result) => {
    debugLog("Current storage state:", result);
  });
}, 1000); // Slight delay to ensure page is loaded

// Add mutation observer to watch for new videos
const observer = new MutationObserver((mutations) => {
  // Don't run on every tiny mutation, use the debounced filter
  debouncedRunFilter();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Add IntersectionObserver to only process videos that are visible or about to be visible
let currentKeywords = DEFAULT_KEYWORDS;
const visibilityObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target;
        processVideoElement(el, currentKeywords);
        // Stop observing after processing
        visibilityObserver.unobserve(el);
      }
    });
  },
  { rootMargin: "200px" }
);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog("Message received:", message);

  if (message.action === "toggleFilter") {
    const enabled = message.enabled === true; // Ensure we have a boolean
    debugLog("Toggle filter message received. Enabled:", enabled);

    // Update our local filter state
    chrome.storage.sync.set({ filterEnabled: enabled }, () => {
      debugLog(
        "Storage updated in content script. filterEnabled set to:",
        enabled
      );

      if (enabled) {
        // If enabling, run the filter
        runFilter();
      } else {
        debugLog("Filter disabled, unhiding any filtered videos");
        const hiddenVideos = document.querySelectorAll(
          ".killthenoise-filtered"
        );
        debugLog(`Found ${hiddenVideos.length} hidden videos to restore`);

        hiddenVideos.forEach((el) => {
          el.classList.remove("killthenoise-filtered");
        });
      }

      sendResponse({
        success: true,
        status: enabled ? "Filter applied" : "Filter disabled",
        filterEnabled: enabled,
      });
    });

    return true; // Keep message channel open for async response
  }

  if (message.action === "resetCount") {
    debugLog("Reset count message received");
    processedVideos.clear();
    localRemovedCount = 0;
    sendResponse({ success: true, status: "Counter reset" });
    return true;
  }
});
