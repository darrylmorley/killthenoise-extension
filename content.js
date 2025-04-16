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
          "[KillTheNoise] Extension context error:",
          chrome.runtime.lastError
        );
        return;
      }

      if (result.debugMode === true) {
        console.log("[KillTheNoise]", ...args);
      }
    });
  } catch (error) {
    // If chrome.storage is not available, extension might be reloading
    console.log("[KillTheNoise] Error accessing chrome APIs:", error);
  }
}

// Local tracking variables for main thread processing (fallback mode)
let processedVideosMainThread = new Set();
let regexCacheMainThread = new Map();

// Helper to create regex patterns for a keyword (for main thread fallback)
function createKeywordRegexesMainThread(keyword) {
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

// Get (or create and cache) regex patterns for keyword in main thread
function getKeywordRegexesMainThread(keyword) {
  const lowerKeyword = keyword.toLowerCase().trim();
  if (!regexCacheMainThread.has(lowerKeyword)) {
    regexCacheMainThread.set(
      lowerKeyword,
      createKeywordRegexesMainThread(lowerKeyword)
    );
  }
  return regexCacheMainThread.get(lowerKeyword);
}

// Process a single video against keywords and hashtags in main thread (fallback)
function processVideoMainThread(video, blockKeywords, blockHashtags = []) {
  const { videoId, titleText, descriptionText, hashtags = [] } = video;

  // Skip if we've already processed this video
  if (processedVideosMainThread.has(videoId)) return false;

  // Mark as processed
  processedVideosMainThread.add(videoId);

  // First check hashtags if enabled
  if (
    blockHashtags &&
    blockHashtags.length > 0 &&
    hashtags &&
    hashtags.length > 0
  ) {
    for (const blockHashtag of blockHashtags) {
      const lowerBlockHashtag = blockHashtag.toLowerCase().trim();

      // Check if any of the video's hashtags match the blocked hashtag
      const matchingHashtag = hashtags.find((tag) => {
        // Handle both with and without # prefix
        const normalizedTag = tag.startsWith("#")
          ? tag.toLowerCase()
          : `#${tag.toLowerCase()}`;
        const normalizedBlockTag = lowerBlockHashtag.startsWith("#")
          ? lowerBlockHashtag
          : `#${lowerBlockHashtag}`;
        return normalizedTag === normalizedBlockTag;
      });

      if (matchingHashtag) {
        debugLog(
          `Filtered video by hashtag: "${titleText}" (hashtag match: ${blockHashtag})`
        );
        return {
          filtered: true,
          keyword: blockHashtag,
          matchType: "hashtag match",
        };
      }
    }
  }

  // Check video against keywords
  const lowerTitle = titleText.toLowerCase();

  for (const keyword of blockKeywords) {
    const lowerKeyword = keyword.toLowerCase().trim();
    let matched = false;
    let matchType = "";

    // For single words, use regex patterns
    if (lowerKeyword.indexOf(" ") === -1) {
      const regexes = getKeywordRegexesMainThread(lowerKeyword);

      if (regexes) {
        // Check title with regexes
        if (
          regexes.word.test(lowerTitle) ||
          regexes.possessiveS.test(lowerTitle) ||
          regexes.plural.test(lowerTitle) ||
          regexes.possessive.test(lowerTitle)
        ) {
          matched = true;
          matchType = "title word match";
        }
        // Check description with regexes if available
        else if (
          descriptionText &&
          (regexes.word.test(descriptionText) ||
            regexes.possessiveS.test(descriptionText) ||
            regexes.plural.test(descriptionText) ||
            regexes.possessive.test(descriptionText))
        ) {
          matched = true;
          matchType = "description word match";
        }
      } else {
        // Fall back to simple inclusion
        if (lowerTitle.includes(lowerKeyword)) {
          matched = true;
          matchType = "title simple match";
        } else if (descriptionText && descriptionText.includes(lowerKeyword)) {
          matched = true;
          matchType = "description simple match";
        }
      }
    }
    // For phrases, use simple inclusion
    else {
      if (lowerTitle.includes(lowerKeyword)) {
        matched = true;
        matchType = "title phrase match";
      } else if (descriptionText && descriptionText.includes(lowerKeyword)) {
        matched = true;
        matchType = "description phrase match";
      }
    }

    if (matched) {
      debugLog(`Filtered video: "${titleText}" (${matchType}: ${keyword})`);
      return { filtered: true, keyword, matchType };
    }
  }

  return { filtered: false };
}

// Periodically clean up the main thread Set to manage memory (fallback mode)
function cleanupMainThreadCache() {
  // Clean up processedVideosMainThread
  if (processedVideosMainThread.size > 1000) {
    const entries = Array.from(processedVideosMainThread);
    const toKeep = entries.slice(-500);
    processedVideosMainThread.clear();
    toKeep.forEach((id) => processedVideosMainThread.add(id));
    debugLog(
      `Cleaned up main thread cache: ${entries.length} → ${processedVideosMainThread.size}`
    );
  }
}

// Create and initialize the web worker
let filterWorker = null;
let isWorkerReady = false;

// Function to initialize the worker
function initWorker() {
  try {
    // Get the worker script URL - this returns a string, not a Promise
    const workerURL = chrome.runtime.getURL("worker.js");

    // Fetch the worker code
    fetch(workerURL)
      .then((response) => response.text())
      .then((workerCode) => {
        // Create a blob URL for the worker
        const blob = new Blob([workerCode], { type: "text/javascript" });
        const blobURL = URL.createObjectURL(blob);

        // Create new worker using the blob URL
        filterWorker = new Worker(blobURL);

        // Setup message handler
        filterWorker.onmessage = function (e) {
          try {
            const { type, data } = e.data;

            switch (type) {
              case "debug":
                // Forward debug messages from worker
                if (data && typeof data.message === "string") {
                  debugLog("[Worker]", data.message);
                } else {
                  // Handle case where message might not be in expected format
                  debugLog(
                    "[Worker] Debug message received in unexpected format:",
                    data
                  );
                }
                break;

              case "processingComplete":
                // Process the results from the worker
                if (data) {
                  handleWorkerResults(data);
                } else {
                  debugLog("[Worker] Processing complete but no data received");
                }
                break;

              case "resetComplete":
                debugLog("Worker finished resetting processed videos");
                break;

              default:
                debugLog("[Worker] Unknown message type received:", type, data);
                break;
            }
          } catch (error) {
            console.error(
              "[KillTheNoise] Error handling worker message:",
              error,
              e.data
            );
          }
        };

        // Initialize worker with current settings
        chrome.storage.sync.get(["debugMode"], (result) => {
          filterWorker.postMessage({
            type: "init",
            data: {
              debugMode: result.debugMode === true,
            },
          });
          isWorkerReady = true;
          debugLog("Web worker initialized");
        });

        // Clean up the blob URL when we're done with it
        // URL.revokeObjectURL(blobURL); // Don't revoke while worker is active
      })
      .catch((error) => {
        console.error("Error initializing worker:", error);
        // Fallback to main thread processing in case of error
        isWorkerReady = false;
        debugLog(
          "Web worker initialization failed, using main thread fallback"
        );
      });
  } catch (error) {
    console.error("Web worker creation failed:", error);
    isWorkerReady = false;
    debugLog("Web worker creation failed, using main thread fallback");
  }
}

// Handle filtered results from worker
function handleWorkerResults(data) {
  const { results, removedCount } = data;

  // Apply filtering to DOM elements
  results.forEach((result) => {
    if (result.filtered) {
      // Find the element by videoId
      const videoId = result.videoId;

      // Find the element using a data attribute we'll set when collecting videos
      const el = document.querySelector(`[data-killthenoise-id="${videoId}"]`);
      if (el) {
        el.classList.add("killthenoise-filtered");
        debugLog(
          `Filtered video with ID ${videoId} (${result.matchType}: ${result.keyword})`
        );
      }
    }
  });

  // Update count if any videos were removed
  if (removedCount > 0) {
    updateFilteredCount(removedCount);
  }
}

// Add CSS style for hiding filtered videos
function addHidingStyle() {
  if (document.getElementById("killthenoise-style")) return;

  const style = document.createElement("style");
  style.id = "killthenoise-style";
  style.textContent = `
    .killthenoise-filtered { display: none !important; }
    [data-killthenoise-processed] { } /* Marker for processed videos */
  `;
  document.head.appendChild(style);
  debugLog("Added CSS style for hiding videos");
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

// Parse title and description from an element
function parseVideoData(el) {
  // Get title text
  const titleEl =
    el.querySelector("#video-title") ||
    el.querySelector("h3 yt-formatted-string#video-title") ||
    el.querySelector("h3");
  if (!titleEl) return null;

  const titleText = titleEl.textContent.trim();

  // Get description text if available
  const descriptionEl = el.querySelector(
    "#description-text, .metadata-snippet-text, yt-formatted-string.metadata-snippet-text"
  );
  const descriptionText = descriptionEl ? descriptionEl.textContent.trim() : "";

  // Get channel name
  const channelNameEl =
    el.querySelector("ytd-channel-name yt-formatted-string#text a") ||
    el.querySelector("#channel-name yt-formatted-string");
  const channelName = channelNameEl ? channelNameEl.textContent.trim() : "";

  // Get view count
  const viewCountEl = el.querySelector(
    "#metadata-line span.inline-metadata-item:first-child"
  );
  const viewCountText = viewCountEl ? viewCountEl.textContent.trim() : "";

  // Get publish time
  const publishTimeEl = el.querySelector(
    "#metadata-line span.inline-metadata-item:nth-child(2)"
  );
  const publishTimeText = publishTimeEl ? publishTimeEl.textContent.trim() : "";

  // Get video duration
  const durationEl =
    el.querySelector("ytd-thumbnail-overlay-time-status-renderer span#text") ||
    el.querySelector(
      "ytd-thumbnail-overlay-time-status-renderer .badge-shape-wiz__text"
    );
  const duration = durationEl ? durationEl.textContent.trim() : "";

  // Extract hashtags from title and description
  const hashtags = [];

  // Extract hashtags from title (looking for #word pattern)
  const titleHashtags = titleText.match(/#[\w\u00C0-\u017F]+/g);
  if (titleHashtags) {
    titleHashtags.forEach((tag) => {
      if (!hashtags.includes(tag.toLowerCase())) {
        hashtags.push(tag.toLowerCase());
      }
    });
  }

  // Extract hashtags from description
  const descHashtags = descriptionText.match(/#[\w\u00C0-\u017F]+/g);
  if (descHashtags) {
    descHashtags.forEach((tag) => {
      if (!hashtags.includes(tag.toLowerCase())) {
        hashtags.push(tag.toLowerCase());
      }
    });
  }

  // Look for actual hashtag links in the video card
  const hashtagElements = el.querySelectorAll('a[href^="/hashtag/"]');
  if (hashtagElements.length > 0) {
    hashtagElements.forEach((tagEl) => {
      const tagText = `#${tagEl.textContent
        .trim()
        .replace(/^#/, "")}`.toLowerCase();
      if (!hashtags.includes(tagText)) {
        hashtags.push(tagText);
      }
    });
  }

  // Extract video ID from href attribute
  let videoId = "";
  const thumbnailLink = el.querySelector("a#thumbnail");
  if (thumbnailLink && thumbnailLink.href) {
    const match = thumbnailLink.href.match(/(?:v=|\/)([\w-]{11})(?:\?|&|\/|$)/);
    if (match) videoId = match[1];
  }

  // Look for badges like "New" or "Live"
  const badges = [];
  const badgeElements = el.querySelectorAll(
    "ytd-badge-supported-renderer #badge"
  );
  badgeElements.forEach((badge) => {
    if (badge.textContent) {
      badges.push(badge.textContent.trim());
    }
  });

  return {
    titleText,
    descriptionText,
    channelName,
    viewCountText,
    publishTimeText,
    duration,
    videoId,
    badges,
    hashtags,
  };
}

function cleanYouTubeFeed(blockKeywords, blockHashtags) {
  // Check if worker failed to initialize and we need to use fallback
  if (!filterWorker) {
    debugLog("Web worker unavailable, using main thread fallback");
    isWorkerReady = false;
  }

  const videoElements = document.querySelectorAll(
    "ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer"
  );

  debugLog(`Checking ${videoElements.length} video elements`);

  // Process in smaller batches to avoid collecting too much data at once
  const batchSize = 20;
  let currentBatch = 0;
  let removedThisRun = 0;

  function processBatch() {
    const end = Math.min(currentBatch + batchSize, videoElements.length);
    const videoBatch = [];

    // Collect video data to send to worker or process on main thread
    for (let i = currentBatch; i < end; i++) {
      const el = videoElements[i];

      // Skip already processed elements
      if (el.hasAttribute("data-killthenoise-processed")) continue;

      // Mark as processed in DOM
      const videoId = getVideoId(el);
      el.setAttribute("data-killthenoise-id", videoId);
      el.setAttribute("data-killthenoise-processed", "true");

      // Get video data
      const videoData = parseVideoData(el);
      if (videoData) {
        videoBatch.push({
          videoId,
          ...videoData,
          element: el, // Only used for main thread processing
        });
      }
    }

    currentBatch = end;

    // Process videos if we have any
    if (videoBatch.length > 0) {
      if (filterWorker && isWorkerReady) {
        // Worker mode: Send to web worker
        filterWorker.postMessage({
          type: "processVideos",
          data: {
            videos: videoBatch.map(({ element, ...video }) => video), // Remove element reference for worker
            keywords: blockKeywords,
            hashtags: blockHashtags,
          },
        });
      } else {
        // Fallback mode: Process on main thread
        debugLog(`Processing ${videoBatch.length} videos on main thread`);
        let batchRemovedCount = 0;

        videoBatch.forEach((video) => {
          const { videoId, element } = video;
          const result = processVideoMainThread(
            video,
            blockKeywords,
            blockHashtags
          );

          if (result.filtered) {
            element.classList.add("killthenoise-filtered");
            batchRemovedCount++;
            removedThisRun++;
          }
        });

        // Update the removed count after each batch in fallback mode
        if (batchRemovedCount > 0) {
          debugLog(
            `Filtered ${batchRemovedCount} videos in this batch on main thread`
          );
        }
      }
    }

    // Process next batch if needed
    if (currentBatch < videoElements.length) {
      setTimeout(processBatch, 0);
    } else if (removedThisRun > 0 && (!filterWorker || !isWorkerReady)) {
      // Update the filtered count when done (only for main thread mode)
      updateFilteredCount(removedThisRun);

      // Clean up main thread cache periodically
      cleanupMainThreadCache();
    }
  }

  // Start processing batches
  processBatch();
}

// Separate function to update the filtered count
function updateFilteredCount(count) {
  try {
    chrome.storage.sync.get(["filteredCount"], (result) => {
      if (chrome.runtime.lastError) {
        console.log(
          "[KillTheNoise] Error updating count:",
          chrome.runtime.lastError
        );
        return;
      }

      const currentCount = result.filteredCount || 0;
      const newCount = currentCount + count;

      chrome.storage.sync.set({ filteredCount: newCount }, () => {
        if (chrome.runtime.lastError) {
          console.log(
            "[KillTheNoise] Error saving updated count:",
            chrome.runtime.lastError
          );
          return;
        }
        debugLog(`Updated filtered count: ${currentCount} → ${newCount}`);
      });
    });
  } catch (error) {
    console.log("[KillTheNoise] Error in updateFilteredCount:", error);
  }
}

// Main filter function
function runFilter() {
  try {
    chrome.storage.sync.get(
      ["blockKeywords", "blockHashtags", "filterEnabled", "debugMode"],
      (result) => {
        if (chrome.runtime.lastError) {
          console.log(
            "[KillTheNoise] Error retrieving settings:",
            chrome.runtime.lastError
          );
          return;
        }

        debugLog("Filter state:", result.filterEnabled);

        if (result.filterEnabled === false) {
          debugLog("Filter is disabled, skipping");
          return;
        }

        // Update worker debug mode if needed
        if (filterWorker && isWorkerReady) {
          filterWorker.postMessage({
            type: "updateDebugMode",
            data: { debugMode: result.debugMode },
          });
        } else {
          // Log fallback mode
          debugLog("Using main thread fallback for filtering");
        }

        const blockKeywords = result.blockKeywords || DEFAULT_KEYWORDS;
        const blockHashtags = result.blockHashtags || [];

        debugLog("Running filter with keywords:", blockKeywords);
        debugLog("Running filter with hashtags:", blockHashtags);

        // Store current settings for intersection observer
        currentKeywords = blockKeywords;
        currentHashtags = blockHashtags;

        cleanYouTubeFeed(blockKeywords, blockHashtags);
      }
    );
  } catch (error) {
    console.log("[KillTheNoise] Error in runFilter:", error);
  }
}

// Initialize on page load
debugLog("Content script loaded");
setTimeout(() => {
  // Add CSS style for hiding videos
  addHidingStyle();

  // Initialize web worker
  initWorker();

  // Run the filter
  runFilter();

  // Report current stats
  chrome.storage.sync.get(["filteredCount", "filterEnabled"], (result) => {
    debugLog("Current storage state:", result);
  });
}, 1000); // Slight delay to ensure page is loaded

// Add IntersectionObserver to only process videos that become visible
let currentKeywords = DEFAULT_KEYWORDS;
let currentHashtags = [];
const visibilityObserver = new IntersectionObserver(
  (entries) => {
    // Collect elements that need processing
    const elementsToProcess = [];

    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target;

        // Skip already processed elements
        if (el.hasAttribute("data-killthenoise-processed")) {
          visibilityObserver.unobserve(el);
          return;
        }

        // Add to batch to process
        elementsToProcess.push(el);

        // Stop observing
        visibilityObserver.unobserve(el);
      }
    });

    // Process batch if we have elements and worker is ready
    if (elementsToProcess.length > 0) {
      const videoBatch = [];

      // Collect video data
      elementsToProcess.forEach((el) => {
        const videoId = getVideoId(el);
        el.setAttribute("data-killthenoise-id", videoId);
        el.setAttribute("data-killthenoise-processed", "true");

        const videoData = parseVideoData(el);
        if (videoData) {
          videoBatch.push({
            videoId,
            ...videoData,
          });
        }
      });

      // Send to worker
      if (filterWorker && isWorkerReady) {
        filterWorker.postMessage({
          type: "processVideos",
          data: {
            videos: videoBatch,
            keywords: currentKeywords,
            hashtags: currentHashtags,
          },
        });
      } else {
        // Fallback to main thread processing
        videoBatch.forEach((video) => {
          const result = processVideoMainThread(
            video,
            currentKeywords,
            currentHashtags
          );
          if (result.filtered) {
            const el = document.querySelector(
              `[data-killthenoise-id="${video.videoId}"]`
            );
            if (el) {
              el.classList.add("killthenoise-filtered");
              debugLog(
                `Filtered video with ID ${video.videoId} (${result.matchType}: ${result.keyword})`
              );
            }
          }
        });
      }
    }
  },
  { rootMargin: "200px" }
);

// Observe new elements for visibility
function observeNewElements() {
  const videoElements = document.querySelectorAll(
    "ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer"
  );

  videoElements.forEach((el) => {
    if (!el.hasAttribute("data-killthenoise-processed")) {
      visibilityObserver.observe(el);
    }
  });
}

// Add mutation observer to watch for new videos
const observer = new MutationObserver(() => {
  // Don't run on every tiny mutation, use the debounced approach
  if (observer.timeout) {
    clearTimeout(observer.timeout);
  }

  observer.timeout = setTimeout(() => {
    observeNewElements();
  }, 500);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    debugLog("Message received:", message);

    if (message.action === "toggleFilter") {
      const enabled = message.enabled === true; // Ensure we have a boolean
      debugLog("Toggle filter message received. Enabled:", enabled);

      // Update our local filter state
      chrome.storage.sync.set({ filterEnabled: enabled }, () => {
        if (chrome.runtime.lastError) {
          console.log(
            "[KillTheNoise] Error updating filter state:",
            chrome.runtime.lastError
          );
          sendResponse({ success: false, error: "Extension context error" });
          return;
        }

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

      // Reset in worker
      if (filterWorker && isWorkerReady) {
        filterWorker.postMessage({
          type: "resetProcessedVideos",
        });
      }

      // Reset in UI
      document
        .querySelectorAll("[data-killthenoise-processed]")
        .forEach((el) => {
          el.removeAttribute("data-killthenoise-processed");
          el.removeAttribute("data-killthenoise-id");
          el.classList.remove("killthenoise-filtered");
        });

      sendResponse({ success: true, status: "Counter reset" });
      return true;
    }
  } catch (error) {
    console.log("[KillTheNoise] Error handling message:", error);
    sendResponse({ success: false, error: "Extension context error" });
    return true;
  }
});
