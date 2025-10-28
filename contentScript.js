// Prevent duplicate event listener registration
if (!window.__CONTENT_SCRIPT_INITIALIZED__) {
  console.log("[ContentScript] Initializing for the first time");
  window.__CONTENT_SCRIPT_INITIALIZED__ = true;
  
  // Event listeners for context status
  function updateContextStatus() {
    const isEditable =
      document.activeElement &&
      (document.activeElement.isContentEditable ||
        document.activeElement.tagName === "TEXTAREA" ||
        (document.activeElement.tagName === "INPUT" &&
          (document.activeElement.type === "text" ||
           document.activeElement.type === "search" ||
           document.activeElement.type === "email" ||
           document.activeElement.type === "url")));

    const hasSelection = window.getSelection().toString().length > 0;

    if (chrome.runtime?.id) {
      try {
        chrome.runtime.sendMessage({ type: "contextStatus", isEditable, hasSelection });
      } catch (err) {
        console.warn("[ContentScript] Failed to send contextStatus:", err.message);
      }
    }
  }

  document.addEventListener('selectionchange', updateContextStatus);
  document.addEventListener('focusin', updateContextStatus);
  document.addEventListener('focusout', updateContextStatus);

  // Initial status update
  updateContextStatus();
  
  console.log("[ContentScript] Event listeners attached");
} else {
  console.log("[ContentScript] Already initialized, skipping event listener setup");
}

// Message listener - always register (safe to register multiple times)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ping") {
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "force_refresh_status") {
    console.log("[ContentScript] Force refresh status requested");
    
    // Re-calculate context status immediately
    const isEditable =
      document.activeElement &&
      (document.activeElement.isContentEditable ||
        document.activeElement.tagName === "TEXTAREA" ||
        (document.activeElement.tagName === "INPUT" &&
          (document.activeElement.type === "text" ||
           document.activeElement.type === "search" ||
           document.activeElement.type === "email" ||
           document.activeElement.type === "url")));

    const hasSelection = window.getSelection().toString().length > 0;

    console.log("[ContentScript] Forced status - isEditable:", isEditable, "hasSelection:", hasSelection);

    if (chrome.runtime?.id) {
      try {
        chrome.runtime.sendMessage({ type: "contextStatus", isEditable, hasSelection });
        sendResponse({ success: true });
      } catch (err) {
        console.warn("[ContentScript] Failed to send forced contextStatus:", err.message);
        sendResponse({ success: false, error: err.message });
      }
    }
    
    return true;
  }

  if (message.type === "get_element_info") {
    const el = document.activeElement;
    if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      console.warn("[ContentScript] No active input or textarea element");
      sendResponse({ success: false, error: "No active editable element" });
      return true;
    }

    let selector = "";
    if (el.id) selector = `#${el.id}`;
    else if (el.name) selector = `${el.tagName.toLowerCase()}[name='${el.name}']`;
    else selector = el.tagName.toLowerCase();

    console.log("[ContentScript] Element selector:", selector);

    sendResponse({
      success: true,
      selector,
      url: document.location.href,
      tagName: el.tagName
    });
    return true;
  }

  if (message.type === "SET_INPUT_VALUE") {
    const input = document.querySelector(message.selector);
    if (input) {
      input.value = message.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      if (message.autoSubmit) {
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
        input.dispatchEvent(event);
      }

      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "Input not found" });
    }
    return true;
  }

  return true;
});

console.log("[ContentScript] Message listener registered");