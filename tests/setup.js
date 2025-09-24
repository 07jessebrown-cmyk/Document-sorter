// Jest setup file for Document Sorter App tests

// Mock Electron modules for testing
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((path) => {
      const paths = {
        documents: '/Users/test/Documents',
        userData: '/Users/test/.document-sorter'
      };
      return paths[path] || '/tmp';
    }),
    isReady: jest.fn(() => true)
  },
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn()
  },
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    removeAllListeners: jest.fn()
  }
}));

// Note: Removed fs mocking to allow real file system operations in tests

// Mock path operations
jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: jest.fn((...args) => args.join('/')),
  resolve: jest.fn((...args) => args.join('/'))
}));

// Global test timeout
jest.setTimeout(10000);
