console.log("[Background] Initializing extension");

let presets = [];
let rebuildingMenu = false;

const MAX_PRESETS = 10;
const PARENT_ID = "copyPasteRoot";
const CONFIGURE_ID = "configure";
const ADD_TARGET_ID = "add_paste_target";
const REFRESH_STATUS_ID = "refresh_status";

// -----------------------------
// Storage helpers
// -----------------------------
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

// -----------------------------
// Context menu builder + refresh
// -----------------------------
function updateContextMenu() {
  console.log("[Background] Updating context menu with", presets.length, "presets");
  rebuildingMenu = true;

  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: PARENT_ID,
        title: "SearchSync",
        contexts: ["editable", "selection"]
      });

      chrome.contextMenus.create({
        id: ADD_TARGET_ID,
        parentId: PARENT_ID,
        title: "Add as Paste Target",
        contexts: ["editable"],
        enabled: true
      });

      presets.forEach(preset => {
        chrome.contextMenus.create({
          id: preset.id.toString(),
          parentId: PARENT_ID,
          title: preset.name,
          contexts: ["selection"],
          enabled: true
        });
      });

      chrome.contextMenus.create({
        id: REFRESH_STATUS_ID,
        parentId: PARENT_ID,
        title: "Refresh",
        contexts: ["editable", "selection"],
        enabled: true
      });

      chrome.contextMenus.create({
        id: CONFIGURE_ID,
        parentId: PARENT_ID,
        title: "Configure",
        contexts: ["editable", "selection"],
        enabled: true
      });

      console.log("[Background] Context menus updated");

      setTimeout(() => { 
        rebuildingMenu = false;
        resolve();
      }, 150);
    });
  });
}

// -----------------------------
// Message listener
// -----------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || !message.type) return;
    
    console.log("[Background] Received message:", message.type);

    if (message.type === "contextStatus") {
      if (rebuildingMenu) {
        console.log("[Background] Ignoring contextStatus during menu rebuild");
        return;
      }

      try {
        chrome.contextMenus.update(ADD_TARGET_ID, { enabled: !!message.isEditable }, () => {
          if (chrome.runtime.lastError) {
            console.warn("[Background] Could not update ADD_TARGET_ID:", chrome.runtime.lastError);
          }
        });

        presets.forEach(preset => {
          chrome.contextMenus.update(preset.id.toString(), { enabled: !!message.hasSelection }, () => {
            if (chrome.runtime.lastError) {
              console.warn("[Background] Could not update preset menu item:", preset.id);
            }
          });
        });
      } catch (err) {
        console.warn("[Background] Error updating context menu status:", err);
      }
      return;
    }

    if (message.type === "updateContextMenu") {
      console.log("[Background] Reloading presets and updating context menu");
      await loadPresets();
      await updateContextMenu();
      if (sendResponse) sendResponse({ success: true });
      return;
    }

    if (message.type === "add_preset") {
      if (presets.length >= MAX_PRESETS) {
        if (sendResponse) sendResponse({
          success: false,
          error: "Maximum of 10 preset targets reached."
        });
        return;
      }

      if (presets.some(p => p.selector === message.data.selector && p.url === message.data.url)) {
        if (sendResponse) sendResponse({ success: false, error: "Duplicate preset" });
        return;
      }

      presets.push(message.data);
      await savePresets();
      if (sendResponse) sendResponse({ success: true });
      return;
    }
  })();

  return true;
});

// -----------------------------
// Helper: Check if content script is loaded
// -----------------------------
async function isContentScriptLoaded(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "ping" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// -----------------------------
// Helper: Force refresh content script status
// -----------------------------
async function forceRefreshStatus(tabId) {
  console.log("[Background] Force refreshing status for tab:", tabId);
  
  try {
    // Try to inject content script (will be idempotent due to initialization check)
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['contentScript.js']
    });
    console.log("[Background] Content script injected/verified");
    
    // Small delay to ensure initialization
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Send force refresh message
    chrome.tabs.sendMessage(tabId, { type: "force_refresh_status" }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[Background] Could not send force refresh:", chrome.runtime.lastError.message);
      } else {
        console.log("[Background] Status refresh triggered successfully");
      }
    });
    
    // Show confirmation to user
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const msg = document.createElement('div');
        msg.textContent = 'Refreshed ✓';
        msg.style.cssText = 'position:fixed;top:20px;right:20px;background:#4CAF50;color:white;padding:12px 20px;border-radius:4px;z-index:999999;font-family:system-ui;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.2)';
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 2000);
      }
    });
    
  } catch (err) {
    console.error("[Background] Error during force refresh:", err);
    
    // Fallback: show error message
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => alert('Could not refresh status. Please reload the page.')
    });
  }
}

