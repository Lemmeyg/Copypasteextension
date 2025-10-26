# Copy-Paste Extension

A Chrome extension that helps you quickly paste clipboard content into specific websites with customizable presets.

## Features

- **Quick Paste Presets**: Save your favorite websites with specific input fields
- **Context Menu Integration**: Right-click to paste to any preset
- **Auto-Submit**: Optionally auto-submit forms after pasting
- **Tab Reuse**: Choose whether to reuse existing tabs for each domain
- **Easy Management**: Edit presets directly from the popup menu

## How to Use

### Creating a Preset

1. Navigate to the website where you want to paste content
2. Right-click on the input field you want to paste into
3. Select **"Configure Copy-Paste for this element"**
4. Give your preset a memorable name
5. Configure options:
   - **Auto-submit after paste**: Automatically submit the form after pasting
   - **Reuse existing tab**: Open the same domain in an existing tab instead of creating new ones

### Using a Preset

1. Copy any text to your clipboard
2. Right-click anywhere on a webpage
3. Hover over **"Paste to..."** in the context menu
4. Select your preset
5. The extension will open the website and paste your clipboard content

### Managing Presets

1. Click the extension icon in your toolbar
2. Click on any preset to expand it
3. Edit the preset name or settings
4. Click **Save** to update or **Cancel** to discard changes

## Tips

- Use descriptive names for your presets (e.g., "Google Search", "ChatGPT Prompt")
- Enable "Auto-submit" for search boxes to save a click
- Enable "Reuse existing tab" to avoid cluttering your browser with multiple tabs

## Common Use Cases

- **Search Engines**: Quickly paste and search on Google, Bing, DuckDuckGo
- **AI Tools**: Paste prompts into ChatGPT, Claude, or other AI assistants
- **Shopping**: Paste product codes into retailer search boxes
- **Development**: Paste code into online compilers or documentation searches
- **Research**: Paste terms into academic databases or library catalogs

## Keyboard Shortcuts

Currently, this extension works via context menu (right-click). Keyboard shortcuts may be added in future versions.

## Privacy

This extension:
- Does NOT collect any data
- Does NOT track your browsing
- Does NOT send information to external servers
- Stores presets locally in your browser using Chrome's sync storage

All preset configurations are stored locally and synced across your Chrome browsers if you're signed in.

## Troubleshooting

**Preset doesn't work on a website**
- Some websites may block automated input due to security policies
- Try refreshing the page after the paste
- Some sites may require manual interaction before submission

**Can't find the context menu option**
- Make sure you're right-clicking on a text input field or textarea
- The extension requires an active input element to configure

**Preset not appearing in list**
- Try reloading the extension from chrome://extensions
- Check if the preset was saved (click extension icon to view all presets)

## Support

Having issues or suggestions? Click the **Feedback** button in the extension popup to submit your feedback.

## Version History

**Version 1.0**
- Initial release
- Context menu integration
- Preset management UI
- Auto-submit and tab reuse options

## Technical Details

**Permissions Required:**
- `contextMenus`: To add right-click menu options
- `storage`: To save your presets
- `clipboardRead`: To read clipboard content for pasting
- `activeTab`: To interact with the current webpage
- `scripting`: To inject paste functionality

**Browser Compatibility:**
- Chrome 88+
- Edge 88+
- Other Chromium-based browsers
