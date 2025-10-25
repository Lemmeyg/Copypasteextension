global.chrome = {
  runtime: {
    onInstalled: {
      addListener: jest.fn(),
    },
    onMessage: {
      addListener: jest.fn(),
    },
    sendMessage: jest.fn(),
  },
  contextMenus: {
    onClicked: {
      addListener: jest.fn(),
    },
    // Add other contextMenus methods or properties you use here if needed
  },
  storage: {
    sync: {
      get: jest.fn((keys, callback) => callback({ presets: {} })),
      set: jest.fn(() => Promise.resolve()),
    },
    local: {
      get: jest.fn((keys, callback) => callback({ presets: {} })),
      set: jest.fn(() => Promise.resolve()),
    },
  },
  // Mock other chrome APIs as needed
};

