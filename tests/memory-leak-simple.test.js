/**
 * Simple Memory Leak Detection Tests
 * Tests individual services for memory leaks
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('Simple Memory Leak Prevention', () => {
  let tempDir;

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

  describe('Service Cleanup', () => {
    test('LanguageService should clean up resources properly', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Import service only when needed
      const LanguageService = require('../src/services/langService');
      
      // Create and use service
      const langService = new LanguageService({
        debug: false,
        cacheSize: 100,
        cacheExpiry: 1000
      });
      
      // Initialize the service
      await langService.initialize();
      
      // Use the service
      await langService.detectLanguage('This is a test document');
      
      // Close the service
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

    test('SignatureDetector should clean up resources properly', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Import service only when needed
      const SignatureDetector = require('../src/services/signatureDetector');
      
      // Create and use service
      const signatureService = new SignatureDetector({
        debug: false,
        cacheSize: 50
      });
      
      // Initialize the service
      await signatureService.initialize();
      
      // Use the service
      await signatureService.detectSignature(Buffer.from('test content'));
      
      // Close the service
      await signatureService.close();
      
      // Force garbage collection
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be minimal (less than 5MB)
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });

    test('AICache should clean up resources properly', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Import service only when needed
      const AICache = require('../src/services/aiCache');
      
      // Create and use cache
      const cache = new AICache({
        cacheDir: tempDir,
        maxCacheSize: 10,
        maxAge: 1000
      });
      
      await cache.initialize();
      
      // Use the cache
      await cache.set('test-key', { data: 'test' });
      await cache.get('test-key');
      
      // Close the cache
      await cache.close();
      
      // Force garbage collection
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be minimal (less than 5MB)
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });

    test('TelemetryService should clean up resources properly', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Import service only when needed
      const TelemetryService = require('../src/services/telemetryService');
      
      // Create and use service
      const telemetry = new TelemetryService({
        enabled: true,
        logDir: tempDir,
        maxLogSize: 1024 * 1024
      });
      
      await telemetry.initialize();
      
      // Use the service
      telemetry.log('test', 'info', { data: 'test' });
      
      // Close the service
      await telemetry.close();
      
      // Force garbage collection
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be minimal (less than 5MB)
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });
  });

  describe('Timer Cleanup', () => {
    test('Timers should be properly cleaned up', async () => {
      const initialTimerCount = process._getActiveHandles().length;
      
      // Create some timers
      const timer1 = setTimeout(() => {}, 1000);
      const timer2 = setTimeout(() => {}, 2000);
      const interval1 = setInterval(() => {}, 100);
      
      // Clean up timers
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearInterval(interval1);
      
      // Force garbage collection
      if (global.gc) {
        global.gc();
      }
      
      const finalTimerCount = process._getActiveHandles().length;
      
      // Timer count should not increase significantly
      expect(finalTimerCount).toBeLessThanOrEqual(initialTimerCount + 2); // Allow for some overhead
    });
  });

  describe('Memory Growth Prevention', () => {
    test('Repeated operations should not cause memory growth', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Import service only when needed
      const LanguageService = require('../src/services/langService');
      
      // Perform repeated operations
      for (let i = 0; i < 10; i++) {
        const langService = new LanguageService({ debug: false });
        await langService.initialize();
        await langService.detectLanguage(`Test document ${i}`);
        await langService.close();
        
        // Force garbage collection every few iterations
        if (i % 3 === 0 && global.gc) {
          global.gc();
        }
      }
      
      // Final garbage collection
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be minimal (less than 20MB)
      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024);
    });
  });
});
