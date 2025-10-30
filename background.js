console.log("[Background] ========== INITIALIZING EXTENSION ==========");

let presets = [];

const MAX_PRESETS = 10;
const PARENT_ID = "copyPasteRoot";
const CONFIGURE_ID = "configure";
const ADD_TARGET_ID = "add_paste_target";
const REFRESH_STATUS_ID = "refresh_status";

// -----------------------------
// Storage helpers
// -----------------------------
async function loadPresets() {
  console.log("[Background] Loading presets...");
  const store = await chrome.storage.sync.get("presets");
  presets = store.presets || [];
  console.log("[Background] Loaded", presets.length, "presets");
  return presets;
}

async function savePresets() {
  console.log("[Background] Saving", presets.length, "presets");
  await chrome.storage.sync.set({ presets });
  await updateContextMenu();
}

// -----------------------------
// Context menu builder - OPTIMISTIC APPROACH
// -----------------------------
async function updateContextMenu() {
  console.log("[Background] ========== UPDATING CONTEXT MENU ==========");
  console.log("[Background] Preset count:", presets.length);
  
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      // Parent menu
      chrome.contextMenus.create({
        id: PARENT_ID,
        title: "SearchSync",
        contexts: ["all"]
      });
      console.log("[Background] Created parent menu");

      // Add Target - ALWAYS ENABLED (optimistic)
      chrome.contextMenus.create({
        id: ADD_TARGET_ID,
        parentId: PARENT_ID,
        title: "Add as Paste Target",
        contexts: ["all"],
        enabled: true  // ALWAYS ENABLED
      });
      console.log("[Background] Created ADD_TARGET (always enabled)");

      // Preset menus - ALWAYS ENABLED (optimistic)
      presets.forEach((preset, index) => {
        chrome.contextMenus.create({
          id: preset.id.toString(),
          parentId: PARENT_ID,
          title: preset.name,
          contexts: ["all"],
          enabled: true  // ALWAYS ENABLED
        });
        console.log(`[Background] Created preset #${index + 1}: ${preset.name} (always enabled)`);
      });

      // Refresh menu
      chrome.contextMenus.create({
        id: REFRESH_STATUS_ID,
        parentId: PARENT_ID,
        title: "Refresh",
        contexts: ["all"],
        enabled: true
      });
      console.log("[Background] Created REFRESH menu");

      // Configure menu
      chrome.contextMenus.create({
        id: CONFIGURE_ID,
        parentId: PARENT_ID,
        title: "Configure",
        contexts: ["all"],
        enabled: true
      });
      console.log("[Background] Created CONFIGURE menu");

      console.log("[Background] All menus created (optimistic mode)");
      console.log("[Background] ========== MENU UPDATE COMPLETE ==========\n");
      resolve();
    });
  });
}

// -----------------------------
// Helper: Ensure content script loaded
// -----------------------------
async function ensureContentScript(tabId) {
  console.log("[Background] Ensuring content script in tab:", tabId);
  
  try {
    // Try to ping existing content script
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: "ping" }, (resp) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(resp);
        }
      });
    });
    
    if (response) {
      console.log("[Background] Content script already loaded");
      return true;
    }
    
    // Not loaded, inject it
    console.log("[Background] Injecting content script...");
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['contentScript.js']
    });
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log("[Background] Content script injected successfully");
    return true;
    
  } catch (err) {
    console.error("[Background] Failed to ensure content script:", err);
    return false;
  }
}

// -----------------------------
// Helper: Show user message
// -----------------------------
async function showMessage(tabId, messageText) {
  console.log("[Background] Showing message:", messageText);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (msg) => alert(msg),
      args: [messageText]
    });
  } catch (err) {
    console.error("[Background] Failed to show message:", err);
  }
}

// -----------------------------
// Lifecycle
// -----------------------------
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Background] ========== ON INSTALLED ==========");
  await loadPresets();
  await updateContextMenu();
  console.log("[Background] ========== INSTALLATION COMPLETE ==========\n");
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[Background] ========== ON STARTUP ==========");
  await loadPresets();
  await updateContextMenu();
  console.log("[Background] ========== STARTUP COMPLETE ==========\n");
});

