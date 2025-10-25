// tests/background.test.js

const { createContextMenuData, savePresets, loadPresets } = require('../background.js');

describe('Context menu creation logic', () => {
  it('creates menu data for each preset', () => {
    const presets = [
      { id: '1', name: 'Test 1', targetUrl: 'https://a.com', inputSelector: '#input1', autoSubmit: false },
      { id: '2', name: 'Test 2', targetUrl: 'https://b.com', inputSelector: '#input2', autoSubmit: true }
    ];

    const menuItems = createContextMenuData(presets);
    expect(menuItems.length).toBe(2);
    expect(menuItems[0].title).toBe('Test 1');
  });
});
