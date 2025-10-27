# Copy-Paste Extension

 - Tired of jumping between tabs on multiple screens just to look something up? 
 - Frustrated by repetitive copy-paste searches?
 - Wasting time copy and pasting, opening another browser tab, just to search or lookup?

 - Try one-click searching - search/lookup values, in the applications you want, with two clicks.

 - Instantly lookup any highlighted text in the exact sites and apps you choose, all with a single click.

 - Never copy and paste to search again.

## Features

- **Quick Paste Presets**: Target the specific search bars input fields on specific websites and automatically submit a search for any term 
- **Context Menu Integration**: Right-click to target and search bar
- **Instant Search**: Right click and select your target search 
- **Auto-Submit**: Optionally auto-submit forms after pasting
- **Easy Management**: Edit presets directly from the popup menu

## How to Use

### Creating a Target search

1. Navigate to the website  and search bar or input field where you want to paste your search term
2. Right-click on the input field you want to paste into
3. Select **"Configure Copy-Paste for this element"** from the {app Name} menu
4. Give your preset a memorable name
5. Configure options:
   - **Auto-submit after paste**: Automatically submit the form after pasting
   - **Reuse existing tab**: Open the same domain in an existing tab instead of creating new ones

### Using a Preset

1. Select, then right click, any text to your webpage
2. Select {app name} in your context menu
3. Select the search target your want
4. View the search results.

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
- **B2B Catalogues**: Paste prompts into ChatGPT, Claude, or other AI assistants
- **Search competiting marketplaces**: Paste product codes into retailer search boxes
- **Research**: Paste People, places or products into any webbased applications to search.

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
- Submit a feedback form with the URL and Element you are trying to target. 

**Can't find the 'Add as a Target Search" option**
- Make sure you have an element that allows serarch termsor input before clicking

**Can't find my prefered Preset Seatch Target.
- Make sure you have some text highlighted before clicking

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