// -----------------------------
// Context menu click handler
// -----------------------------
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log("[Background] ========== MENU CLICKED ==========");
  console.log("[Background] Item:", info.menuItemId);
  console.log("[Background] Tab:", tab.id);

  // Handle Configure
  if (info.menuItemId === CONFIGURE_ID) {
    console.log("[Background] Opening configuration...");
    try {
      await chrome.action.openPopup();
    } catch (err) {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    }
    return;
  }

  // Handle Refresh
  if (info.menuItemId === REFRESH_STATUS_ID) {
    console.log("[Background] Refreshing page...");
    await showMessage(tab.id, 'Extension refreshed! You may need to reload this page for full functionality.');
    return;
  }

  // Handle Add Target
  if (info.menuItemId === ADD_TARGET_ID) {
    console.log("[Background] ========== ADD TARGET ==========");
    
    // Check if at max presets
    await loadPresets();
    if (presets.length >= MAX_PRESETS) {
      await showMessage(tab.id, 'Maximum of 10 preset targets reached. Please delete one first.');
      return;
    }

    // Get element info directly from the page (check document.activeElement)
    console.log("[Background] Getting active element info...");
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const el = document.activeElement;
        
        // Check if it's a valid input/textarea
        if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          return { success: false, error: "Not a valid input element" };
        }
        
        // Check if it's an editable input type
        if (el instanceof HTMLInputElement) {
          const validTypes = ["text", "search", "email", "url"];
          if (!validTypes.includes(el.type)) {
            return { success: false, error: "Not an editable input type" };
          }
        }
        
        // Generate selector
        let selector = "";
        if (el.id) {
          selector = `#${el.id}`;
        } else if (el.name) {
          selector = `${el.tagName.toLowerCase()}[name='${el.name}']`;
        } else {
          selector = el.tagName.toLowerCase();
        }
        
        return {
          success: true,
          selector: selector,
          url: document.location.href,
          tagName: el.tagName
        };
      }
    });

    const response = result?.result;
    
    if (!response || !response.success) {
      await showMessage(tab.id, 'Please click inside a text input field first, then right-click and select "Add as Paste Target".');
      return;
    }

    // Prompt for name
    const defaultName = `Paste to ${new URL(response.url).hostname}`;
    const nameResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (suggested) => prompt("Name for new paste target:", suggested),
      args: [defaultName]
    });

    const name = nameResult?.[0]?.result;
    if (!name) {
      console.log("[Background] User cancelled");
      return;
    }

    // Check for duplicates
    const isDuplicate = presets.some(p =>
      p.selector === response.selector &&
      new URL(p.url).hostname === new URL(response.url).hostname
    );

    if (isDuplicate) {
      await showMessage(tab.id, 'A preset for this element already exists on this domain.');
      return;
    }

    // Save new preset
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
    
    await showMessage(tab.id, `Preset "${name}" added successfully!`);
    console.log("[Background] ========== ADD TARGET COMPLETE ==========\n");
    return;
  }

  // Handle preset click
  console.log("[Background] ========== PRESET CLICK ==========");
  const preset = presets.find(p => p.id.toString() === info.menuItemId);
  
  if (!preset) {
    console.warn("[Background] Preset not found");
    return;
  }

  console.log("[Background] Using preset:", preset.name);

  // Check if selection text was provided by Chrome (available at right-click time)
  if (!info.selectionText || info.selectionText.trim() === "") {
    console.warn("[Background] No selection text available");
    await showMessage(tab.id, 'Please select some text first, then right-click on the selection and choose a paste target.');
    return;
  }

  const textToPaste = info.selectionText;
  console.log("[Background] Pasting text:", textToPaste.substring(0, 50) + "...");

  // Paste function
  const injectPaste = (tabId, attempt) => {
    console.log(`[Background] Paste attempt ${attempt}`);
    
    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (selector, text, autoSubmit, attempt) => {
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
              return;
            } catch (err) {
              console.warn("[Injected] Form submit failed:", err);
            }
          }

          const buttons = [
            'button[type="submit"]',
            'button[aria-label*="search"]',
            'button[data-test-id*="search"]',
            'input[type="submit"]'
          ];
          
          for (const sel of buttons) {
            const btn = document.querySelector(sel);
            if (btn) {
              try {
                btn.click();
                break;
              } catch (err) {
                console.warn("[Injected] Button click failed:", err);
              }
            }
          }
        }
      },
      args: [preset.selector, textToPaste, preset.autoSubmit, attempt]
    });

    if (attempt === 1) {
      setTimeout(() => injectPaste(tabId, 2), 1500);
      setTimeout(() => injectPaste(tabId, 3), 3000);
    }
  };

  // Find or create tab
  const urlOrigin = new URL(preset.url).origin;
  
  if (preset.reuseTab) {
    console.log("[Background] Looking for reusable tab...");
    const tabs = await chrome.tabs.query({});
    
    for (let t of tabs) {
      try {
        const tabURL = new URL(t.url);
        if (tabURL.origin === urlOrigin) {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId: t.id },
            func: sel => !!document.querySelector(sel),
            args: [preset.selector]
          });
          
          if (result.result) {
            console.log("[Background] Reusing tab:", t.id);
            injectPaste(t.id, 1);
            chrome.tabs.update(t.id, { active: true });
            return;
          }
        }
      } catch (e) {
        console.warn("[Background] Error checking tab:", e);
      }
    }
  }

  // Create new tab
  console.log("[Background] Creating new tab...");
  chrome.tabs.create({ url: preset.url }, (newTab) => {
    function listener(tabId, changeInfo) {
      if (tabId === newTab.id && changeInfo.status === 'complete') {
        injectPaste(tabId, 1);
        chrome.tabs.onUpdated.removeListener(listener);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });

  console.log("[Background] ========== PRESET CLICK COMPLETE ==========\n");
});

console.log("[Background] ========== SERVICE WORKER READY ==========\n");