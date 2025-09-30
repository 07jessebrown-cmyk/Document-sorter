// Jest setup file for Document Sorter App tests

// Set CI environment for testing
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.CI = process.env.CI || 'true';

// Import cleanup utilities
const { globalCleanup, setupJestWithCleanup } = require('./utils/testCleanup');

// Setup Jest with memory leak prevention
setupJestWithCleanup();

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

// Note: Removed path mocking to allow real path operations in tests

// Mock AI services for CI testing - only when explicitly requested
if (process.env.MOCK_AI_SERVICES === 'true') {
  const AIMockService = require('./mocks/aiMockService');
  const mockAI = new AIMockService();
  
  // Mock AI text service
  jest.mock('../src/services/aiTextService', () => ({
    analyzeDocument: jest.fn((text, options) => mockAI.analyzeDocument(text, options)),
    extractDocumentFields: jest.fn((text, options) => mockAI.analyzeDocument(text, options))
  }));
  
  // Mock LLM client
  jest.mock('../src/services/llmClient', () => ({
    analyzeText: jest.fn((text, options) => mockAI.analyzeDocument(text, options)),
    batchAnalyze: jest.fn((texts, options) => Promise.all(texts.map(text => mockAI.analyzeDocument(text, options))))
  }));
  
  // Mock table extractor
  jest.mock('../src/services/tableExtractor', () => ({
    extractTables: jest.fn((pdfBuffer) => mockAI.extractTables(pdfBuffer))
  }));
  
  // Mock language service
  jest.mock('../src/services/langService', () => ({
    detectLanguage: jest.fn((text) => mockAI.detectLanguage(text))
  }));
  
  // Mock signature detector
  jest.mock('../src/services/signatureDetector', () => ({
    detectSignature: jest.fn((pdfBuffer) => mockAI.detectSignature(pdfBuffer))
  }));
  
  // Mock watermark service
  jest.mock('../src/services/watermarkService', () => ({
    detectWatermark: jest.fn((pdfBuffer) => mockAI.detectWatermark(pdfBuffer))
  }));
  
  // Mock handwriting service
  jest.mock('../src/services/handwritingService', () => ({
    detectHandwriting: jest.fn((pdfBuffer) => mockAI.detectHandwriting(pdfBuffer))
  }));
  
  // Mock OCR service
  jest.mock('../src/services/ocrService', () => ({
    extractText: jest.fn((pdfBuffer) => Promise.resolve('Mock OCR extracted text')),
    extractTextFromImage: jest.fn((imageBuffer) => Promise.resolve('Mock OCR extracted text from image'))
  }));
  
  // Mock AI cache
  jest.mock('../src/services/aiCache', () => ({
    get: jest.fn(() => null),
    set: jest.fn(() => true),
    clear: jest.fn(() => true),
    getStats: jest.fn(() => ({ hits: 0, misses: 0, size: 0 }))
  }));
  
  // Mock telemetry service
  jest.mock('../src/services/telemetryService', () => ({
    log: jest.fn(),
    getMetrics: jest.fn(() => ({})),
    reset: jest.fn()
  }));
}

// Global test timeout
jest.setTimeout(10000);

// Global test cleanup
beforeEach(async () => {
  // Reset mocks before each test
  jest.clearAllMocks();
  
  // Clear any existing timers
  jest.clearAllTimers();
  
  // Clear any pending promises
  await new Promise(resolve => setImmediate(resolve));
});

afterEach(async () => {
  try {
    // Clean up after each test
    await globalCleanup.cleanup();
    
    // Clear all timers
    jest.clearAllTimers();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Wait for any pending operations
    await new Promise(resolve => setImmediate(resolve));
  } catch (error) {
    console.warn('Test cleanup warning:', error.message);
  }
});

afterAll(async () => {
  try {
    // Final cleanup
    await globalCleanup.cleanup();
    
    // Clear all timers
    jest.clearAllTimers();
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
    
    // Wait for cleanup to complete
    await new Promise(resolve => setImmediate(resolve));
  } catch (error) {
    console.warn('Final cleanup warning:', error.message);
  }
});
