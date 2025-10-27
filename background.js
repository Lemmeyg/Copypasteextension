console.log("[Background] Initializing extension");

let presets = [];
let rebuildingMenu = false; // Prevent race conditions during menu rebuild

const MAX_PRESETS = 10;
const PARENT_ID = "copyPasteRoot";
const CONFIGURE_ID = "configure";
const ADD_TARGET_ID = "add_paste_target";

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
// Helper: get active tab id
// -----------------------------
function getActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve(null);
      } else {
        resolve((tabs && tabs[0] && tabs[0].id) || null);
      }
    });
  });
}

// Fallback: if no active tab or no content script responded,
// find the first normal web page tab and request status from there
chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, (tabs) => {
  if (tabs && tabs.length > 0) {
    const candidate = tabs[0];
    chrome.tabs.sendMessage(candidate.id, { type: "refresh_context_status" }, (resp) => {
      if (chrome.runtime.lastError) {
        console.log("[Background] No content script in fallback tab (ignored)");
      } else if (resp) {
        console.log("[Background] Received fallback status from tab:", candidate.id);
      }
    });
  }
});

// -----------------------------
// Context menu builder + refresh (robust, waits for refresh response)
// -----------------------------
function updateContextMenu() {
  console.log("[Background] Updating context menu with", presets.length, "presets");
  rebuildingMenu = true;

  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      // Root menu
      chrome.contextMenus.create({
        id: PARENT_ID,
        title: "Copy-Paste Workflow",
        contexts: ["editable", "selection"]
      });

      // Add as paste target (start enabled, will be adjusted if active tab replies)
      chrome.contextMenus.create({
        id: ADD_TARGET_ID,
        parentId: PARENT_ID,
        title: "Add a Preset Search",
        contexts: ["editable"],
        enabled: true
      });

      // Preset items (start enabled)
      presets.forEach(preset => {
        chrome.contextMenus.create({
          id: preset.id.toString(),
          parentId: PARENT_ID,
          title: preset.name,
          contexts: ["selection"],
          enabled: true
        });
      });

      // Configure option
      chrome.contextMenus.create({
        id: CONFIGURE_ID,
        parentId: PARENT_ID,
        title: "Configure",
        contexts: ["editable", "selection"],
        enabled: true
      });

      console.log("[Background] Context menus created; requesting active-tab status (if content script exists)");

      // Ask the active tab (if available) to refresh status.
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (!activeTab || !activeTab.id) {
          // No active tab or can't talk to it — finish rebuild and leave menus enabled.
          rebuildingMenu = false;
          console.log("[Background] No active tab found, leaving menus enabled");
          resolve();
          return;
        }

        // Ask the content script to send a fresh status response.
        chrome.tabs.sendMessage(activeTab.id, { type: "refresh_context_status" }, (response) => {
          if (chrome.runtime.lastError) {
            // No content script in the active tab — leave menus enabled.
            rebuildingMenu = false;
            console.log("[Background] No content script in active tab; menus left enabled (ignored).");
            resolve();
            return;
          }

          // Expected: content script may optionally send back a response object.
          // We'll accept either a direct response or wait for the normal contextStatus message.
          // If the response object contains isEditable/hasSelection, apply immediately; otherwise we'll wait for contextStatus messages.
          if (response && typeof response.isEditable !== 'undefined') {
            try {
              chrome.contextMenus.update(ADD_TARGET_ID, { enabled: !!response.isEditable }, () => {
                if (chrome.runtime.lastError) {
                  console.warn("[Background] Could not update ADD_TARGET_ID:", chrome.runtime.lastError);
                }
              });

              presets.forEach(preset => {
                chrome.contextMenus.update(preset.id.toString(), { enabled: !!response.hasSelection }, () => {
                  if (chrome.runtime.lastError) {
                    // Harmless if it occurred due to timing.
                    console.warn("[Background] Could not update preset menu item:", preset.id, chrome.runtime.lastError);
                  }
                });
              });
            } catch (err) {
              console.warn("[Background] Error applying active-tab refresh response:", err);
            }
            rebuildingMenu = false;
            resolve();
          } else {
            // If content script didn't return direct status in the callback, allow it to send a contextStatus message normally.
            // We'll leave rebuildingMenu true for a short grace window (so any stray/stale messages are ignored),
            // then clear it — this still ensures the next contextStatus that arrives will apply to the newly-built menus.
            setTimeout(() => {
              rebuildingMenu = false;
              console.log("[Background] Completed menu rebuild (no immediate response from active tab).");
              resolve();
            }, 700); // brief grace period
          }
        });
      });
    });
  });
}

