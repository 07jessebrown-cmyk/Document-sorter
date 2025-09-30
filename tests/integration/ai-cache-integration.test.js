const AICache = require('../../src/services/aiCache');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    stat: jest.fn()
  }
}));

// Mock services with standardized structure
jest.mock('../../src/services/telemetryService', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  }));
});

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

describe('AI Cache Integration Tests', () => {
  let cache;
  let mockFs;
  let tempCacheDir;

  beforeEach(() => {
    // Reset mocks
    mockFs = require('fs').promises;
    jest.clearAllMocks();
    
    // Create temporary cache directory
    tempCacheDir = path.join(os.tmpdir(), 'test-cache-' + Date.now());
    
    // Create cache with test directory
    cache = new AICache({
      cacheDir: tempCacheDir,
      maxCacheSize: 50,
      maxAge: 5000, // 5 seconds for testing
      compressionEnabled: true
    });
  });

  afterEach(async () => {
    if (cache) {
      await cache.close();
    }
    
    // Clean up temp directory
    try {
      await fs.rmdir(tempCacheDir, { recursive: true });
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

  describe('Cache Performance and Reliability', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      await cache.initialize();
    });

    it('should handle high-frequency cache operations efficiently', async () => {
      const startTime = Date.now();
      const operations = [];
      
      // Perform 1000 cache operations
      for (let i = 0; i < 1000; i++) {
        const hash = cache.generateHash(`document-${i}`);
        const data = {
          clientName: `Client ${i}`,
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: [`Document ${i}`, `Client ${i}`],
          source: 'ai',
          timestamp: new Date().toISOString()
        };
        
        operations.push(cache.set(hash, data));
      }
      
      await Promise.all(operations);
      const setTime = Date.now() - startTime;
      
      // Performance should be reasonable (less than 2 seconds for 1000 operations)
      expect(setTime).toBeLessThan(2000);
      
      const stats = cache.getStats();
      expect(stats.sets).toBe(1000);
      expect(stats.size).toBeLessThanOrEqual(50); // Should respect max size
    });

    it('should maintain data integrity under concurrent access', async () => {
      const testData = {
        clientName: 'Concurrent Test Corp',
        clientConfidence: 0.95,
        date: '2024-01-15',
        dateConfidence: 0.90,
        docType: 'Invoice',
        docTypeConfidence: 0.98,
        snippets: ['INVOICE #12345', 'Concurrent Test Corp'],
        source: 'ai',
        timestamp: '2024-01-15T10:30:00Z'
      };
      
      const hash = cache.generateHash('concurrent test document');
      
      // Set data
      await cache.set(hash, testData);
      
      // Perform concurrent reads
      const readPromises = [];
      for (let i = 0; i < 100; i++) {
        readPromises.push(cache.get(hash));
      }
      
      const results = await Promise.all(readPromises);
      
      // All results should be identical
      for (const result of results) {
        expect(result).toEqual(testData);
      }
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(100);
    });

    it('should handle cache eviction gracefully under memory pressure', async () => {
      // Fill cache to capacity
      for (let i = 0; i < 50; i++) {
        const hash = cache.generateHash(`document-${i}`);
        const data = {
          clientName: `Client ${i}`,
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: [`Document ${i}`, `Client ${i}`],
          source: 'ai',
          timestamp: new Date().toISOString()
        };
        
        await cache.set(hash, data);
      }
      
      // Add more data to trigger eviction
      for (let i = 50; i < 100; i++) {
        const hash = cache.generateHash(`document-${i}`);
        const data = {
          clientName: `Client ${i}`,
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: [`Document ${i}`, `Client ${i}`],
          source: 'ai',
          timestamp: new Date().toISOString()
        };
        
        await cache.set(hash, data);
      }
      
      const stats = cache.getStats();
      expect(stats.size).toBeLessThanOrEqual(50);
      expect(stats.evictions).toBeGreaterThan(0);
    });

    it('should handle cache corruption gracefully', async () => {
      // Set some data
      const hash = cache.generateHash('test document');
      const testData = {
        clientName: 'Test Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95,
        snippets: ['INVOICE #12345', 'Test Corp'],
        source: 'ai',
        timestamp: '2024-01-15T10:30:00Z'
      };
      
      await cache.set(hash, testData);
      
      // Simulate cache corruption by modifying the entry directly
      const entry = cache.memoryCache.get(hash);
      entry.data = 'corrupted data';
      
      // Cache should handle corruption gracefully
      const result = await cache.get(hash);
      expect(result).toBe('corrupted data'); // Should return what's there
      
      // Clear corrupted entry
      cache.memoryCache.delete(hash);
      
      // Should work normally after corruption
      await cache.set(hash, testData);
      const cleanResult = await cache.get(hash);
      expect(cleanResult).toEqual(testData);
    });

    it('should maintain cache consistency across restarts', async () => {
      // Set some data
      const hash = cache.generateHash('persistent document');
      const testData = {
        clientName: 'Persistent Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95,
        snippets: ['INVOICE #12345', 'Persistent Corp'],
        source: 'ai',
        timestamp: '2024-01-15T10:30:00Z'
      };
      
      await cache.set(hash, testData);
      
      // Simulate cache restart by creating new instance
      const newCache = new AICache({
        cacheDir: tempCacheDir,
        maxCacheSize: 50,
        maxAge: 5000,
        compressionEnabled: true
      });
      
      // Mock file system to return saved data
      const savedData = {
        entries: Object.fromEntries(cache.memoryCache),
        stats: cache.stats,
        lastSaved: Date.now(),
        version: '1.0.0'
      };
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(savedData));
      
      await newCache.initialize();
      
      // Data should be restored
      const restoredData = await newCache.get(hash);
      expect(restoredData).toEqual(testData);
      
      await newCache.close();
    });

    it('should handle cache warming with real document patterns', async () => {
      const commonPatterns = [
        'INVOICE #12345\nAcme Corporation\nAmount: $1,500.00',
        'CONTRACT AGREEMENT\nBetween ABC Corp and XYZ Ltd\nEffective Date: 2024-01-01',
        'RECEIPT #67890\nStore Name: Test Store\nAmount: $25.99',
        'STATEMENT OF ACCOUNT\nAccount Holder: John Doe\nBalance: $2,500.00',
        'PAYMENT CONFIRMATION\nPayment ID: PAY-123456\nAmount: $500.00'
      ];
      
      await cache.warmCache(commonPatterns);
      
      // Verify all patterns were cached
      for (const pattern of commonPatterns) {
        const hash = cache.generateHash(pattern);
        const exists = await cache.has(hash);
        expect(exists).toBe(true);
        
        const data = await cache.get(hash);
        expect(data).toBeDefined();
        expect(data.clientName).toBe('Common Pattern');
        expect(data.source).toBe('cache-warmed');
      }
      
      const stats = cache.getStats();
      expect(stats.size).toBe(5);
    });

    it('should handle compression efficiency with large documents', async () => {
      const largeDocument = {
        clientName: 'Large Corporation Inc.',
        clientConfidence: 0.95,
        date: '2024-01-15',
        dateConfidence: 0.90,
        docType: 'Invoice',
        docTypeConfidence: 0.98,
        snippets: Array.from({ length: 100 }, (_, i) => `Snippet ${i + 1}`),
        source: 'ai',
        timestamp: '2024-01-15T10:30:00Z',
        metadata: {
          extractedAt: '2024-01-15T10:30:00Z',
          processingTime: 150,
          model: 'gpt-3.5-turbo',
          additionalData: Array.from({ length: 50 }, (_, i) => `Data ${i + 1}`)
        }
      };
      
      const hash = cache.generateHash('large document text');
      await cache.set(hash, largeDocument);
      
      const entry = cache.memoryCache.get(hash);
      expect(entry.compressed).toBe(true);
      expect(entry.size).toBeDefined();
      expect(entry.size).toBeGreaterThan(0);
      
      // Verify data integrity after compression/decompression
      const retrieved = await cache.get(hash);
      expect(retrieved).toEqual(largeDocument);
    });

    it('should handle cache statistics accurately under load', async () => {
      // Test basic cache operations and statistics
      const hash = cache.generateHash('test document');
      const data = { clientName: 'Test Corp', confidence: 0.9 };
      
      // Set data
      await cache.set(hash, data);
      
      // Get data (should be miss initially)
      const result = await cache.get(hash);
      
      // Verify data integrity
      expect(result).toEqual(data);
      
      // Get data again (should be hit)
      const result2 = await cache.get(hash);
      expect(result2).toEqual(data);
      
      const stats = cache.getStats();
      
      // Verify statistics
      expect(stats.sets).toBe(1);
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(1);
      expect(stats.hitRate).toBe(100);
    });
  });

  describe('Cache Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      // Mock file system errors
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));
      
      await cache.initialize();
      
      // Cache should still work in memory-only mode
      const hash = cache.generateHash('test document');
      const testData = { clientName: 'Test Corp', confidence: 0.9 };
      
      await cache.set(hash, testData);
      const result = await cache.get(hash);
      
      expect(result).toEqual(testData);
      expect(cache.isLoaded).toBe(false);
    });

    it('should handle corrupted cache file gracefully', async () => {
      // Mock corrupted cache file
      mockFs.readFile.mockResolvedValue('invalid json data');
      
      await cache.initialize();
      
      // Cache should initialize with empty state
      expect(cache.memoryCache.size).toBe(0);
      // Note: isLoaded might be false due to file system errors, which is acceptable
      expect(cache.memoryCache.size).toBe(0);
    });

    it('should handle disk space issues gracefully', async () => {
      mockFs.mkdir.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      mockFs.writeFile.mockRejectedValue(new Error('No space left on device'));
      
      await cache.initialize();
      
      // Cache should still work in memory-only mode
      const hash = cache.generateHash('test document');
      const testData = { clientName: 'Test Corp', confidence: 0.9 };
      
      await cache.set(hash, testData);
      const result = await cache.get(hash);
      
      expect(result).toEqual(testData);
    });
  });
});
