/**
 * Memory Leak Detection Tests
 * Validates that memory leaks are prevented and resources are properly cleaned up
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { globalCleanup } = require('./utils/testCleanup');

// Import services that might cause memory leaks
const LanguageService = require('../src/services/langService');
const SignatureDetector = require('../src/services/signatureDetector');
const AICache = require('../src/services/aiCache');
const TelemetryService = require('../src/services/telemetryService');
const EnhancedParsingService = require('../src/services/enhancedParsingService');

describe('Memory Leak Prevention', () => {
  let tempDir;

  beforeEach(async () => {
    // Create temporary directory directly
    tempDir = path.join(os.tmpdir(), `memory-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    // Reset cleanup tracking
    globalCleanup.reset();
  });

  afterEach(async () => {
    // Clean up after each test
    await globalCleanup.cleanup();
    
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

  describe('Multiple Service Cleanup', () => {
    test('Multiple services should not cause memory leaks', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create multiple services
      const services = [];
      
      for (let i = 0; i < 5; i++) {
        const langService = new LanguageService({ debug: false });
        const signatureService = new SignatureDetector({ debug: false });
        const cache = new AICache({ cacheDir: tempDir, maxCacheSize: 5 });
        const telemetry = new TelemetryService({ enabled: false });
        
        services.push({ langService, signatureService, cache, telemetry });
        
        // Use services
        await langService.detectLanguage('Test document');
        await signatureService.detectSignature(Buffer.from('test'));
        await cache.initialize();
        await cache.set(`key-${i}`, { data: 'test' });
        await telemetry.initialize();
        telemetry.log('test', 'info', { data: 'test' });
      }
      
      // Close all services
      for (const { langService, signatureService, cache, telemetry } of services) {
        await langService.close();
        await signatureService.close();
        await cache.close();
        await telemetry.close();
      }
      
      // Force garbage collection
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Timer Cleanup', () => {
    test('Timers should be properly cleaned up', async () => {
      const initialTimerCount = globalCleanup.timers.size;
      
      // Create some timers
      const timer1 = setTimeout(() => {}, 1000);
      const timer2 = setTimeout(() => {}, 2000);
      const interval1 = setInterval(() => {}, 100);
      
      globalCleanup.trackTimer(timer1);
      globalCleanup.trackTimer(timer2);
      globalCleanup.trackInterval(interval1);
      
      // Clean up
      await globalCleanup.cleanup();
      
      const finalTimerCount = globalCleanup.timers.size;
      
      // All timers should be cleared
      expect(finalTimerCount).toBe(0);
    });
  });

  describe('Memory Growth Prevention', () => {
    test('Repeated operations should not cause memory growth', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform repeated operations
      for (let i = 0; i < 10; i++) {
        const langService = new LanguageService({ debug: false });
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
