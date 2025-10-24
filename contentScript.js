console.log("[ContentScript] Loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "get_element_info") {
    const el = document.activeElement;
    if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      console.warn("[ContentScript] No active input or textarea element");
      sendResponse({ success: false, error: "No active editable element" });
      return;
    }

    // Prefer id, then name, fallback CSS path by tag name (simple)
    let selector = "";
    if (el.id) selector = `#${el.id}`;
    else if (el.name) selector = `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    else selector = el.tagName.toLowerCase();

    console.log("[ContentScript] Element selector:", selector);
    sendResponse({
      success: true,
      selector,
      url: document.location.href,
      tagName: el.tagName
    });
  }

  if (message.type === 'SET_INPUT_VALUE') {
    const input = document.querySelector(message.selector);
    if (input) {
      input.value = message.value;
      if (message.autoSubmit) {
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
        input.dispatchEvent(event);
      }
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Input not found' });
    }
  }

  return true; // Keep message channel open for async sendResponse
});
