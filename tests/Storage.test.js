const { savePresets, loadPresets } = require('../background.js'); // Adjust path to your background or logic file
const { createContextMenuData, savePresets, loadPresets } = require('../background.js');

describe('Storage Tests', () => {
  beforeEach(() => {
    chrome.storage.sync.get.mockClear();
    chrome.storage.sync.set.mockClear();
  });

  test('savePresets saves data', async () => {
    await savePresets({ test: 'data' });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ presets: { test: 'data' } });
  });

  test('loadPresets loads data', async () => {
    chrome.storage.sync.get.mockImplementation((key, cb) => cb({ presets: { test: 'data' } }));
    const result = await loadPresets();
    expect(result).toEqual({ test: 'data' });
  });
});
