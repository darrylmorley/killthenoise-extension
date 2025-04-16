// Regular settings elements
const keywordsTextarea = document.getElementById("keywords");
const hashtagsTextarea = document.getElementById("hashtags");
const saveButton = document.getElementById("save");
const statusElement = document.getElementById("status");

// Debug mode toggle
const debugToggle = document.getElementById("debugToggle");

// Load existing settings
chrome.storage.sync.get(
  ["blockKeywords", "blockHashtags", "debugMode"],
  (result) => {
    // Load keywords into textarea
    if (result.blockKeywords) {
      keywordsTextarea.value = result.blockKeywords.join("\n");
    }

    // Load hashtags into textarea
    if (result.blockHashtags) {
      hashtagsTextarea.value = result.blockHashtags.join("\n");
    }

    // Set debug toggle state
    debugToggle.checked = result.debugMode === true;
  }
);

// Save settings
saveButton.addEventListener("click", () => {
  // Process keywords
  const keywords = keywordsTextarea.value
    .split("\n")
    .map((k) => k.trim())
    .filter((k) => k);

  // Process hashtags (normalize to include # if needed)
  const hashtags = hashtagsTextarea.value
    .split("\n")
    .map((tag) => {
      const trimmed = tag.trim();
      if (!trimmed) return "";
      return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    })
    .filter((tag) => tag);

  // Save both keywords and hashtags
  chrome.storage.sync.set(
    {
      blockKeywords: keywords,
      blockHashtags: hashtags,
    },
    () => {
      statusElement.textContent = "Settings saved!";
      setTimeout(() => {
        statusElement.textContent = "";
      }, 2000);
    }
  );
});

// Handle debug toggle changes
debugToggle.addEventListener("change", () => {
  const debugEnabled = debugToggle.checked;

  chrome.storage.sync.set({ debugMode: debugEnabled }, () => {
    // Show brief confirmation
    statusElement.textContent = `Debug mode ${
      debugEnabled ? "enabled" : "disabled"
    }`;
    setTimeout(() => {
      statusElement.textContent = "";
    }, 2000);

    // Log to console (regardless of debug mode)
    console.log(
      `KillTheNoise: Debug mode ${debugEnabled ? "enabled" : "disabled"}`
    );
  });
});
