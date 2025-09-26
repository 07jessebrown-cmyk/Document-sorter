/**
 * Final Memory Leak Test
 * Tests memory leaks with proper timer management
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('Final Memory Leak Prevention', () => {
  let tempDir;
  let signatureService;
  let langService;

  beforeEach(async () => {
    // Create temporary directory directly
    tempDir = path.join(os.tmpdir(), `memory-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up services
    if (signatureService) {
      await signatureService.shutdown();
      signatureService = null;
    }
    if (langService) {
      await langService.shutdown();
      langService = null;
    }
    
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

  test('SignatureDetector should clean up intervals properly', async () => {
    // Import service only when needed
    const SignatureDetector = require('../src/services/signatureDetector');
    
    // Create service
    signatureService = new SignatureDetector({
      debug: false,
      cacheSize: 50
    });
    
    // Initialize the service (this creates the interval)
    await signatureService.initialize();
    
    // Check that interval was created
    expect(signatureService.cacheCleanupInterval).toBeDefined();
    
    // Use the service
    await signatureService.detectSignature(Buffer.from('test content'));
    
    // Close the service (this should clear the interval)
    await signatureService.close();
    
    // Check that interval was cleared
    expect(signatureService.cacheCleanupInterval).toBeNull();
  });

  test('LanguageService should clean up intervals properly', async () => {
    // Import service only when needed
    const LanguageService = require('../src/services/langService');
    
    // Create service
    langService = new LanguageService({
      debug: false,
      cacheSize: 100,
      cacheExpiry: 1000
    });
    
    // Initialize the service (this creates the interval)
    await langService.initialize();
    
    // Check that interval was created
    expect(langService.cacheCleanupInterval).toBeDefined();
    
    // Use the service
    await langService.detectLanguage('This is a test document');
    
    // Close the service (this should clear the interval)
    await langService.close();
    
    // Check that interval was cleared
    expect(langService.cacheCleanupInterval).toBeNull();
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
