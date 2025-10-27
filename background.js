console.log("[Background] Initializing extension");

let presets = [];
let isRebuildingMenus = false;
let currentActiveTab = null;

const MAX_PRESETS = 10;

const PARENT_ID = "copyPasteRoot";
const CONFIGURE_ID = "configure";
const ADD_TARGET_ID = "add_paste_target";

async function loadPresets() {
  const store = await chrome.storage.sync.get("presets");
  presets = store.presets || [];
  console.log("[Background] Loaded presets:", presets);
}

async function savePresets() {
  await chrome.storage.sync.set({ presets });
  console.log("[Background] Saved presets to storage:", presets);
  await updateContextMenu();
}

function updateContextMenu() {
  console.log("[Background] Updating context menu with", presets.length, "presets");
  isRebuildingMenus = true;
  
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: PARENT_ID,
        title: "Copy-Paste Workflow",
        contexts: ["editable", "selection"]
      });

      chrome.contextMenus.create({
        id: ADD_TARGET_ID,
        parentId: PARENT_ID,
        title: "Add as Paste Target",
        contexts: ["editable"],
        enabled: true // Always start enabled
      });

      presets.forEach(preset => {
        chrome.contextMenus.create({
          id: preset.id.toString(),
          parentId: PARENT_ID,
          title: preset.name,
          contexts: ["selection"],
          enabled: true // Always start enabled
        });
      });

      chrome.contextMenus.create({
        id: CONFIGURE_ID,
        parentId: PARENT_ID,
        title: "Configure",
        contexts: ["editable", "selection"]
      });

      console.log("[Background] Context menus created");
      
      // Small delay to let menus fully initialize
      setTimeout(() => {
        isRebuildingMenus = false;
        // Request status update from current tab
        requestContextStatusUpdate();
        resolve();
      }, 150);
    });
  });
}

// Helper to request context status from active tab
async function requestContextStatusUpdate() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    currentActiveTab = tab.id;
    
    // Try to send message to content script
    chrome.tabs.sendMessage(tab.id, { type: "requestContextStatus" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("[Background] No content script in active tab; menus left enabled (default).");
      }
    });
  } catch (err) {
    console.warn("[Background] Error requesting context status:", err);
  }
}

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Received message:", message.type, "from tab:", sender.tab?.id);
  
  // Handle context status updates from content script
  if (message.type === "contextStatus") {
    // Ignore if we're currently rebuilding menus
    if (isRebuildingMenus) {
      console.log("[Background] Ignoring contextStatus during menu rebuild");
      return;
    }
    
    // Only process if from the current active tab
    if (sender.tab?.id !== currentActiveTab) {
      console.log("[Background] Ignoring contextStatus from inactive tab:", sender.tab?.id);
      return;
    }
    
    try {
      chrome.contextMenus.update(ADD_TARGET_ID, { enabled: message.isEditable }).catch(err => {
        console.warn("[Background] Could not update ADD_TARGET_ID:", err.message);
      });
      
      presets.forEach(preset => {
        chrome.contextMenus.update(preset.id.toString(), { enabled: message.hasSelection }).catch(err => {
          console.warn("[Background] Could not update preset menu item:", preset.id);
        });
      });
      
      console.log("[Background] Context menu status updated - editable:", message.isEditable, "selection:", message.hasSelection);
    } catch (err) {
      console.warn("[Background] Error updating context menu status:", err);
    }
    return;
  }
  
  // Handle context menu update request from popup
  if (message.type === "updateContextMenu") {
    console.log("[Background] updateContextMenu requested; reloading presets and rebuilding menus");
    loadPresets().then(async () => {
      await updateContextMenu();
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  }
  
  // Handle add preset request
  if (message.type === "add_preset") {
    if (presets.length >= MAX_PRESETS) {
      sendResponse({ 
        success: false, 
        error: "You are on a plan that allows a maximum of 10 preset targets. Please delete one existing target before adding another." 
      });
      return true;
    }
    if (presets.some(p => p.selector === message.data.selector && p.url === message.data.url)) {
      sendResponse({ success: false, error: "Duplicate preset" });
      return true;
    }
    presets.push(message.data);
    savePresets().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

async function findReusableTab(urlOrigin, selector) {
  const tabs = await chrome.tabs.query({});
  for (let tab of tabs) {
    try {
      const tabURL = new URL(tab.url);
      if (tabURL.origin === urlOrigin) {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: sel => !!document.querySelector(sel),
          args: [selector]
        });
        if (result.result) {
          console.log("[Background] Found reusable tab:", tab.id);
          return tab.id;
        }
      }
    } catch (e) {
      console.warn("[Background] Error checking tab URL or selector:", e);
    }
  }
  return null;
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Background] onInstalled event");
  await loadPresets();
  updateContextMenu();
});

// Also load on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log("[Background] onStartup event");
  await loadPresets();
  updateContextMenu();
});

// Track active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  currentActiveTab = activeInfo.tabId;
  console.log("[Background] Active tab changed to:", currentActiveTab);
  
  // Request context status from new active tab
  setTimeout(() => {
    requestContextStatusUpdate();
  }, 100);
});

