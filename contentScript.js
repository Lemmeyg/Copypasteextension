// Prevent duplicate initialization
if (!window.__CONTENT_SCRIPT_INITIALIZED__) {
  console.log("[ContentScript] ========== INITIALIZING ==========");
  window.__CONTENT_SCRIPT_INITIALIZED__ = true;
  
  // Store the element being right-clicked for "Add as Paste Target"
  window.rightClickedElement = null;
  
  // Capture the right-clicked element
  document.addEventListener('contextmenu', (e) => {
    window.rightClickedElement = e.target;
    console.log("[ContentScript] Right-clicked element stored:", e.target.tagName);
  }, true);
  
  console.log("[ContentScript] Listeners attached");
} else {
  console.log("[ContentScript] Already initialized");
}

// Message listener for commands from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[ContentScript] Message received:", message.type);
  
  if (message.type === "ping") {
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "get_element_info") {
    console.log("[ContentScript] Getting element info for Add Target");
    
    let el = window.rightClickedElement;
    
    // Validate it's an editable element
    if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      console.warn("[ContentScript] Not a valid input/textarea");
      sendResponse({ 
        success: false, 
        error: "Please right-click directly on a text input field." 
      });
      return true;
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

    console.log("[ContentScript] Element info:", selector);
    sendResponse({
      success: true,
      selector,
      url: document.location.href,
      tagName: el.tagName
    });
    return true;
  }

  if (message.type === "check_selection") {
    console.log("[ContentScript] Checking for text selection");
    
    const selection = window.getSelection();
    const hasSelection = selection && selection.toString().length > 0;
    
    console.log("[ContentScript] Has selection:", hasSelection);
    sendResponse({ 
      success: true, 
      hasSelection,
      selectionText: hasSelection ? selection.toString() : ""
    });
    return true;
  }

  return false;
});

console.log("[ContentScript] Ready");