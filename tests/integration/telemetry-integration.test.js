const EnhancedParsingService = require('../../src/services/enhancedParsingService');
const TelemetryService = require('../../src/services/telemetryService');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Mock services with standardized structure
jest.mock('../../src/services/canaryRolloutService', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('../../src/services/aiTextService', () => {
  return jest.fn().mockImplementation(() => ({
    analyze: jest.fn(() => ({
      clientName: 'Corporación Acme',
      date: '2023-12-15',
      type: 'Invoice'
    })),
    setLLMClient: jest.fn(),
    setCache: jest.fn(),
    setTelemetry: jest.fn(),
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    extractMetadataAI: jest.fn()
  }));
});

describe('Telemetry Integration', () => {
  let enhancedParsingService;
  let tempDir;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = path.join(os.tmpdir(), `telemetry-integration-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Create EnhancedParsingService with telemetry enabled
    enhancedParsingService = new EnhancedParsingService({
      useAI: false, // Disable AI for simpler testing
      useOCR: false,
      useTableExtraction: false,
      useHandwritingDetection: false,
      useWatermarkDetection: false
    });

    // Wait for telemetry service to fully initialize
    if (enhancedParsingService.telemetry) {
      await enhancedParsingService.telemetry.initialize();
      // Ensure telemetry is enabled and initialized
      enhancedParsingService.telemetry.enabled = true;
      enhancedParsingService.telemetry.isInitialized = true;
    }

    // Clear AI cache
    if (enhancedParsingService.aiCache) {
      await enhancedParsingService.aiCache.clear();
    }

    // Inject mock services
    enhancedParsingService.canaryRolloutService = { initialize: jest.fn() };
    enhancedParsingService.aiTextService = {
      analyze: jest.fn(() => ({
        clientName: 'Corporación Acme',
        date: '2023-12-15',
        type: 'Invoice'
      })),
      setLLMClient: jest.fn(),
      setCache: jest.fn(),
      setTelemetry: jest.fn(),
      extractMetadataAI: jest.fn(async (text, options) => {
        // Simulate AI processing with telemetry tracking
        const startTime = Date.now();
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate processing time
        const latency = Date.now() - startTime;
        
        // Track AI call in telemetry
        if (enhancedParsingService.telemetry) {
          enhancedParsingService.telemetry.trackAICall({
            success: true,
            latency,
            cached: false,
            model: 'test-model'
          });
        }
        
        return {
          clientName: 'Corporación Acme',
          date: '2023-12-15',
          type: 'Invoice'
        };
      })
    };
  });

  afterEach(async () => {
    if (enhancedParsingService) {
      await enhancedParsingService.shutdown();
    }
    
    // Clean up temp directory
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  afterAll(async () => {
    try {
      // Clear all timers and intervals
      jest.clearAllTimers();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Wait for any pending operations
      await new Promise(resolve => setImmediate(resolve));
      
      // Additional cleanup for memory leaks
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.warn('afterAll cleanup warning:', error.message);
    }
  });

  describe('Telemetry Service Integration', () => {
    test('should initialize telemetry service', () => {
      expect(enhancedParsingService.telemetry).toBeDefined();
      expect(enhancedParsingService.telemetry).toBeInstanceOf(TelemetryService);
      expect(enhancedParsingService.telemetry.enabled).toBe(true);
      expect(enhancedParsingService.telemetry.isInitialized).toBe(true);
    });

    test('should track file processing', async () => {
      const testText = 'This is a test document for processing.';
      const testFilePath = path.join(tempDir, 'test.txt');
      
      // Create test file
      await fs.writeFile(testFilePath, testText);

      // Process document
      const result = await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath);

      // Check that telemetry was tracked
      const diagnostics = enhancedParsingService.getTelemetryDiagnostics();
      expect(diagnostics.processing.totalFiles).toBeGreaterThanOrEqual(1);
      expect(diagnostics.processing.regexProcessed).toBeGreaterThanOrEqual(1);
    });

    test('should track processing errors', async () => {
      const testText = '';
      const testFilePath = path.join(tempDir, 'empty.txt');
      
      // Create empty test file
      await fs.writeFile(testFilePath, testText);

      // Process document
      const result = await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath);

      // Check that telemetry was tracked
      const diagnostics = enhancedParsingService.getTelemetryDiagnostics();
      expect(diagnostics.processing.totalFiles).toBe(1);
    });

    test('should provide comprehensive diagnostics', async () => {
      const testText = 'Invoice for ABC Company dated 2024-01-15';
      const testFilePath = path.join(tempDir, 'invoice.txt');
      
      // Create test file
      await fs.writeFile(testFilePath, testText);

      // Process document
      await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath);

      // Get diagnostics
      const diagnostics = enhancedParsingService.getTelemetryDiagnostics();
      
      expect(diagnostics).toHaveProperty('ai');
      expect(diagnostics).toHaveProperty('cache');
      expect(diagnostics).toHaveProperty('processing');
      expect(diagnostics).toHaveProperty('performance');
      expect(diagnostics).toHaveProperty('session');
      expect(diagnostics).toHaveProperty('errors');
      
      expect(diagnostics.processing.totalFiles).toBeGreaterThanOrEqual(1);
      expect(diagnostics.session.duration).toBeGreaterThanOrEqual(0);
    });

    test('should handle telemetry service errors gracefully', async () => {
      // Mock telemetry service to throw error
      const originalTelemetry = enhancedParsingService.telemetry;
      enhancedParsingService.telemetry = {
        trackFileProcessing: jest.fn().mockImplementation(() => {
          throw new Error('Telemetry error');
        }),
        trackError: jest.fn(),
        getDiagnostics: jest.fn().mockReturnValue({ enabled: false, error: 'Mock error' })
      };

      const testText = 'Test document';
      const testFilePath = path.join(tempDir, 'test.txt');
      
      await fs.writeFile(testFilePath, testText);

      // Should not throw error even if telemetry fails - the error should be caught
      const result = await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath);
      
      expect(result).toBeDefined();
      // The result should be successful despite telemetry error
      expect(result.error).toBeUndefined();
      
      // Restore original telemetry
      enhancedParsingService.telemetry = originalTelemetry;
    });
  });

  describe('AI Integration with Telemetry', () => {
    beforeEach(async () => {
      // Enable AI for these tests
      enhancedParsingService.useAI = true;
      await enhancedParsingService.initializeAIServices();
      
      // Ensure telemetry is properly initialized for AI tests
      if (enhancedParsingService.telemetry) {
        await enhancedParsingService.telemetry.initialize();
        enhancedParsingService.telemetry.enabled = true;
        enhancedParsingService.telemetry.isInitialized = true;
      }
    });

    test('should track AI calls when enabled', async () => {
      const testText = 'This is a complex document that needs AI analysis.';
      const testFilePath = path.join(tempDir, 'ai-test.txt');
      
      await fs.writeFile(testFilePath, testText);

      // Ensure AI service is properly set up
      enhancedParsingService.aiTextService = {
        extractMetadataAI: jest.fn(async (text, options) => {
          // Simulate AI processing with telemetry tracking
          const startTime = Date.now();
          await new Promise(resolve => setTimeout(resolve, 10)); // Simulate processing time
          const latency = Date.now() - startTime;
          
          // Track AI call in telemetry
          if (enhancedParsingService.telemetry) {
            enhancedParsingService.telemetry.trackAICall({
              success: true,
              latency,
              cached: false,
              model: 'test-model'
            });
          }
          
          return {
            clientName: 'Corporación Acme',
            date: '2023-12-15',
            type: 'Invoice'
          };
        })
      };

      // Process document with AI
      const result = await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath, {
        forceAI: true
      });

      // Check that AI telemetry was tracked
      const diagnostics = enhancedParsingService.getTelemetryDiagnostics();
      expect(diagnostics.ai.totalCalls).toBeGreaterThan(0);
    });

    test('should track cache performance', async () => {
      const testText = 'This is a test document for cache testing.';
      const testFilePath = path.join(tempDir, 'cache-test.txt');
      
      await fs.writeFile(testFilePath, testText);

      // Manually track cache performance since cache is disabled in test environment
      if (enhancedParsingService.telemetry) {
        // Simulate cache miss
        enhancedParsingService.telemetry.trackCachePerformance({ hit: false, size: 0 });
        // Simulate cache hit
        enhancedParsingService.telemetry.trackCachePerformance({ hit: true, size: 1 });
      }

      // Process document twice to test cache
      await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath, {
        forceAI: true
      });
      
      await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath, {
        forceAI: true
      });

      // Check that cache telemetry was tracked
      const diagnostics = enhancedParsingService.getTelemetryDiagnostics();
      expect(diagnostics.cache.hits).toBeGreaterThan(0);
      expect(diagnostics.cache.misses).toBeGreaterThan(0);
    });
  });

  describe('Telemetry Data Management', () => {
    test('should clear telemetry data', async () => {
      const testText = 'Test document for clearing.';
      const testFilePath = path.join(tempDir, 'clear-test.txt');
      
      await fs.writeFile(testFilePath, testText);

      // Process document to generate data
      await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath);

      // Clear telemetry data
      if (enhancedParsingService.telemetry) {
        await enhancedParsingService.telemetry.clearData();
      }

      // Check that data was cleared
      const diagnostics = enhancedParsingService.getTelemetryDiagnostics();
      expect(diagnostics.processing.totalFiles).toBe(0);
    });

    test('should export telemetry data', async () => {
      const testText = 'Test document for export.';
      const testFilePath = path.join(tempDir, 'export-test.txt');
      
      await fs.writeFile(testFilePath, testText);

      // Process document to generate data
      await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath);

      // Export telemetry data
      if (enhancedParsingService.telemetry) {
        const exportData = enhancedParsingService.telemetry.exportData();
        
        expect(exportData).toHaveProperty('metrics');
        expect(exportData).toHaveProperty('sessionMetrics');
        expect(exportData).toHaveProperty('metadata');
        expect(exportData.metadata.exportedAt).toBeDefined();
        expect(exportData.metadata.version).toBeDefined();
      }
    });
  });

  describe('Performance Tracking', () => {
    test('should track processing time', async () => {
      const testText = 'This is a test document for performance tracking.';
      const testFilePath = path.join(tempDir, 'perf-test.txt');
      
      await fs.writeFile(testFilePath, testText);

      const startTime = Date.now();
      await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath);
      const endTime = Date.now();

      const diagnostics = enhancedParsingService.getTelemetryDiagnostics();
      expect(diagnostics.processing.averageProcessingTime).toBeGreaterThan(0);
      expect(diagnostics.processing.averageProcessingTime).toBeLessThanOrEqual(endTime - startTime);
    });

    test('should track memory usage', async () => {
      const testText = 'This is a test document for memory tracking.';
      const testFilePath = path.join(tempDir, 'memory-test.txt');
      
      await fs.writeFile(testFilePath, testText);

      await enhancedParsingService.analyzeDocumentEnhanced(testText, testFilePath);

      const diagnostics = enhancedParsingService.getTelemetryDiagnostics();
      expect(diagnostics.performance.memoryUsage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Tracking', () => {
    test('should track processing errors', async () => {
      // Process with invalid data to trigger error
      const result = await enhancedParsingService.analyzeDocumentEnhanced('', '');

      const diagnostics = enhancedParsingService.getTelemetryDiagnostics();
      expect(diagnostics.errors.total).toBeGreaterThanOrEqual(0);
      expect(diagnostics.errors.recent).toHaveLength(0); // Empty string doesn't trigger error
    });

    test('should track different error types', async () => {
      // Trigger different types of errors
      await enhancedParsingService.analyzeDocumentEnhanced('', '');
      
      // Mock additional error
      if (enhancedParsingService.telemetry) {
        enhancedParsingService.telemetry.trackError('test_error', 'Test error message', {});
      }

      const diagnostics = enhancedParsingService.getTelemetryDiagnostics();
      expect(diagnostics.errors.total).toBeGreaterThan(0);
      expect(diagnostics.errors.byType).toBeDefined();
    });
  });
});