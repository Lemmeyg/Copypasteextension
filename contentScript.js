// Modified duplicate check - allow re-initialization
if (window.__CONTENT_SCRIPT_LOADED__) {
  console.log("[ContentScript] Already loaded, re-initializing listeners");
  // Don't return - allow re-initialization of message listeners
}
window.__CONTENT_SCRIPT_LOADED__ = true;

// ----------------------------------------------------------------------------------------

console.log("[ContentScript] Loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Add ping handler for connection testing
  if (message.type === "ping") {
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "get_element_info") {
    const el = document.activeElement;
    if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      console.warn("[ContentScript] No active input or textarea element");
      sendResponse({ success: false, error: "No active editable element" });
      return;
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
  }

  if (message.type === "requestContextStatus") {
    updateContextStatus();
    sendResponse({ success: true });
  }

  // Respond to refresh request from background
  if (message.type === "refresh_context_status") {
    console.log("[ContentScript] Refreshing context status on request");

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

    // Immediately respond to background sendMessage callback
    sendResponse({ isEditable, hasSelection });

    // Also broadcast normally
    if (chrome.runtime?.id) {
      try {
        chrome.runtime.sendMessage({ type: "contextStatus", isEditable, hasSelection });
      } catch (err) {
        console.warn("[ContentScript] Failed to broadcast contextStatus:", err.message);
      }
    }

    return true;
  }

  return true;
});

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

  console.log("[ContentScript] Context status - editable:", isEditable, "selection:", hasSelection);

  // Check if extension context is still valid before sending message
  if (chrome.runtime?.id) {
    try {
      chrome.runtime.sendMessage({ type: "contextStatus", isEditable, hasSelection });
    } catch (err) {
      console.warn("[ContentScript] Failed to send contextStatus - extension context may be invalidated:", err.message);
      removeEventListeners();
    }
  } else {
    console.warn("[ContentScript] Extension context invalidated - removing event listeners");
    removeEventListeners();
  }
}

let listenersAttached = false;

function attachEventListeners() {
  if (listenersAttached) return;

  document.addEventListener('selectionchange', updateContextStatus);
  document.addEventListener('focusin', updateContextStatus);
  document.addEventListener('focusout', updateContextStatus);

  listenersAttached = true;
  console.log("[ContentScript] Event listeners attached");
}

function removeEventListeners() {
  if (!listenersAttached) return;

  document.removeEventListener('selectionchange', updateContextStatus);
  document.removeEventListener('focusin', updateContextStatus);
  document.removeEventListener('focusout', updateContextStatus);

  listenersAttached = false;
  console.log("[ContentScript] Event listeners removed due to invalid context");
}

// Initialize
attachEventListeners();
updateContextStatus();