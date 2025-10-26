console.log("[Background] Initializing extension");

let presets = [
  {
    id: '1',
    name: 'Google Search',
    url: 'https://www.google.com',
    selector: 'textarea[name="q"]',
    autoSubmit: true,
    reuseTab: false
  }
];

const PARENT_ID = "copyPasteRoot";
const CONFIGURE_ID = "configure";
const ADD_TARGET_ID = "add_paste_target";

async function loadPresets() {
  const store = await chrome.storage.sync.get("presets");
  presets = store.presets || presets;
  console.log("[Background] Loaded presets:", presets);
}

async function savePresets() {
  await chrome.storage.sync.set({ presets });
  console.log("[Background] Saved presets");
  updateContextMenu();
}

function updateContextMenu() {
  chrome.contextMenus.removeAll(() => {
    // Create the parent menu "Copy-Paste Workflow"
    chrome.contextMenus.create({
      id: PARENT_ID,
      title: "Copy-Paste Workflow",
      contexts: ["editable", "selection"]
    });

    // Add "Add as Paste Target" under parent menu
    chrome.contextMenus.create({
      id: ADD_TARGET_ID,
      parentId: PARENT_ID,
      title: "Add as Paste Target",
      contexts: ["editable"]
    });

    // Add presets under the same parent menu, flat structure
    presets.forEach(preset => {
      chrome.contextMenus.create({
        id: preset.id.toString(), // ensure string ID for consistency
        parentId: PARENT_ID,
        title: preset.name,
        contexts: ["selection"]
      });
    });

    // Add "Configure" as last option under parent menu
    chrome.contextMenus.create({
      id: CONFIGURE_ID,
      parentId: PARENT_ID,
      title: "Configure",
      contexts: ["editable", "selection"]
    });

    console.log("[Background] Context menus updated");
  });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "contextStatus") {
    // Enable Add as Paste Target only if right-click is on an editable input
    chrome.contextMenus.update(ADD_TARGET_ID, { enabled: message.isEditable });

    // Enable presets only if there is a selection anywhere on the page
    presets.forEach(preset => {
      chrome.contextMenus.update(preset.id.toString(), { enabled: message.hasSelection });
    });
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log("[Background] Clicked menuItemId:", info.menuItemId);
  console.log("[Background] Presets IDs:", presets.map(p => p.id.toString()));

  if (info.menuItemId === CONFIGURE_ID) {
    try {
      await chrome.action.openPopup();
    } catch (err) {
      console.warn("[Background] Failed to open popup:", err);
    }
    return;
  }

  if (info.menuItemId === ADD_TARGET_ID) {
  try {
    // Inject the content script before sending message
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['contentScript.js']
    });
  } catch (err) {
    console.warn("[Background] Content script injection failed:", err);
    return;
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
        if (presets.some(p => p.selector === response.selector && p.url === response.url)) {
          console.warn("[Background] Duplicate preset detected");
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
        console.log("[Background] New preset added from right-click menu:", newPreset);
      });
    });
    return;
  }

  // Find preset by string ID
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

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === "add_preset") {
    if (presets.some(p => p.selector === message.data.selector && p.url === message.data.url)) {
      sendResponse({ success: false, error: "Duplicate preset" });
      return true;
    }
    presets.push(message.data);
    await savePresets();
    sendResponse({ success: true });
    return true;
  }
});
