# KillTheNoise

<img src="icon.png" alt="KillTheNoise Logo" width="100">

## A Chrome Extension to Filter YouTube Rage-Bait and Clickbait

> Block rage-bait and clickbait videos on YouTube for a calmer browsing experience.

KillTheNoise is a powerful Chrome extension that filters out rage-bait, clickbait, and melodramatic videos from your YouTube feed, giving you a calmer and more meaningful browsing experience.

## Features

- **Keyword-Based Filtering**: Automatically hides videos containing rage-bait, clickbait, and other attention-grabbing terms
- **Title & Description Scanning**: Filters videos based on both titles and descriptions
- **Toggle On/Off**: Easily enable or disable filtering with a single click
- **Customizable Keywords**: Add your own keywords to personalize your filtering experience
- **Filter Counter**: Tracks the number of videos that have been filtered out
- **Smart Word Matching**: Detects keywords even when they appear in different forms (possessives, plurals, etc.)
- **Performance Optimized**: Built with Web Workers to keep your browser smooth and snappy

## Installation

### Option 1: Download the Release ZIP

1. Go to the [Releases](https://github.com/your-username/killthenoise-extension/releases) section
2. Download the latest `.zip` file
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" in the top right corner
5. Drag the downloaded `.zip` file directly onto the extensions screen
6. KillTheNoise is now installed and ready to use!

### Option 2: Load from Source

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the folder containing the extension files
5. KillTheNoise is now installed and ready to use!

## How It Works

KillTheNoise runs in the background while you browse YouTube, scanning video titles and descriptions for keywords commonly associated with sensationalist content. When it finds a match, it automatically hides that video from your feed.

The extension comes with a comprehensive list of default keywords including terms like "exposed", "shocking", "disaster", "scandal", "you won't believe", and many more.

## Usage

- **Click the KillTheNoise icon** in your Chrome toolbar to open the popup
- **Toggle the filter** on or off using the checkbox
- **View the counter** to see how many videos have been filtered
- **Click "Edit Blocked Keywords"** to customize your filtering preferences

## Customizing Keywords

1. Click on the extension icon in your Chrome toolbar
2. Click the "Edit Blocked Keywords" button
3. Add, modify, or remove keywords from the list
4. Your changes will be automatically saved

## Default Keywords

The extension comes with a set of default keywords designed to target common clickbait and rage-bait phrases:

- exposed
- disaster
- meltdown
- what nobody is telling you
- you won't believe
- worst ever
- the end of
- falling apart
- collapse
- shocking
- gone wrong  
  _See the full list in the extension settings or [defaultKeywords.txt](./defaultKeywords.txt)._

## Performance

KillTheNoise is designed with performance in mind:

- **Web Worker Architecture**: Uses a dedicated worker thread for all filtering operations, keeping the main UI thread responsive
- **Batched Processing**: Splits work into small chunks to prevent browser slowdowns
- **Regex Caching**: Pre-compiles and caches regular expressions to minimize CPU usage
- **CSS-Based Filtering**: Uses CSS classes instead of inline styles for better performance
- **Memory Management**: Implements automatic cleanup to keep resource usage low
- **Visibility-Based Processing**: Only processes videos that are visible or about to become visible
- **Debounced DOM Observation**: Intelligently monitors for new content without excessive processing

## Contributing

Contributions are welcome! If you have suggestions for improvements or new features, feel free to create issues or submit pull requests.

## License

[MIT License](LICENSE)

## Privacy

KillTheNoise respects your privacy:

- No data is collected or shared with third parties
- All filtering happens locally in your browser
- Your custom keywords are stored only in your browser's local storage

---

Made with ❤️ by real humans — for calmer, less chaotic YouTube vibes.
