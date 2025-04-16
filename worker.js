// Web Worker for KillTheNoise filtering operations
// With improved keyword matching specifically for political terms and quoted content

let processedVideos = new Set();
let localRemovedCount = 0;
let regexCache = new Map();
let debugMode = false;

// Debug helper
function debugLog(...args) {
  if (debugMode) {
    self.postMessage({
      type: "debug",
      data: {
        message: args.join(" "),
      },
    });
  }
}

// Improved helper for keyword matching that better handles political names and quoted text
function matchesKeyword(text, keyword) {
  if (!text || !keyword) return false;

  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase().trim();

  // Simple direct match
  if (lowerText === lowerKeyword) return true;

  // Check if the keyword appears exactly at the start of the text
  if (lowerText.startsWith(lowerKeyword + " ")) return true;

  try {
    const escapedKeyword = lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Word boundary check
    const wordRegex = new RegExp(`\\b${escapedKeyword}\\b`, "i");
    if (wordRegex.test(lowerText)) return true;

    // Handle cases where punctuation might break word boundaries
    const punctRegex = new RegExp(
      `[\\s,.;:'"\`\\-()]${escapedKeyword}[\\s,.;:'"\`\\-()]|^${escapedKeyword}[\\s,.;:'"\`\\-()]|[\\s,.;:'"\`\\-()]${escapedKeyword}$|^${escapedKeyword}$`,
      "i"
    );
    if (punctRegex.test(lowerText)) return true;

    // Special handling for political names and controversial terms
    const politicalNames = ["trump", "biden", "vance", "zelensky", "putin"];
    const controversialTerms = [
      "scandal",
      "disaster",
      "crisis",
      "controversial",
    ];

    if (
      politicalNames.includes(lowerKeyword) ||
      controversialTerms.includes(lowerKeyword)
    ) {
      // Match variants like T*rump, T'rump, T-rump, T.rump
      const specialRegex = new RegExp(
        `\\b${lowerKeyword.charAt(0)}[.*'\`"\\-_]?${lowerKeyword.substring(
          1
        )}\\b`,
        "i"
      );
      if (specialRegex.test(lowerText)) return true;

      // Check for the name surrounded by quotes or other characters
      const quotedRegex = new RegExp(`['"\`]${escapedKeyword}['"\`]`, "i");
      if (quotedRegex.test(lowerText)) return true;
    }
  } catch (e) {
    debugLog(`Regex error for keyword "${keyword}":`, e.toString());
    // Fall back to basic inclusion check if regex fails
    return lowerText.includes(lowerKeyword);
  }

  // Simple substring check as fallback
  return lowerText.includes(lowerKeyword);
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
      // For political figures match at beginning of sentence/title
      startOfText: new RegExp(`^${escapedKeyword}[\\s,.;:"'\\-]`, "i"),
      // Match with quotes around keyword
      quoted: new RegExp(`["'\\-()[]{}]${escapedKeyword}["'\\-()[]{}]`, "i"),
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

// Enhanced title matching with improved handling for political content
function titleMatchesKeyword(title, keyword) {
  if (!title || !keyword) return false;

  // Use our improved general matching function first
  if (matchesKeyword(title, keyword)) return true;

  // If that fails, try the more specific regex patterns
  const lowerTitle = title.toLowerCase();
  const lowerKeyword = keyword.toLowerCase().trim();
  const regexes = getKeywordRegexes(lowerKeyword);

  if (!regexes) return lowerTitle.includes(lowerKeyword);

  // Political figures need special handling
  const isPoliticalFigure = [
    "trump",
    "biden",
    "vance",
    "zelensky",
    "putin",
  ].includes(lowerKeyword);
  const isControversialTerm = [
    "scandal",
    "disaster",
    "crisis",
    "controversial",
    "abandons",
    "blames",
  ].includes(lowerKeyword);

  // Check with all the regex patterns
  if (regexes.word.test(lowerTitle)) return true;
  if (regexes.possessiveS.test(lowerTitle)) return true;
  if (regexes.plural.test(lowerTitle)) return true;
  if (regexes.possessive.test(lowerTitle)) return true;
  if (regexes.relaxed.test(lowerTitle)) return true;
  if (regexes.enhanced.test(lowerTitle)) return true;
  if (regexes.htmlEmbedded.test(lowerTitle)) return true;
  if (regexes.obfuscated.test(lowerTitle)) return true;
  if (regexes.hidden.test(lowerTitle)) return true;
  if (regexes.quoted.test(lowerTitle)) return true;

  // For political figures, also check if they are at the start of the title
  if (isPoliticalFigure && regexes.startOfText.test(lowerTitle)) return true;

  // For political figures, be more liberal with matching
  if (isPoliticalFigure || isControversialTerm) {
    return lowerTitle.includes(lowerKeyword);
  }

  return false;
}

// Process a batch of videos against keywords and hashtags
function processVideoBatch(videos, blockKeywords, blockHashtags = []) {
  debugLog(
    `Processing ${videos.length} videos with ${blockKeywords.length} keywords`
  );

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
      // Special check for political content and other sensitive topics
      const isPoliticalContent = titleText
        .toLowerCase()
        .match(/\b(trump|biden|vance|zelensky|putin)\b/i);
      const isControversialContent = titleText
        .toLowerCase()
        .match(/\b(scandal|war|conflict|disaster|crisis|controversy)\b/i);

      // Log potentially problematic political content for debugging
      if (isPoliticalContent) {
        debugLog(`Political content detected: "${titleText}"`);
      }

      for (const keyword of blockKeywords) {
        // Use our enhanced title matching for better accuracy
        if (titleMatchesKeyword(titleText, keyword)) {
          result.filtered = true;
          result.keyword = keyword;
          result.matchType = "title match";
          localRemovedCount++;
          removedThisRun++;
          debugLog(
            `Filtered by title: "${titleText}" matched keyword "${keyword}"`
          );
          break;
        }

        // Check description
        if (descriptionText && titleMatchesKeyword(descriptionText, keyword)) {
          result.filtered = true;
          result.keyword = keyword;
          result.matchType = "description match";
          localRemovedCount++;
          removedThisRun++;
          break;
        }
      }

      // Special handling for political content
      if (!result.filtered && isPoliticalContent) {
        // Find which political figure is mentioned
        const match = titleText
          .toLowerCase()
          .match(/\b(trump|biden|vance|zelensky|putin)\b/i);
        if (
          match &&
          blockKeywords.some((k) => k.toLowerCase() === match[0].toLowerCase())
        ) {
          const politicalFigure = match[0].toLowerCase();
          debugLog(
            `Political match: "${titleText}" contains "${politicalFigure}"`
          );

          result.filtered = true;
          result.keyword = politicalFigure;
          result.matchType = "political match";
          localRemovedCount++;
          removedThisRun++;
        }
      }
    }

    results.push(result);
  }

  debugLog(`Processed ${videos.length} videos, filtered ${removedThisRun}`);

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
      debugMode = data.debugMode === true;
      debugLog("Worker initialized with debug mode:", debugMode);

      // Test the matching function with the problematic title
      const testTitle =
        "Trump 'abandons' Ukrainians by blaming Zelensky for war outbreak";
      const matched = titleMatchesKeyword(testTitle, "trump");
      debugLog(`TEST: Title "${testTitle}" matches "trump": ${matched}`);
      break;

    case "processVideos":
      // Process video batch
      const { videos, keywords, hashtags } = data;
      debugLog(
        `Processing ${videos.length} videos against ${
          keywords.length
        } keywords and ${hashtags?.length || 0} hashtags`
      );

      const result = processVideoBatch(videos, keywords, hashtags || []);

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
      debugMode = data.debugMode === true;
      debugLog("Debug mode updated:", debugMode);
      break;

    case "testMatching":
      // Special case to test matching
      const { title, keyword } = data;
      const matchResult = titleMatchesKeyword(title, keyword);
      debugLog(
        `Test matching: "${title}" with "${keyword}" - Result: ${matchResult}`
      );
      self.postMessage({
        type: "testMatchingResult",
        data: { title, keyword, matches: matchResult },
      });
      break;
  }
});
