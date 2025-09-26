/**
 * Debug Memory Leak Test
 * Tests individual services to isolate memory leak issues
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('Debug Memory Leak Prevention', () => {
  let tempDir;
  let signatureService;

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
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
  });
});
