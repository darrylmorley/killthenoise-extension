// Regular settings elements
const textarea = document.getElementById("keywords");
const saveButton = document.getElementById("save");
const statusElement = document.getElementById("status");

// Debug mode toggle
const debugToggle = document.getElementById("debugToggle");

// Load existing settings
chrome.storage.sync.get(["blockKeywords", "debugMode"], (result) => {
  // Load keywords into textarea
  if (result.blockKeywords) {
    textarea.value = result.blockKeywords.join("\n");
  }

  // Set debug toggle state
  debugToggle.checked = result.debugMode === true;
});

// Save keywords
saveButton.addEventListener("click", () => {
  const keywords = textarea.value
    .split("\n")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k);

  chrome.storage.sync.set({ blockKeywords: keywords }, () => {
    statusElement.textContent = "Saved!";
    setTimeout(() => {
      statusElement.textContent = "";
    }, 2000);
  });
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