// -----------------------------
// Message listener
// -----------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Allow async responses
  (async () => {
    if (!message || !message.type) return;
    console.log("[Background] Received message:", message.type);

    // -------- contextStatus from contentScript --------
    if (message.type === "contextStatus") {
      // Ignore while rebuilding
      if (rebuildingMenu) {
        console.log("[Background] Ignoring contextStatus during menu rebuild");
        return;
      }

      // Only accept status messages from the currently active tab
      const activeTabId = await getActiveTabId();
      const senderTabId = sender && sender.tab && sender.tab.id ? sender.tab.id : null;
      if (!senderTabId) {
        console.log("[Background] Ignoring contextStatus with no sender tab");
        return;
      }
      if (senderTabId !== activeTabId) {
        console.log(`[Background] Ignoring contextStatus from tab ${senderTabId} (active: ${activeTabId})`);
        return;
      }

      // Apply updates
      try {
        chrome.contextMenus.update(ADD_TARGET_ID, { enabled: !!message.isEditable }, () => {
          if (chrome.runtime.lastError) {
            console.warn("[Background] Could not update ADD_TARGET_ID:", chrome.runtime.lastError);
          }
        });

        presets.forEach(preset => {
          chrome.contextMenus.update(preset.id.toString(), { enabled: !!message.hasSelection }, () => {
            if (chrome.runtime.lastError) {
              console.warn("[Background] Could not update preset menu item:", preset.id, chrome.runtime.lastError);
            }
          });
        });
      } catch (err) {
        console.warn("[Background] Error updating menus from contextStatus:", err);
      }
      return;
    }

    // -------- updateContextMenu request (from popup) --------
    if (message.type === "updateContextMenu") {
      console.log("[Background] updateContextMenu requested; reloading presets and rebuilding menus");
      await loadPresets();
      await updateContextMenu();
      if (sendResponse) sendResponse({ success: true });
      return;
    }

    // -------- add_preset (from popup) --------
    if (message.type === "add_preset") {
      // Allow multiple presets per URL — no duplicate check.
      if (presets.length >= MAX_PRESETS) {
        if (sendResponse) sendResponse({ success: false, error: "You can have a maximum of 10 preset targets. Please delete one before adding another." });
        return;
      }

      // Accept the preset as provided (no duplicate prevention)
      presets.push(message.data);
      await savePresets();
      if (sendResponse) sendResponse({ success: true });
      return;
    }

    // Other message types: ignore
  })();

  // Indicate we'll call sendResponse asynchronously when needed
  return true;
});

// -----------------------------
// findReusableTab (unchanged)
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
        if (result && result.result) {
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

// -----------------------------
// Lifecycle: onInstalled / onStartup
// -----------------------------
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Background] onInstalled event");
  await loadPresets();
  await updateContextMenu();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[Background] onStartup event");
  await loadPresets();
  await updateContextMenu();
});

// -----------------------------
// Context menu click handler (mostly unchanged; removed duplicate-check behavior flag)
// -----------------------------
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
        func: suggestedName => prompt("Name for new Preset Search:", suggestedName) || suggestedName,
        args: [defaultName]
      }, async (results) => {
        const name = results?.[0]?.result || defaultName;

        // NOTE: duplicate-check removed — allow multiple presets per URL/selector as requested.

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

  // Handle clicking a preset item
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
            'button[type=\"submit\"]',
            'button[aria-label*=\"search\"]',
            'button[data-test-id*=\"search\"]',
            'input[type=\"submit\"]'
          ];
          for (const sel of buttonSelectorCandidates) {
            const btn = document.querySelector(sel);
            if (btn) {
              try {
                btn.click();
                console.log(`[Injected] Clicked submit button: ${sel}`);
                break;
              } catch (err) {
                console.warn(`[Injected] Failed to click button: ${sel}`, err);
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


