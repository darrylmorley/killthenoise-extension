// Web Worker for KillTheNoise filtering operations
// This worker handles the CPU-intensive filtering tasks to avoid blocking the main thread

let processedVideos = new Set();
let localRemovedCount = 0;
let regexCache = new Map();
let debugMode = false;

// Debug helper - always sends back debug info during troubleshooting
function debugLog(...args) {
  // Create message string
  const message = args
    .map((arg) => {
      if (typeof arg === "object") {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return "[Object]";
        }
      }
      return String(arg);
    })
    .join(" ");

  // Send debug message back to main thread
  self.postMessage({
    type: "debug",
    data: { message },
  });
}

// Helper to create regex patterns for a keyword
function createKeywordRegexes(keyword) {
  try {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return {
      // Standard word boundary match
      word: new RegExp(`\\b${escapedKeyword}\\b`, "i"),
      // Possessive form
      possessiveS: new RegExp(`\\b${escapedKeyword}'s\\b`, "i"),
      // Plural form
      plural: new RegExp(`\\b${escapedKeyword}s\\b`, "i"),
      // Possessive form without 's
      possessive: new RegExp(`\\b${escapedKeyword}'\\b`, "i"),
      // Relaxed match for any occurrence (without word boundaries)
      anywhere: new RegExp(escapedKeyword, "i"),
      // Match with characters on either side to catch formatting issues
      relaxed: new RegExp(`[\\s,.;:"'\\-]${escapedKeyword}[\\s,.;:"'\\-]`, "i"),
      // Enhanced political name matching (for cases like T.rump, T-rump, T r u m p, etc.)
      enhanced: new RegExp(
        `\\b${escapedKeyword.charAt(0)}[.\\s\\-_]*${escapedKeyword.substring(
          1
        )}\\b`,
        "i"
      ),
      // Match inside HTML tags that might be rendered
      htmlEmbedded: new RegExp(`>([^<]*?)${escapedKeyword}([^<]*?)<`, "i"),
      // Special obfuscated version for catching deliberate misspellings (like Tr*mp, Tr_mp, etc)
      obfuscated: new RegExp(
        `\\b${escapedKeyword.charAt(0)}[^\\s]{0,1}${escapedKeyword.substring(
          1,
          escapedKeyword.length / 2
        )}[^\\s]{0,1}${escapedKeyword.substring(escapedKeyword.length / 2)}\\b`,
        "i"
      ),
      // Match with zero-width spaces or hidden characters
      hidden: new RegExp(
        `\\b${escapedKeyword
          .split("")
          .join("[\\s\\u200B\\u200C\\u200D\\uFEFF]*")}\\b`,
        "i"
      ),
    };
  } catch (e) {
    debugLog(`Error creating regex for "${keyword}":`, e.toString());
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
  debugLog(`Starting to process ${videos.length} videos in worker`);

  if (blockKeywords.length > 0) {
    debugLog(
      `Using keywords: ${blockKeywords.slice(0, 5).join(", ")}${
        blockKeywords.length > 5 ? "..." : ""
      }`
    );
  }

  if (blockHashtags && blockHashtags.length > 0) {
    debugLog(`Using hashtags: ${blockHashtags.join(", ")}`);
  }

  const results = [];
  let removedThisRun = 0;

  // Debug: log first video for verification
  if (videos.length > 0) {
    const firstVideo = videos[0];
    debugLog(
      `First video in batch: "${firstVideo.titleText}" (ID: ${firstVideo.videoId})`
    );
  }

  for (const video of videos) {
    const {
      videoId,
      titleText,
      descriptionText,
      hashtags = [],
      badges = [],
      channelName = "",
    } = video;

    // Skip invalid videos
    if (!videoId || !titleText) {
      debugLog(`Skipping invalid video: missing ID or title`);
      continue;
    }

    // Skip if we've already processed this video
    if (processedVideos.has(videoId)) {
      continue;
    }

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
          debugLog(
            `Filtered video by hashtag: "${titleText}" (hashtag match: ${blockHashtag})`
          );
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
            debugLog(
              `Filtered video by badge: "${titleText}" (badge match: ${keyword})`
            );
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
          debugLog(
            `Filtered video by channel: "${titleText}" (channel match: ${keyword})`
          );
          break;
        }
      }
    }

    // If not filtered by hashtag, badge, or channel name, check title and description keywords
    if (!result.filtered) {
      const lowerTitle = titleText.toLowerCase();
      const lowerDesc = descriptionText ? descriptionText.toLowerCase() : "";

      for (const keyword of blockKeywords) {
        const lowerKeyword = keyword.toLowerCase().trim();
        let matched = false;
        let matchType = "";

        // For single words, use cached regex patterns
        if (lowerKeyword.indexOf(" ") === -1) {
          const regexes = getKeywordRegexes(lowerKeyword);

          if (regexes) {
            // First try strict word boundary matches in title
            if (
              regexes.word.test(lowerTitle) ||
              regexes.possessiveS.test(lowerTitle) ||
              regexes.plural.test(lowerTitle) ||
              regexes.possessive.test(lowerTitle)
            ) {
              matched = true;
              matchType = "title word match";
            }
            // Then try relaxed matches in title
            else if (
              regexes.relaxed.test(lowerTitle) ||
              regexes.anywhere.test(lowerTitle)
            ) {
              matched = true;
              matchType = "title relaxed match";
            }
            // Check description with regexes if available
            else if (
              lowerDesc &&
              (regexes.word.test(lowerDesc) ||
                regexes.possessiveS.test(lowerDesc) ||
                regexes.plural.test(lowerDesc) ||
                regexes.possessive.test(lowerDesc))
            ) {
              matched = true;
              matchType = "description word match";
            }
            // Try relaxed description matches
            else if (
              lowerDesc &&
              (regexes.relaxed.test(lowerDesc) ||
                regexes.anywhere.test(lowerDesc))
            ) {
              matched = true;
              matchType = "description relaxed match";
            }
            // Check enhanced political name matching
            else if (
              regexes.enhanced.test(lowerTitle) ||
              (lowerDesc && regexes.enhanced.test(lowerDesc))
            ) {
              matched = true;
              matchType = "enhanced political name match";
            }
            // Check HTML embedded matches
            else if (
              regexes.htmlEmbedded.test(lowerTitle) ||
              (lowerDesc && regexes.htmlEmbedded.test(lowerDesc))
            ) {
              matched = true;
              matchType = "HTML embedded match";
            }
            // Check obfuscated matches
            else if (
              regexes.obfuscated.test(lowerTitle) ||
              (lowerDesc && regexes.obfuscated.test(lowerDesc))
            ) {
              matched = true;
              matchType = "obfuscated match";
            }
            // Check hidden matches
            else if (
              regexes.hidden.test(lowerTitle) ||
              (lowerDesc && regexes.hidden.test(lowerDesc))
            ) {
              matched = true;
              matchType = "hidden match";
            }
          } else {
            // Fall back to simple inclusion if regex creation failed
            if (lowerTitle.includes(lowerKeyword)) {
              matched = true;
              matchType = "title simple match";
            } else if (lowerDesc && lowerDesc.includes(lowerKeyword)) {
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
          } else if (lowerDesc && lowerDesc.includes(lowerKeyword)) {
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
          debugLog(`Filtered video: "${titleText}" (${matchType}: ${keyword})`);
          break;
        }
      }
    }

    results.push(result);
  }

  debugLog(
    `Worker processed ${videos.length} videos, filtered ${removedThisRun} videos`
  );

  // Additional debugging for when no videos are filtered
  if (removedThisRun === 0 && videos.length > 0) {
    debugLog("No videos filtered in this batch. First few titles:");
    videos.slice(0, 3).forEach((video, i) => {
      debugLog(`- Video ${i + 1}: "${video.titleText}"`);
    });

    if (blockKeywords.length > 0) {
      debugLog("First few keywords:");
      blockKeywords.slice(0, 5).forEach((keyword, i) => {
        debugLog(`- Keyword ${i + 1}: "${keyword}"`);
      });
    }
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
const cleanupInterval = setInterval(cleanupProcessedVideos, 60000); // Every minute

// Listen for messages from the main thread
self.addEventListener("message", function (e) {
  try {
    const { type, data } = e.data;

    debugLog(`Worker received message type: ${type}`);

    switch (type) {
      case "init":
        // Initialize worker with settings
        debugMode = data.debugMode === true;
        debugLog("Worker initialized with debug mode:", debugMode);
        break;

      case "processVideos":
        // Process video batch
        if (!data) {
          debugLog("ERROR: Received processVideos message without data");
          break;
        }

        const { videos, keywords, hashtags } = data;

        if (!videos || !Array.isArray(videos)) {
          debugLog("ERROR: videos is not an array or is missing");
          break;
        }

        if (!keywords || !Array.isArray(keywords)) {
          debugLog("ERROR: keywords is not an array or is missing");
          break;
        }

        try {
          debugLog(
            `Processing ${videos.length} videos against ${
              keywords.length
            } keywords and ${hashtags?.length || 0} hashtags`
          );

          const result = processVideoBatch(videos, keywords, hashtags || []);

          debugLog(
            `Sending processing results back to main thread: ${result.removedCount} videos filtered`
          );

          self.postMessage({
            type: "processingComplete",
            data: result,
          });
        } catch (processingError) {
          debugLog(
            "ERROR processing videos in worker:",
            processingError.toString()
          );
          // Send empty result to avoid breaking the main thread
          self.postMessage({
            type: "processingComplete",
            data: {
              results: [],
              removedCount: 0,
              totalRemoved: localRemovedCount,
              error: processingError.toString(),
            },
          });
        }
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
        debugMode = data.debugMode === true;
        debugLog("Debug mode updated:", debugMode);
        break;

      default:
        debugLog(`Unknown message type received: ${type}`);
        break;
    }
  } catch (error) {
    debugLog("ERROR in worker message handler:", error.toString());
    // Send error report to main thread
    self.postMessage({
      type: "debug",
      data: {
        message: `ERROR in worker: ${error.toString()}`,
      },
    });
  }
});

// Self-test to ensure worker is functioning
setTimeout(() => {
  debugLog("Worker self-test: Processing test video");

  const testVideo = {
    videoId: "test-id-123",
    titleText: "Test Video with EXPOSED scandal disaster",
    descriptionText: "This is a test description",
    hashtags: ["#test"],
    badges: [],
    channelName: "Test Channel",
  };

  const testKeywords = ["exposed", "disaster", "scandal"];

  const result = processVideoBatch([testVideo], testKeywords, []);

  if (result.removedCount > 0) {
    debugLog("Worker self-test: Successfully filtered test video");
  } else {
    debugLog(
      "Worker self-test: Failed to filter test video that should match keywords"
    );
  }
}, 100);

// Send initial ready message
self.postMessage({
  type: "debug",
  data: {
    message: "Worker initialized and ready to process videos",
  },
});