// -----------------------------
// findReusableTab
// -----------------------------
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
      console.warn("[Background] Error checking tab:", e);
    }
  }
  return null;
}

// -----------------------------
// Lifecycle
// -----------------------------
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Background] onInstalled event");
  await loadPresets();
  updateContextMenu();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[Background] onStartup event");
  await loadPresets();
  updateContextMenu();
});

// -----------------------------
// Context menu click handler
// -----------------------------
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log("[Background] Clicked menuItemId:", info.menuItemId);

  if (info.menuItemId === CONFIGURE_ID) {
    try {
      await chrome.action.openPopup();
    } catch (err) {
      console.warn("[Background] Opening in new tab instead");
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    }
    return;
  }

  if (info.menuItemId === REFRESH_STATUS_ID) {
    await forceRefreshStatus(tab.id);
    return;
  }

  if (info.menuItemId === ADD_TARGET_ID) {
    await loadPresets();

    if (presets.length >= MAX_PRESETS) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => alert('Maximum of 10 preset targets reached. Please delete one first.')
      });
      return;
    }

    // Check if content script is already loaded
    const scriptLoaded = await isContentScriptLoaded(tab.id);
    
    if (!scriptLoaded) {
      console.log("[Background] Content script not loaded, injecting...");
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['contentScript.js']
        });
        console.log("[Background] Content script injected");
        
        // Small delay to ensure initialization
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (err) {
        console.error("[Background] Content script injection failed:", err);
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => alert('Failed to initialize. Please refresh the page and try again.')
        });
        return;
      }
    } else {
      console.log("[Background] Content script already loaded, using existing instance");
    }

    // Send message to get element info
    chrome.tabs.sendMessage(tab.id, { type: "get_element_info" }, async (response) => {
      if (chrome.runtime.lastError) {
        console.error("[Background] Message failed:", chrome.runtime.lastError.message);
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => alert('Please click inside a text input field first, then right-click and select "Add as Paste Target".')
        });
        return;
      }
      
      if (!response || !response.success) {
        console.warn("[Background] Could not capture element info");
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => alert('Please click inside a text input field first.')
        });
        return;
      }

      // Prompt for name
      const defaultName = `Paste to ${new URL(response.url).hostname}`;
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: suggestedName => prompt("Name for new paste target:", suggestedName),
        args: [defaultName]
      }, async (results) => {
        if (chrome.runtime.lastError) {
          console.error("[Background] Prompt failed:", chrome.runtime.lastError.message);
          return;
        }
        
        const name = results?.[0]?.result;
        
        if (!name) {
          console.log("[Background] User cancelled");
          return;
        }

        // Check duplicates
        const isDuplicate = presets.some(p =>
          p.selector === response.selector &&
          new URL(p.url).hostname === new URL(response.url).hostname
        );

        if (isDuplicate) {
          console.warn("[Background] Duplicate preset detected");
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
          func: (n) => alert(`Preset "${n}" added successfully!`),
          args: [name]
        });
      });
    });
    return;
  }

  // Handle preset click
  const preset = presets.find(p => p.id.toString() === info.menuItemId);
  if (!preset) {
    console.warn("[Background] No matching preset");
    return;
  }

  if (!info.selectionText || info.selectionText.trim() === "") {
    console.warn("[Background] Empty selection");
    return;
  }

  const injectPaste = (tabId, attempt) => {
    console.log(`[Background] Inject attempt ${attempt} for tab ${tabId}`);

    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (selector, text, autoSubmit, attempt) => {
        console.log(`[Injected] Attempt ${attempt}`);
        const el = document.querySelector(selector);

        if (!el) {
          console.warn(`[Injected] Element not found: ${selector}`);
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

          const buttonCandidates = [
            'button[type="submit"]',
            'button[aria-label*="search"]',
            'button[data-test-id*="search"]',
            'input[type="submit"]'
          ];
          for (const sel of buttonCandidates) {
            const btn = document.querySelector(sel);
            if (btn) {
              try {
                btn.click();
                console.log(`[Injected] Clicked: ${sel}`);
                break;
              } catch (err) {
                console.warn(`[Injected] Click failed: ${sel}`, err);
              }
            }
          }
        }
      },
      args: [preset.selector, info.selectionText, preset.autoSubmit, attempt]
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
    chrome.tabs.create({ url: preset.url }, (newTab) => {
      function listener(tabId, changeInfo) {
        if (tabId === newTab.id && changeInfo.status === 'complete') {
          injectPaste(tabId, 1);
          chrome.tabs.onUpdated.removeListener(listener);
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  }
});

console.log("[Background] Service worker initialization complete");