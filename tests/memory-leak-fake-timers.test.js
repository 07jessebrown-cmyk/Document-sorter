/**
 * Memory Leak Test with Fake Timers
 * Tests memory leaks using Jest's fake timers
 */

// Use fake timers from the beginning
jest.useFakeTimers();

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('Memory Leak Prevention with Fake Timers', () => {
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
    
    // Clear all timers
    jest.clearAllTimers();
  });

  test('SignatureDetector should work with fake timers', async () => {
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

  test('LanguageService should work with fake timers', async () => {
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
});
