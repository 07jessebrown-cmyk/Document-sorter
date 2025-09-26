/**
 * Manual Memory Leak Test
 * Tests memory leaks with proper Jest timer management
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('Manual Memory Leak Prevention', () => {
  let tempDir;
  let signatureService;
  let langService;

  beforeAll(() => {
    // Use fake timers to prevent Jest from detecting real timers as memory leaks
    jest.useFakeTimers();
  });

  afterAll(async () => {
    // Clear all timers and shutdown services
    jest.clearAllTimers();
    if (signatureService) {
      await signatureService.shutdown();
    }
    if (langService) {
      await langService.shutdown();
    }
  });

  beforeEach(async () => {
    // Create temporary directory directly
    tempDir = path.join(os.tmpdir(), `memory-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to clean up temp directory:', error.message);
      }
    }
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
  });

  test('Services should clean up intervals properly', async () => {
    // Import services only when needed
    const SignatureDetector = require('../src/services/signatureDetector');
    const LanguageService = require('../src/services/langService');
    
    // Test SignatureDetector
    signatureService = new SignatureDetector({
      debug: false,
      cacheSize: 50
    });
    
    await signatureService.initialize();
    expect(signatureService.cacheCleanupInterval).toBeDefined();
    
    await signatureService.detectSignature(Buffer.from('test content'));
    
    await signatureService.close();
    expect(signatureService.cacheCleanupInterval).toBeNull();
    
    // Test LanguageService
    langService = new LanguageService({
      debug: false,
      cacheSize: 100,
      cacheExpiry: 1000
    });
    
    await langService.initialize();
    expect(langService.cacheCleanupInterval).toBeDefined();
    
    await langService.detectLanguage('This is a test document');
    
    await langService.close();
    expect(langService.cacheCleanupInterval).toBeNull();
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
  });

  test('Memory usage should be reasonable', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Import service only when needed
    const LanguageService = require('../src/services/langService');
    
    // Create and use service
    langService = new LanguageService({
      debug: false,
      cacheSize: 100,
      cacheExpiry: 1000
    });
    
    await langService.initialize();
    await langService.detectLanguage('This is a test document');
    await langService.close();
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory increase should be minimal (less than 10MB)
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
  });
});
