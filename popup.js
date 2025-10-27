console.log("[Popup] Script loaded at", new Date().toISOString())

const inExtensionTab = window.location.protocol === "chrome-extension:"
console.log("[Popup] Running in", inExtensionTab ? "extension tab mode" : "popup mode")

const presetsList = document.getElementById("preset-list")
const editSection = document.getElementById("edit-section")
const presetNameInput = document.getElementById("preset-name")
const presetUrlInput = document.getElementById("preset-url")
const presetSelectorInput = document.getElementById("preset-selector")
const autoSubmitInput = document.getElementById("auto-submit")
const reuseTabInput = document.getElementById("reuse-tab")
const saveBtn = document.getElementById("save-preset")
const cancelBtn = document.getElementById("cancel-edit")
const logDiv = document.getElementById("log")

let presets = []
let currentEditingId = null

function log(message) {
  console.log("[Popup]", message)
  if (logDiv) logDiv.textContent = message
}

// Accordion setup function - moved from HTML to JS
function setupAccordion(presetElement, presetData) {
  const editOptions = document.createElement('div');
  editOptions.className = 'preset-edit-options';
  
  editOptions.innerHTML = `
    <label>Preset Name</label>
    <input type="text" class="preset-name-input" value="${presetData.name || ''}" />
    <label>Preset URL</label>
    <input type="text" class="preset-url-input" value="${presetData.url || ''}" disabled />
    <label><input type="checkbox" class="auto-submit-input" ${presetData.autoSubmit ? 'checked' : ''} /> Auto-submit after paste</label>
    <label><input type="checkbox" class="reuse-tab-input" ${presetData.reuseTab ? 'checked' : ''} /> Reuse existing tab for this domain</label>
    <div class="button-container">
      <button class="delete-btn">Delete</button>
      <div class="right-buttons">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">Save</button>
      </div>
    </div>
  `;
  
  presetElement.appendChild(editOptions);
  
  // Toggle accordion on preset click
  presetElement.addEventListener('click', function(e) {
    // Don't toggle if clicking inside edit options
    if (e.target.closest('.preset-edit-options')) return;
    
    // Close all other accordions
    document.querySelectorAll('.preset-item').forEach(item => {
      if (item !== presetElement) {
        item.classList.remove('expanded');
        const options = item.querySelector('.preset-edit-options');
        if (options) options.classList.remove('open');
      }
    });
    
    // Toggle this accordion
    presetElement.classList.toggle('expanded');
    editOptions.classList.toggle('open');
  });
  
  // Handle save button
  editOptions.querySelector('.save-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    const updatedData = {
      name: editOptions.querySelector('.preset-name-input').value,
      url: editOptions.querySelector('.preset-url-input').value,
      selector: presetData.selector,
      autoSubmit: editOptions.querySelector('.auto-submit-input').checked,
      reuseTab: editOptions.querySelector('.reuse-tab-input').checked
    };
    
    // Call save function
    savePresetData(presetData.id, updatedData);
    
    // Close accordion
    presetElement.classList.remove('expanded');
    editOptions.classList.remove('open');
  });
  
  // Handle cancel button
  editOptions.querySelector('.cancel-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    presetElement.classList.remove('expanded');
    editOptions.classList.remove('open');
  });
  
  // Handle delete button
  editOptions.querySelector('.delete-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    deletePreset(presetData.id, presetData.name);
  });
}

async function loadPresets() {
  console.log("[Popup] loadPresets() called - fetching from storage...");
  
  try {
    const data = await chrome.storage.sync.get("presets")
    presets = data.presets || []
    console.log("[Popup] Loaded", presets.length, "presets");
    
    renderPresets()
    log(`Loaded ${presets.length} presets`)
  } catch (error) {
    console.error("[Popup] ERROR loading presets:", error);
    log("Error loading presets: " + error.message)
  }
}

function renderPresets() {
  console.log("[Popup] Rendering", presets.length, "presets");
  window._lastPresets = presets;
  
  presetsList.innerHTML = ""
  
  if (presets.length === 0) {
    presetsList.textContent = "No presets saved yet."
    return
  }
  
  presets.forEach((preset) => {
    const div = document.createElement("div")
    div.className = "preset-item"
    div.textContent = preset.name

    // Setup accordion
    setupAccordion(div, preset)

    presetsList.appendChild(div)
  })
  
  console.log("[Popup] Finished rendering presets");
}

