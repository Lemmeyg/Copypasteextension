console.log("[Popup] Script loaded");

const inExtensionTab = window.location.protocol === "chrome-extension:";
console.log("[Popup] Running in", inExtensionTab ? "extension tab mode" : "popup mode");

const presetsList = document.getElementById('preset-list');
const addNewBtn = document.getElementById('add-new-btn');
const editSection = document.getElementById('edit-section');
const presetNameInput = document.getElementById('preset-name');
const presetUrlInput = document.getElementById('preset-url');
const presetSelectorInput = document.getElementById('preset-selector');
const autoSubmitInput = document.getElementById('auto-submit');
const reuseTabInput = document.getElementById('reuse-tab');
const saveBtn = document.getElementById('save-preset');
const cancelBtn = document.getElementById('cancel-edit');
const logDiv = document.getElementById('log');

let presets = [];
let currentEditingId = null;

function log(message) {
  console.log("[Popup]", message);
  if (logDiv) logDiv.textContent = message;
}

async function loadPresets() {
  const data = await chrome.storage.sync.get("presets");
  presets = data.presets || [];
  renderPresets();
  log("Presets loaded");
}

function renderPresets() {
  presetsList.innerHTML = "";
  if (presets.length === 0) {
    presetsList.textContent = "No presets saved yet.";
    return;
  }
  presets.forEach(preset => {
    const div = document.createElement('div');
    div.className = 'preset-item';
    div.textContent = preset.name;
    div.onclick = () => editPreset(preset.id);
    presetsList.appendChild(div);
  });
}

function editPreset(id) {
  const preset = presets.find(p => p.id === id);
  if (!preset) {
    log("Preset not found");
    return;
  }
  currentEditingId = id;
  presetNameInput.value = preset.name;
  presetUrlInput.value = preset.url;
  presetSelectorInput.value = preset.selector;
  autoSubmitInput.checked = !!preset.autoSubmit;
  reuseTabInput.checked = !!preset.reuseTab;
  editSection.style.display = "block";
  addNewBtn.disabled = true;
  log(`Editing preset: ${preset.name}`);
}

function clearEdit() {
  currentEditingId = null;
  presetNameInput.value = "";
  presetUrlInput.value = "";
  presetSelectorInput.value = "";
  autoSubmitInput.checked = false;
  reuseTabInput.checked = false;
  editSection.style.display = "none";
  addNewBtn.disabled = false;
  log("Edit cancelled");
}

addNewBtn.onclick = async () => {
  if (inExtensionTab) {
    log("Cannot create new paste preset from this page. Please right-click a field on any website and choose 'Add as Paste Target' from the context menu.");
    return;
  }
  // Only works when the popup is opened on a webpage, not as a chrome-extension:// tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    chrome.tabs.sendMessage(activeTab.id, { type: "get_element_info" }, (response) => {
      if (!response || !response.success) {
        log("Cannot get element info on current tab.");
        return;
      }
      currentEditingId = null;
      presetNameInput.value = `Paste to ${new URL(response.url).hostname}`;
      presetUrlInput.value = response.url;
      presetSelectorInput.value = response.selector;
      autoSubmitInput.checked = true;
      reuseTabInput.checked = false;
      editSection.style.display = "block";
      addNewBtn.disabled = true;
      log("Adding new preset from content script");
    });
  });
};

saveBtn.onclick = async () => {
  const name = presetNameInput.value.trim();
  if (!name) {
    log("Preset name is required.");
    return;
  }

  const existing = presets.find(p => p.name === name && p.id !== currentEditingId);
  if (existing) {
    if (!confirm("A preset with this name already exists. Overwrite?")) {
      return;
    }
  }

  if (currentEditingId) {
    // Update existing
    const p = presets.find(p => p.id === currentEditingId);
    if (p) {
      p.name = name;
      p.autoSubmit = autoSubmitInput.checked;
      p.reuseTab = reuseTabInput.checked;
    }
  } else {
    // New preset
    presets.push({
      id: Date.now().toString(),
      name,
      url: presetUrlInput.value,
      selector: presetSelectorInput.value,
      autoSubmit: autoSubmitInput.checked,
      reuseTab: reuseTabInput.checked
    });
  }

  await chrome.storage.sync.set({ presets });
  log("Preset saved");
  clearEdit();
  loadPresets();

  chrome.runtime.sendMessage({ type: "updateContextMenu" });

  // If opened as a tab, close automatically after save
  if (inExtensionTab) {
    setTimeout(() => {
      try {
        window.close();
        console.log("[Popup] Configuration tab closed automatically after save");
      } catch (err) {
        console.warn("[Popup] Auto-close failed:", err);
      }
    }, 800);
  }
};

cancelBtn.onclick = () => clearEdit();

async function init() {
  log("Popup initialized");
  await loadPresets();
}

init();
