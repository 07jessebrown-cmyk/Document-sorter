const TelemetryService = require('../../src/services/telemetryService');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('TelemetryService', () => {
  let telemetryService;
  let tempDir;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = path.join(os.tmpdir(), `telemetry-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    telemetryService = new TelemetryService({
      enabled: true,
      logDir: tempDir,
      maxLogSize: 1024 * 1024, // 1MB for testing
      retentionDays: 1
    });
  });

  afterEach(async () => {
    if (telemetryService) {
      await telemetryService.close();
    }
    
    // Clean up temp directory
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    test('should initialize with default settings', () => {
      const service = new TelemetryService();
      expect(service.enabled).toBe(true);
      expect(service.maxLogSize).toBe(10 * 1024 * 1024);
      expect(service.retentionDays).toBe(30);
    });

    test('should initialize with custom settings', () => {
      const service = new TelemetryService({
        enabled: false,
        maxLogSize: 1024,
        retentionDays: 7
      });
      expect(service.enabled).toBe(false);
      expect(service.maxLogSize).toBe(1024);
      expect(service.retentionDays).toBe(7);
    });

    test('should initialize successfully', async () => {
      await telemetryService.initialize();
      expect(telemetryService.isInitialized).toBe(true);
    });

    test('should handle initialization failure gracefully', async () => {
      const invalidService = new TelemetryService({
        enabled: true,
        logDir: '/invalid/path/that/does/not/exist'
      });
      
      await invalidService.initialize();
      expect(invalidService.isInitialized).toBe(false);
    });
  });

  describe('AI Call Tracking', () => {
    beforeEach(async () => {
      await telemetryService.initialize();
    });

    test('should track successful AI call', () => {
      telemetryService.trackAICall({
        success: true,
        latency: 1500,
        cached: false,
        model: 'gpt-3.5-turbo'
      });

      const metrics = telemetryService.getMetrics();
      expect(metrics.aiCalls.total).toBe(1);
      expect(metrics.aiCalls.successful).toBe(1);
      expect(metrics.aiCalls.failed).toBe(0);
      expect(metrics.aiCalls.averageLatency).toBe(1500);
    });

    test('should track failed AI call', () => {
      telemetryService.trackAICall({
        success: false,
        latency: 500,
        cached: false,
        model: 'gpt-3.5-turbo',
        error: 'API timeout'
      });

      const metrics = telemetryService.getMetrics();
      expect(metrics.aiCalls.total).toBe(1);
      expect(metrics.aiCalls.successful).toBe(0);
      expect(metrics.aiCalls.failed).toBe(1);
    });

    test('should track cached AI call', () => {
      telemetryService.trackAICall({
        success: true,
        latency: 50,
        cached: true,
        model: 'gpt-3.5-turbo'
      });

      const metrics = telemetryService.getMetrics();
      expect(metrics.aiCalls.cached).toBe(1);
    });

    test('should calculate average latency correctly', () => {
      telemetryService.trackAICall({
        success: true,
        latency: 1000,
        cached: false,
        model: 'gpt-3.5-turbo'
      });

      telemetryService.trackAICall({
        success: true,
        latency: 2000,
        cached: false,
        model: 'gpt-3.5-turbo'
      });

      const metrics = telemetryService.getMetrics();
      expect(metrics.aiCalls.averageLatency).toBe(1500);
    });
  });

  describe('Cache Performance Tracking', () => {
    beforeEach(async () => {
      await telemetryService.initialize();
    });

    test('should track cache hit', () => {
      telemetryService.trackCachePerformance({
        hit: true,
        size: 100
      });

      const metrics = telemetryService.getMetrics();
      expect(metrics.cache.hits).toBe(1);
      expect(metrics.cache.misses).toBe(0);
      expect(metrics.cache.hitRate).toBe(100);
    });

    test('should track cache miss', () => {
      telemetryService.trackCachePerformance({
        hit: false,
        size: 100
      });

      const metrics = telemetryService.getMetrics();
      expect(metrics.cache.hits).toBe(0);
      expect(metrics.cache.misses).toBe(1);
      expect(metrics.cache.hitRate).toBe(0);
    });

    test('should track cache eviction', () => {
      telemetryService.trackCachePerformance({
        hit: false,
        size: 100,
        eviction: true
      });

      const metrics = telemetryService.getMetrics();
      expect(metrics.cache.evictions).toBe(1);
    });

    test('should calculate hit rate correctly', () => {
      telemetryService.trackCachePerformance({ hit: true, size: 100 });
      telemetryService.trackCachePerformance({ hit: true, size: 100 });
      telemetryService.trackCachePerformance({ hit: false, size: 100 });

      const metrics = telemetryService.getMetrics();
      expect(metrics.cache.hitRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('File Processing Tracking', () => {
    beforeEach(async () => {
      await telemetryService.initialize();
    });

    test('should track regex processing', () => {
      telemetryService.trackFileProcessing({
        method: 'regex',
        confidence: 0.8,
        processingTime: 500,
        success: true
      });

      const metrics = telemetryService.getMetrics();
      expect(metrics.processing.totalFiles).toBe(1);
      expect(metrics.processing.regexProcessed).toBe(1);
      expect(metrics.processing.aiProcessed).toBe(0);
      expect(metrics.processing.averageConfidence).toBe(0.8);
    });

    test('should track AI processing', () => {
      telemetryService.trackFileProcessing({
        method: 'ai',
        confidence: 0.9,
        processingTime: 2000,
        success: true
      });

      const metrics = telemetryService.getMetrics();
      expect(metrics.processing.totalFiles).toBe(1);
      expect(metrics.processing.regexProcessed).toBe(0);
      expect(metrics.processing.aiProcessed).toBe(1);
      expect(metrics.processing.averageConfidence).toBe(0.9);
    });

    test('should track processing failure', () => {
      telemetryService.trackFileProcessing({
        method: 'regex',
        confidence: 0,
        processingTime: 100,
        success: false
      });

      const metrics = telemetryService.getMetrics();
      expect(metrics.processing.totalFiles).toBe(1);
      expect(metrics.session.errors).toBe(1);
    });
  });

  describe('Error Tracking', () => {
    beforeEach(async () => {
      await telemetryService.initialize();
    });

    test('should track error', () => {
      telemetryService.trackError('test_error', 'Test error message', { context: 'test' });

      const metrics = telemetryService.getMetrics();
      expect(metrics.errors.total).toBe(1);
      expect(metrics.errors.byType.test_error).toBe(1);
      expect(metrics.errors.recent).toHaveLength(1);
      expect(metrics.errors.recent[0].type).toBe('test_error');
      expect(metrics.errors.recent[0].message).toBe('Test error message');
    });

    test('should limit recent errors to 50', () => {
      for (let i = 0; i < 60; i++) {
        telemetryService.trackError('test_error', `Error ${i}`, {});
      }

      const metrics = telemetryService.getMetrics();
      expect(metrics.errors.recent).toHaveLength(50);
      expect(metrics.errors.total).toBe(60);
    });

    test('should track multiple error types', () => {
      telemetryService.trackError('error1', 'Error 1', {});
      telemetryService.trackError('error2', 'Error 2', {});
      telemetryService.trackError('error1', 'Error 1 again', {});

      const metrics = telemetryService.getMetrics();
      expect(metrics.errors.byType.error1).toBe(2);
      expect(metrics.errors.byType.error2).toBe(1);
    });
  });

  describe('Performance Metrics', () => {
    beforeEach(async () => {
      await telemetryService.initialize();
    });

    test('should update performance metrics', () => {
      telemetryService.updatePerformanceMetrics({
        memoryUsage: 128.5,
        cpuUsage: 25.3
      });

      const metrics = telemetryService.getMetrics();
      expect(metrics.performance.memoryUsage).toBe(128.5);
      expect(metrics.performance.cpuUsage).toBe(25.3);
    });
  });

  describe('Diagnostics', () => {
    beforeEach(async () => {
      await telemetryService.initialize();
    });

    test('should provide diagnostics data', () => {
      // Add some test data
      telemetryService.trackAICall({
        success: true,
        latency: 1000,
        cached: false,
        model: 'gpt-3.5-turbo'
      });

      telemetryService.trackCachePerformance({
        hit: true,
        size: 50
      });

      telemetryService.trackFileProcessing({
        method: 'regex',
        confidence: 0.8,
        processingTime: 500,
        success: true
      });

      const diagnostics = telemetryService.getDiagnostics();
      
      expect(diagnostics.ai.totalCalls).toBe(1);
      expect(diagnostics.ai.successfulCalls).toBe(1);
      expect(diagnostics.cache.hits).toBe(1);
      expect(diagnostics.processing.totalFiles).toBe(1);
      expect(diagnostics.session.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Data Persistence', () => {
    test('should save and load metrics', async () => {
      await telemetryService.initialize();
      
      // Add some data
      telemetryService.trackAICall({
        success: true,
        latency: 1000,
        cached: false,
        model: 'gpt-3.5-turbo'
      });

      // Save metrics
      await telemetryService.saveMetrics();

      // Create new service instance and load data
      const newService = new TelemetryService({
        enabled: true,
        logDir: tempDir
      });

      await newService.initialize();
      const metrics = newService.getMetrics();
      
      expect(metrics.aiCalls.total).toBe(1);
      expect(metrics.aiCalls.successful).toBe(1);

      await newService.close();
    });
  });

  describe('Data Management', () => {
    beforeEach(async () => {
      await telemetryService.initialize();
    });

    test('should clear all data', async () => {
      // Add some data
      telemetryService.trackAICall({
        success: true,
        latency: 1000,
        cached: false,
        model: 'gpt-3.5-turbo'
      });

      // Clear data
      await telemetryService.clearData();

      const metrics = telemetryService.getMetrics();
      expect(metrics.aiCalls.total).toBe(0);
      expect(metrics.cache.hits).toBe(0);
      expect(metrics.processing.totalFiles).toBe(0);
    });

    test('should export data', () => {
      // Add some data
      telemetryService.trackAICall({
        success: true,
        latency: 1000,
        cached: false,
        model: 'gpt-3.5-turbo'
      });

      const exportData = telemetryService.exportData();
      
      expect(exportData.metrics).toBeDefined();
      expect(exportData.sessionMetrics).toBeDefined();
      expect(exportData.metadata).toBeDefined();
      expect(exportData.metadata.exportedAt).toBeDefined();
      expect(exportData.metadata.version).toBeDefined();
    });
  });

  describe('Disabled State', () => {
    test('should not track when disabled', () => {
      const disabledService = new TelemetryService({ enabled: false });
      
      disabledService.trackAICall({
        success: true,
        latency: 1000,
        cached: false,
        model: 'gpt-3.5-turbo'
      });

      const metrics = disabledService.getMetrics();
      expect(metrics.aiCalls.total).toBe(0);
    });
  });
});
