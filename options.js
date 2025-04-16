const textarea = document.getElementById("keywords");
const saveButton = document.getElementById("save");

chrome.storage.sync.get(["blockKeywords"], (result) => {
  if (result.blockKeywords) {
    textarea.value = result.blockKeywords.join("\n");
  }
});

saveButton.addEventListener("click", () => {
  const keywords = textarea.value
    .split("\n")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k);
  chrome.storage.sync.set({ blockKeywords: keywords }, () => {
    const status = document.getElementById("status");
    status.textContent = "Saved!";
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  });
});