async function savePresetData(presetId, updatedData) {
  console.log("[Popup] savePresetData called for ID:", presetId);
  let preset = presets.find((p) => p.id === presetId)

  const name = updatedData.name.trim()
  if (!name) {
    log("Preset name is required.")
    return
  }

  const existing = presets.find((p) => p.name === name && p.id !== presetId)
  if (existing) {
    if (!confirm("A preset with this name already exists. Overwrite?")) {
      return
    }
  }

  if (!preset) {
    // Create new preset
    preset = {
      id: Date.now().toString(),
      name,
      url: updatedData.url,
      selector: updatedData.selector,
      autoSubmit: updatedData.autoSubmit,
      reuseTab: updatedData.reuseTab
    }
    presets.push(preset)
    console.log("[Popup] Created new preset:", preset);
  } else {
    // Update existing
    preset.name = name
    preset.autoSubmit = updatedData.autoSubmit
    preset.reuseTab = updatedData.reuseTab
    console.log("[Popup] Updated existing preset:", preset);
  }

  await chrome.storage.sync.set({ presets })
  log("Preset saved")
  
  // Update context menu in background
  chrome.runtime.sendMessage({ type: "updateContextMenu" }, (response) => {
    console.log("[Popup] Context menu update response:", response);
  });
  
  // Reload presets from storage
  await loadPresets()

  if (inExtensionTab) {
    setTimeout(() => {
      try {
        window.close()
        console.log("[Popup] Configuration tab closed automatically after save")
      } catch (err) {
        console.warn("[Popup] Auto-close failed:", err)
      }
    }, 800)
  }
}

async function deletePreset(presetId, presetName) {
  console.log("[Popup] deletePreset called!");
  console.log("[Popup] Preset ID:", presetId);
  console.log("[Popup] Preset Name:", presetName);
  
  // Confirm deletion
  const confirmDelete = confirm(`Are you sure you want to delete the preset "${presetName}"?`);
  console.log("[Popup] User confirmed deletion:", confirmDelete);
  
  if (!confirmDelete) {
    console.log("[Popup] Deletion cancelled by user");
    return;
  }
  
  console.log("[Popup] Proceeding with deletion...");
  
  // Remove the preset from the array
  presets = presets.filter(p => p.id !== presetId);
  console.log("[Popup] Presets after deletion:", presets);
  
  // Save updated presets to storage
  await chrome.storage.sync.set({ presets });
  console.log("[Popup] Storage updated");
  
  log(`Preset "${presetName}" deleted`);
  
  // Update context menu in background
  chrome.runtime.sendMessage({ type: "updateContextMenu" }, (response) => {
    console.log("[Popup] Context menu update response:", response);
  });
  
  // Reload the preset list from storage
  await loadPresets();
}

// Keep old functions for backward compatibility with old edit section
function editPreset(id) {
  const preset = presets.find((p) => p.id === id)
  if (!preset) {
    log("Preset not found")
    return
  }
  currentEditingId = id
  presetNameInput.value = preset.name
  presetUrlInput.value = preset.url
  presetSelectorInput.value = preset.selector
  autoSubmitInput.checked = !!preset.autoSubmit
  reuseTabInput.checked = !!preset.reuseTab
  editSection.style.display = "block"
  log(`Editing preset: ${preset.name}`)
}

function clearEdit() {
  currentEditingId = null
  presetNameInput.value = ""
  presetUrlInput.value = ""
  presetSelectorInput.value = ""
  autoSubmitInput.checked = false
  reuseTabInput.checked = false
  editSection.style.display = "none"
  log("Edit cancelled")
}

if (saveBtn) {
  saveBtn.onclick = async () => {
    const updatedData = {
      name: presetNameInput.value,
      url: presetUrlInput.value,
      selector: presetSelectorInput.value,
      autoSubmit: autoSubmitInput.checked,
      reuseTab: reuseTabInput.checked
    }

    await savePresetData(currentEditingId, updatedData)
    clearEdit()
  }
}

if (cancelBtn) {
  cancelBtn.onclick = () => clearEdit()
}

// Handle footer buttons
document.addEventListener('DOMContentLoaded', function() {
  // Handle Read.me button click
  const readmeBtn = document.getElementById('readme-btn');
  if (readmeBtn) {
    readmeBtn.addEventListener('click', function() {
      chrome.tabs.create({ url: chrome.runtime.getURL('README.md') });
    });
  }

  // Handle Feedback button click
  const feedbackBtn = document.getElementById('feedback-btn');
  if (feedbackBtn) {
    feedbackBtn.addEventListener('click', function() {
      // Replace with your actual form URL
      chrome.tabs.create({ url: 'https://forms.gle/kPfpwVsNqM5pHwAD8' });
    });
  }
});

async function init() {
  console.log("[Popup] Initializing...");
  log("Popup initialized")
  await loadPresets()
  console.log("[Popup] Initialization complete");
}

window.renderPresets = renderPresets;
window.savePreset = savePresetData;

// Wait for DOM to be fully loaded before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}