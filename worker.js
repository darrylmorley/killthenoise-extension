// Web Worker for KillTheNoise filtering operations
// This worker handles the CPU-intensive filtering tasks to avoid blocking the main thread

let processedVideos = new Set();
let localRemovedCount = 0;
let regexCache = new Map();

// Debug helper
function debugLog(...args) {
  // Send debug message back to main thread
  if (self.debugMode) {
    self.postMessage({
      type: "debug",
      data: {
        message: args.join(" "),
      },
    });
  }
}

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

// Process a batch of videos against keywords and hashtags
function processVideoBatch(videos, blockKeywords, blockHashtags = []) {
  const results = [];
  let removedThisRun = 0;

  for (const video of videos) {
    const {
      videoId,
      titleText,
      descriptionText,
      hashtags = [],
      badges = [],
      channelName = "",
    } = video;

    // Skip if we've already processed this video
    if (processedVideos.has(videoId)) continue;

    // Mark as processed
    processedVideos.add(videoId);

    // Initialize result - will be updated if filtered
    const result = {
      videoId: videoId,
      filtered: false,
      keyword: null,
      matchType: null,
    };

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
          result.filtered = true;
          result.keyword = blockHashtag;
          result.matchType = "hashtag match";
          localRemovedCount++;
          removedThisRun++;
          break;
        }
      }
    }

    // Check if any badges match blocked keywords
    if (!result.filtered && badges && badges.length > 0) {
      for (const badge of badges) {
        const lowerBadge = badge.toLowerCase().trim();

        for (const keyword of blockKeywords) {
          const lowerKeyword = keyword.toLowerCase().trim();

          if (
            lowerBadge === lowerKeyword ||
            lowerBadge.includes(lowerKeyword)
          ) {
            result.filtered = true;
            result.keyword = keyword;
            result.matchType = "badge match";
            localRemovedCount++;
            removedThisRun++;
            break;
          }
        }

        if (result.filtered) break;
      }
    }

    // Check if channel name matches blocked keywords
    if (!result.filtered && channelName) {
      const lowerChannelName = channelName.toLowerCase();

      for (const keyword of blockKeywords) {
        const lowerKeyword = keyword.toLowerCase().trim();

        // For channel names, we'll use simple inclusion rather than word boundary checks
        if (
          lowerChannelName === lowerKeyword ||
          lowerChannelName.includes(lowerKeyword)
        ) {
          result.filtered = true;
          result.keyword = keyword;
          result.matchType = "channel match";
          localRemovedCount++;
          removedThisRun++;
          break;
        }
      }
    }

    // If not filtered by hashtag, badge, or channel name, check title and description keywords
    if (!result.filtered) {
      const lowerTitle = titleText.toLowerCase();

      for (const keyword of blockKeywords) {
        const lowerKeyword = keyword.toLowerCase().trim();
        let matched = false;
        let matchType = "";

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
            // Fall back to simple inclusion if regex creation failed
            if (lowerTitle.includes(lowerKeyword)) {
              matched = true;
              matchType = "title simple match";
            } else if (
              descriptionText &&
              descriptionText.includes(lowerKeyword)
            ) {
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
          } else if (
            descriptionText &&
            descriptionText.includes(lowerKeyword)
          ) {
            matched = true;
            matchType = "description phrase match";
          }
        }

        if (matched) {
          result.filtered = true;
          result.keyword = keyword;
          result.matchType = matchType;
          localRemovedCount++;
          removedThisRun++;
          break;
        }
      }
    }

    results.push(result);
  }

  return {
    results,
    removedCount: removedThisRun,
    totalRemoved: localRemovedCount,
  };
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

// Set up regular cleanup
setInterval(cleanupProcessedVideos, 60000); // Every minute

// Listen for messages from the main thread
self.addEventListener("message", function (e) {
  const { type, data } = e.data;

  switch (type) {
    case "init":
      // Initialize worker with settings
      self.debugMode = data.debugMode === true;
      debugLog("Worker initialized with debug mode:", self.debugMode);
      break;

    case "processVideos":
      // Process video batch
      const { videos, keywords, hashtags } = data;
      debugLog(
        `Processing ${videos.length} videos against ${keywords.length} keywords and ${hashtags.length} hashtags`
      );
      const result = processVideoBatch(videos, keywords, hashtags);
      self.postMessage({
        type: "processingComplete",
        data: result,
      });
      break;

    case "resetProcessedVideos":
      // Reset processed videos
      processedVideos.clear();
      localRemovedCount = 0;
      debugLog("Processed videos reset");
      self.postMessage({
        type: "resetComplete",
      });
      break;

    case "updateDebugMode":
      // Update debug mode
      self.debugMode = data.debugMode === true;
      debugLog("Debug mode updated:", self.debugMode);
      break;
  }
});