// Track when tabs are updated (page loads, etc.)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tabId === currentActiveTab) {
    console.log("[Background] Active tab finished loading");
    setTimeout(() => {
      requestContextStatusUpdate();
    }, 100);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log("[Background] Clicked menuItemId:", info.menuItemId);
  console.log("[Background] Current presets:", presets);

  if (info.menuItemId === CONFIGURE_ID) {
    try {
      await chrome.action.openPopup();
    } catch (err) {
      console.warn("[Background] Failed to open popup, opening in new tab instead");
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    }
    return;
  }

  if (info.menuItemId === ADD_TARGET_ID) {
    // Reload presets from storage first
    await loadPresets();
    
    if (presets.length >= MAX_PRESETS) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => alert('You are on a plan that allows a maximum of 10 preset targets. Please delete one existing target before adding another.')
      });
      return;
    }
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['contentScript.js']
      });
    } catch (err) {
      console.warn("[Background] Content script injection failed:", err);
    }

    chrome.tabs.sendMessage(tab.id, { type: "get_element_info" }, async (response) => {
      if (!response || !response.success) {
        console.warn("[Background] Could not capture element selector from content script.");
        return;
      }

      const defaultName = `Paste to ${new URL(response.url).hostname}`;
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: suggestedName => prompt("Name for new paste target:", suggestedName) || suggestedName,
        args: [defaultName]
      }, async (results) => {
        const name = results?.[0]?.result || defaultName;

        // Check for duplicates with current URL and selector combination
        const isDuplicate = presets.some(p => 
          p.selector === response.selector && 
          new URL(p.url).hostname === new URL(response.url).hostname
        );
        
        if (isDuplicate) {
          console.warn("[Background] Duplicate preset detected for this selector on this domain");
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => alert('A preset for this element already exists on this domain.')
          });
          return;
        }
        
        const newPreset = {
          id: Date.now().toString(),
          name,
          url: response.url,
          selector: response.selector,
          autoSubmit: true,
          reuseTab: false
        };
        
        presets.push(newPreset);
        await savePresets();
        console.log("[Background] New preset added:", newPreset);
        
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (name) => alert(`Preset "${name}" added successfully!`),
          args: [name]
        });
      });
    });
    return;
  }

  const preset = presets.find(p => p.id.toString() === info.menuItemId);
  if (!preset) {
    console.warn("[Background] No matching preset for menuId:", info.menuItemId);
    return;
  }

  if (!info.selectionText || info.selectionText.trim() === "") {
    console.warn("[Background] Empty text selection");
    return;
  }

  const injectPaste = (tabId, attempt) => {
    console.log(`[Background] Inject attempt ${attempt} for tab ${tabId}`);

    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (selector, text, autoSubmit, attempt) => {
        console.log(`[Injected] Attempt ${attempt} in frame ${window.location.href}`);
        const el = document.querySelector(selector);

        if (!el) {
          console.warn(`[Injected] Element not found for selector: ${selector}`);
          return;
        }

        el.focus();
        el.value = text;
        el.setAttribute("value", text);

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        ['keydown', 'keyup'].forEach(evtName => {
          el.dispatchEvent(new KeyboardEvent(evtName, {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          }));
        });

        setTimeout(() => {
          console.log(`[Injected] After 1s, value is: '${el.value}'`);
        }, 1000);

        if (autoSubmit && attempt > 1) {
          if (el.form) {
            try {
              el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();
              console.log("[Injected] Form submitted");
              return;
            } catch (err) {
              console.warn("[Injected] Form submission failed:", err);
            }
          }

          const buttonSelectorCandidates = [
            'button[type="submit"]',
            'button[aria-label*="search"]',
            'button[data-test-id*="search"]',
            'input[type="submit"]'
          ];
          let clicked = false;
          for (const sel of buttonSelectorCandidates) {
            const btn = document.querySelector(sel);
            if (btn && !clicked) {
              try {
                btn.click();
                console.log(`[Injected] Clicked submit button: ${sel}`);
                clicked = true;
                break;
              } catch (err) {
                console.warn(`[Injected] Failed to click button: ${sel}`, err);
              }
            }
          }
        }
      },
      args: [preset.selector, info.selectionText, preset.autoSubmit, attempt]
    }, (results) => {
      if (chrome.runtime.lastError) {
        console.warn("[Background] Injection error:", chrome.runtime.lastError.message);
      } else {
        console.log("[Background] Injection result:", results);
      }
    });

    if (attempt === 1) {
      setTimeout(() => injectPaste(tabId, 2), 1500);
      setTimeout(() => injectPaste(tabId, 3), 3000);
    }
  };

  const urlOrigin = new URL(preset.url).origin;
  const reuseTabId = preset.reuseTab ? await findReusableTab(urlOrigin, preset.selector) : null;

  if (reuseTabId) {
    injectPaste(reuseTabId, 1);
    chrome.tabs.update(reuseTabId, { active: true });
  } else {
    chrome.tabs.create({ url: preset.url }, (tab) => {
      function listener(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          injectPaste(tabId, 1);
          chrome.tabs.onUpdated.removeListener(listener);
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  }
});

