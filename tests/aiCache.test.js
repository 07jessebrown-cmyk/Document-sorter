const AICache = require('../src/services/aiCache');
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

describe('AICache', () => {
  let cache;
  let mockFs;

  beforeEach(() => {
    // Reset mocks
    mockFs = require('fs').promises;
    jest.clearAllMocks();
    
    // Create cache with test directory
    cache = new AICache({
      cacheDir: '/test/cache',
      maxCacheSize: 10,
      maxAge: 1000 // 1 second for testing
    });
  });

  afterEach(async () => {
    if (cache) {
      await cache.close();
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultCache = new AICache();
      
      expect(defaultCache.maxCacheSize).toBe(1000);
      expect(defaultCache.maxAge).toBe(7 * 24 * 60 * 60 * 1000); // 7 days
      expect(defaultCache.compressionEnabled).toBe(true);
      expect(defaultCache.isLoaded).toBe(false);
    });

    it('should initialize with custom options', () => {
      const customCache = new AICache({
        cacheDir: '/custom/cache',
        maxCacheSize: 500,
        maxAge: 5000,
        compressionEnabled: false
      });
      
      expect(customCache.cacheDir).toBe('/custom/cache');
      expect(customCache.maxCacheSize).toBe(500);
      expect(customCache.maxAge).toBe(5000);
      expect(customCache.compressionEnabled).toBe(false);
    });

    it('should set correct default cache directory for different platforms', () => {
      const originalPlatform = process.platform;
      
      // Test Windows
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const winCache = new AICache();
      expect(winCache.getDefaultCacheDir()).toContain('AppData');
      
      // Test macOS
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const macCache = new AICache();
      expect(macCache.getDefaultCacheDir()).toContain('Library');
      
      // Test Linux
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const linuxCache = new AICache();
      expect(linuxCache.getDefaultCacheDir()).toContain('.config');
      
      // Restore original platform
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('generateHash', () => {
    it('should generate consistent SHA256 hash', () => {
      const text = 'test document text';
      const hash1 = cache.generateHash(text);
      const hash2 = cache.generateHash(text);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 produces 64 character hex string
      expect(hash1).toMatch(/^[a-f0-9]+$/); // Only hex characters
    });

    it('should generate different hashes for different text', () => {
      const text1 = 'document one';
      const text2 = 'document two';
      
      const hash1 = cache.generateHash(text1);
      const hash2 = cache.generateHash(text2);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('initialize', () => {
    it('should initialize cache successfully', async () => {
      mockFs.mkdir.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' }); // File doesn't exist
      
      await cache.initialize();
      
      expect(cache.isLoaded).toBe(true);
      expect(mockFs.mkdir).toHaveBeenCalledWith('/test/cache', { recursive: true });
    });

    it('should load existing cache data', async () => {
      const existingData = {
        entries: {
          'hash1': { data: { clientName: 'Test' }, timestamp: Date.now(), accessCount: 1 }
        },
        stats: { hits: 5, misses: 2 }
      };
      
      mockFs.mkdir.mockResolvedValue();
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingData));
      
      await cache.initialize();
      
      expect(cache.isLoaded).toBe(true);
      expect(cache.memoryCache.has('hash1')).toBe(true);
      expect(cache.stats.hits).toBe(5);
    });

    it('should handle initialization errors gracefully', async () => {
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));
      
      await cache.initialize();
      
      expect(cache.isLoaded).toBe(false);
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      await cache.initialize();
    });

    it('should return null for non-existent hash', async () => {
      const result = await cache.get('nonexistent');
      
      expect(result).toBeNull();
      expect(cache.stats.misses).toBe(1);
    });

    it('should return cached data for existing hash', async () => {
      const testData = { clientName: 'Test Corp', confidence: 0.9 };
      const hash = cache.generateHash('test text');
      
      await cache.set(hash, testData);
      const result = await cache.get(hash);
      
      expect(result).toEqual(testData);
      expect(cache.stats.hits).toBe(1);
    });

    it('should return null for expired entry', async () => {
      const testData = { clientName: 'Test Corp' };
      const hash = cache.generateHash('test text');
      
      // Set entry with old timestamp
      cache.memoryCache.set(hash, {
        data: testData,
        timestamp: Date.now() - 2000, // 2 seconds ago
        accessCount: 0
      });
      
      const result = await cache.get(hash);
      
      expect(result).toBeNull();
      expect(cache.stats.evictions).toBe(1);
    });
  });

  describe('set', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      await cache.initialize();
    });

    it('should store data in cache', async () => {
      const testData = { clientName: 'Test Corp', confidence: 0.9 };
      const hash = cache.generateHash('test text');
      
      await cache.set(hash, testData);
      
      expect(cache.memoryCache.has(hash)).toBe(true);
      expect(cache.stats.sets).toBe(1);
    });

    it('should trigger eviction when cache is full', async () => {
      // Fill cache to max size
      for (let i = 0; i < 10; i++) {
        const hash = cache.generateHash(`text ${i}`);
        await cache.set(hash, { data: `test ${i}` });
      }
      
      // Add one more to trigger eviction
      const hash = cache.generateHash('overflow text');
      await cache.set(hash, { data: 'overflow' });
      
      expect(cache.memoryCache.size).toBeLessThanOrEqual(10);
      expect(cache.stats.evictions).toBeGreaterThan(0);
    });
  });

  describe('has', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      await cache.initialize();
    });

    it('should return false for non-existent hash', async () => {
      const result = await cache.has('nonexistent');
      
      expect(result).toBe(false);
    });

    it('should return true for existing hash', async () => {
      const hash = cache.generateHash('test text');
      await cache.set(hash, { clientName: 'Test Corp' });
      
      const result = await cache.has(hash);
      
      expect(result).toBe(true);
    });

    it('should return false for expired entry', async () => {
      const hash = cache.generateHash('test text');
      
      // Set entry with old timestamp
      cache.memoryCache.set(hash, {
        data: { clientName: 'Test Corp' },
        timestamp: Date.now() - 2000,
        accessCount: 0
      });
      
      const result = await cache.has(hash);
      
      expect(result).toBe(false);
      expect(cache.stats.evictions).toBe(1);
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      await cache.initialize();
    });

    it('should remove expired entries', async () => {
      const hash1 = cache.generateHash('text1');
      const hash2 = cache.generateHash('text2');
      
      // Add one fresh entry and one expired entry
      cache.memoryCache.set(hash1, {
        data: { clientName: 'Fresh' },
        timestamp: Date.now(),
        accessCount: 0
      });
      
      cache.memoryCache.set(hash2, {
        data: { clientName: 'Expired' },
        timestamp: Date.now() - 2000,
        accessCount: 0
      });
      
      await cache.cleanup();
      
      expect(cache.memoryCache.has(hash1)).toBe(true);
      expect(cache.memoryCache.has(hash2)).toBe(false);
      expect(cache.stats.evictions).toBe(1);
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      await cache.initialize();
    });

    it('should clear all entries and reset stats', async () => {
      // Add some data
      const hash = cache.generateHash('test text');
      await cache.set(hash, { clientName: 'Test Corp' });
      
      expect(cache.memoryCache.size).toBe(1);
      expect(cache.stats.sets).toBe(1);
      
      // Clear cache
      await cache.clear();
      
      expect(cache.memoryCache.size).toBe(0);
      expect(cache.stats.sets).toBe(0);
      expect(cache.stats.hits).toBe(0);
      expect(cache.stats.misses).toBe(0);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      await cache.initialize();
    });

    it('should return cache statistics', () => {
      const stats = cache.getStats();
      
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('sets');
      expect(stats).toHaveProperty('evictions');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('isLoaded');
    });

    it('should calculate hit rate correctly', async () => {
      const hash = cache.generateHash('test text');
      
      // Generate some hits and misses
      await cache.get('nonexistent'); // miss
      await cache.set(hash, { clientName: 'Test' });
      await cache.get(hash); // hit
      await cache.get(hash); // hit
      
      const stats = cache.getStats();
      
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(66.67);
    });
  });

  describe('export and import', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      await cache.initialize();
    });

    it('should export cache data', async () => {
      const hash = cache.generateHash('test text');
      await cache.set(hash, { clientName: 'Test Corp' });
      
      const exported = await cache.export();
      
      expect(exported).toHaveProperty('entries');
      expect(exported).toHaveProperty('stats');
      expect(exported).toHaveProperty('metadata');
      expect(exported.entries[hash]).toBeDefined();
    });

    it('should import cache data', async () => {
      const importData = {
        entries: {
          'hash1': { data: { clientName: 'Imported' }, timestamp: Date.now(), accessCount: 1 }
        },
        stats: { hits: 10, misses: 5 }
      };
      
      await cache.import(importData);
      
      expect(cache.memoryCache.has('hash1')).toBe(true);
      expect(cache.stats.hits).toBe(10);
    });
  });

  describe('close', () => {
    it('should close cache and save final state', async () => {
      mockFs.mkdir.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      await cache.initialize();
      
      await cache.close();
      
      expect(cache.isLoaded).toBe(false);
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('getCacheSize', () => {
    it('should return cache file size', async () => {
      mockFs.stat.mockResolvedValue({ size: 1024 });
      
      const size = await cache.getCacheSize();
      
      expect(size).toBe(1024);
      expect(mockFs.stat).toHaveBeenCalledWith(cache.cacheFile);
    });

    it('should return 0 if file does not exist', async () => {
      mockFs.stat.mockRejectedValue({ code: 'ENOENT' });
      
      const size = await cache.getCacheSize();
      
      expect(size).toBe(0);
    });
  });

  describe('Integration tests', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      await cache.initialize();
    });

    it('should work end-to-end with real document text', async () => {
      const documentText = 'INVOICE #12345\nAcme Corporation\nAmount: $1,500.00';
      const hash = cache.generateHash(documentText);
      const aiResult = {
        clientName: 'Acme Corporation',
        clientConfidence: 0.95,
        date: '2024-01-15',
        dateConfidence: 0.90,
        docType: 'Invoice',
        docTypeConfidence: 0.98,
        snippets: ['INVOICE #12345', 'Acme Corporation']
      };
      
      // Set data
      await cache.set(hash, aiResult);
      
      // Check if exists
      const exists = await cache.has(hash);
      expect(exists).toBe(true);
      
      // Get data
      const retrieved = await cache.get(hash);
      expect(retrieved).toEqual(aiResult);
      
      // Verify stats
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.sets).toBe(1);
      expect(stats.size).toBe(1);
    });

    it('should handle multiple documents efficiently', async () => {
      const documents = [
        'Invoice from ABC Corp',
        'Contract with XYZ Ltd',
        'Receipt from Store 123'
      ];
      
      // Store multiple documents
      for (const doc of documents) {
        const hash = cache.generateHash(doc);
        await cache.set(hash, { clientName: doc.split(' ')[1], confidence: 0.9 });
      }
      
      // Retrieve all documents
      for (const doc of documents) {
        const hash = cache.generateHash(doc);
        const result = await cache.get(hash);
        expect(result).toBeDefined();
        expect(result.clientName).toBe(doc.split(' ')[1]);
      }
      
      const stats = cache.getStats();
      expect(stats.size).toBe(3);
      expect(stats.hits).toBe(3);
    });
  });
});
