const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');

/**
 * AI Cache Layer for Document Metadata Extraction
 * Provides persistent caching of AI responses to reduce redundant API calls
 * 
 * This service uses a JSON file in the user data directory to store cached
 * AI responses, keyed by SHA256 hash of the input text.
 */

class AICache {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || this.getDefaultCacheDir();
    this.cacheFile = path.join(this.cacheDir, 'ai_cache.json');
    this.maxCacheSize = options.maxCacheSize || 1000; // Maximum number of entries
    this.maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    this.compressionEnabled = options.compressionEnabled !== false; // Default true
    
    // In-memory cache for performance
    this.memoryCache = new Map();
    this.isLoaded = false;
    this.lastSave = 0;
    this.saveInterval = 30000; // Save every 30 seconds
    
    // Telemetry instance
    this.telemetry = null;
    
    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      lastCleanup: Date.now()
    };

    // Lazy initialization flag
    this.initialized = false;
    this.saveIntervalId = null;
  }

  /**
   * Get the default cache directory based on the operating system
   * @returns {string} Default cache directory path
   */
  getDefaultCacheDir() {
    const homeDir = os.homedir();
    const appName = 'document-sorter';
    
    switch (process.platform) {
      case 'win32':
        return path.join(homeDir, 'AppData', 'Local', appName, 'cache');
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', appName, 'cache');
      default:
        return path.join(homeDir, '.config', appName, 'cache');
    }
  }

  /**
   * Initialize the cache by loading from disk
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return; // Already initialized
    }

    try {
      await this.ensureCacheDir();
      await this.loadFromDisk();
      this.isLoaded = true;
      
      // Set up periodic save
      this.saveIntervalId = setInterval(() => {
        this.saveToDisk().catch(console.error);
      }, this.saveInterval);
      
      this.initialized = true;
      console.log('✅ AI Cache initialized');
      
    } catch (error) {
      console.warn('Failed to initialize AI cache:', error.message);
      this.isLoaded = false;
    }
  }

  /**
   * Ensure the cache directory exists
   * @returns {Promise<void>}
   */
  async ensureCacheDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create cache directory: ${error.message}`);
    }
  }

  /**
   * Load cache data from disk
   * @returns {Promise<void>}
   */
  async loadFromDisk() {
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      const cacheData = JSON.parse(data);
      
      // Load entries into memory cache
      this.memoryCache.clear();
      if (cacheData.entries) {
        for (const [key, entry] of Object.entries(cacheData.entries)) {
          this.memoryCache.set(key, entry);
        }
      }
      
      // Load statistics
      if (cacheData.stats) {
        this.stats = { ...this.stats, ...cacheData.stats };
      }
      
      // Clean up expired entries
      await this.cleanup();
      
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to load AI cache:', error.message);
      }
      // Initialize empty cache if file doesn't exist
      this.memoryCache.clear();
    }
  }

  /**
   * Save cache data to disk
   * @returns {Promise<void>}
   */
  async saveToDisk() {
    if (!this.isLoaded) return;
    
    try {
      const cacheData = {
        entries: Object.fromEntries(this.memoryCache),
        stats: this.stats,
        lastSaved: Date.now(),
        version: '1.0.0'
      };
      
      const data = JSON.stringify(cacheData, null, 2);
      await fs.writeFile(this.cacheFile, data, 'utf8');
      this.lastSave = Date.now();
      
    } catch (error) {
      console.warn('Failed to save AI cache:', error.message);
    }
  }

  /**
   * Set the telemetry instance
   * @param {Object} telemetry - The telemetry instance
   */
  setTelemetry(telemetry) {
    this.telemetry = telemetry;
  }

  /**
   * Generate SHA256 hash of the input text
   * @param {string} text - Input text to hash
   * @returns {string} SHA256 hash
   */
  generateHash(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Get cached result for a given text hash
   * @param {string} hash - SHA256 hash of the input text
   * @param {Object} options - Options including forceRefresh
   * @returns {Promise<Object|null>} Cached result or null if not found/expired
   */
  async get(hash, options = {}) {
    // Disable cache in test environment or when forceRefresh is true
    if (process.env.NODE_ENV === 'test' || options.forceRefresh) {
      this.stats.misses++;
      return null;
    }

    if (!this.isLoaded) {
      await this.initialize();
    }
    
    const entry = this.memoryCache.get(hash);
    
    if (!entry) {
      this.stats.misses++;
      
      // Track cache miss
      if (this.telemetry) {
        this.telemetry.trackCachePerformance({ hit: false, size: this.memoryCache.size });
      }
      
      return null;
    }
    
    // Check if entry is expired
    if (this.isExpired(entry)) {
      this.memoryCache.delete(hash);
      this.stats.evictions++;
      
      // Track cache eviction
      if (this.telemetry) {
        this.telemetry.trackCachePerformance({ hit: false, size: this.memoryCache.size, eviction: true });
      }
      
      return null;
    }
    
    // Update access count for LRU tracking
    entry.accessCount = (entry.accessCount || 0) + 1;
    
    this.stats.hits++;
    
    // Track cache hit
    if (this.telemetry) {
      this.telemetry.trackCachePerformance({ hit: true, size: this.memoryCache.size });
    }
    
    // Decompress data if it was compressed
    return entry.compressed ? this.decompressData(entry.data) : entry.data;
  }

  /**
   * Set cached result for a given text hash
   * @param {string} hash - SHA256 hash of the input text
   * @param {Object} data - Data to cache
   * @returns {Promise<void>}
   */
  async set(hash, data) {
    if (!this.isLoaded) {
      await this.initialize();
    }
    
    // Compress data if compression is enabled
    const processedData = this.compressionEnabled ? this.compressData(data) : data;
    
    const entry = {
      data: processedData,
      timestamp: Date.now(),
      accessCount: 0,
      compressed: this.compressionEnabled,
      size: this.calculateDataSize(processedData)
    };
    
    this.memoryCache.set(hash, entry);
    this.stats.sets++;
    
    // Check if we need to evict entries
    if (this.memoryCache.size > this.maxCacheSize) {
      await this.evictOldest();
    }
    
    // Track cache set
    if (this.telemetry) {
      this.telemetry.trackCachePerformance({ hit: false, size: this.memoryCache.size });
    }
    
    // Save to disk asynchronously
    this.saveToDisk().catch(console.error);
  }

  /**
   * Check if a hash exists in the cache
   * @param {string} hash - SHA256 hash of the input text
   * @returns {Promise<boolean>} True if hash exists and is not expired
   */
  async has(hash) {
    if (!this.isLoaded) {
      await this.initialize();
    }
    
    const entry = this.memoryCache.get(hash);
    
    if (!entry) {
      return false;
    }
    
    if (this.isExpired(entry)) {
      this.memoryCache.delete(hash);
      this.stats.evictions++;
      return false;
    }
    
    return true;
  }

  /**
   * Check if a cache entry is expired
   * @param {Object} entry - Cache entry
   * @returns {boolean} True if expired
   */
  isExpired(entry) {
    return (Date.now() - entry.timestamp) > this.maxAge;
  }

  /**
   * Evict entries using advanced LRU strategy with access count weighting
   * @returns {Promise<void>}
   */
  async evictOldest() {
    const entries = Array.from(this.memoryCache.entries());
    
    // Calculate eviction score for each entry
    const now = Date.now();
    const scoredEntries = entries.map(([key, entry]) => {
      const age = now - entry.timestamp;
      const accessScore = entry.accessCount || 0;
      
      // Higher score = more likely to be evicted
      // Factors: age (older = higher score), access count (lower = higher score)
      const evictionScore = (age / this.maxAge) - (accessScore * 0.1);
      
      return { key, entry, evictionScore };
    });
    
    // Sort by eviction score (highest first = most likely to evict)
    scoredEntries.sort((a, b) => b.evictionScore - a.evictionScore);
    
    // Remove 10% of entries or enough to get under max size
    const toRemove = Math.max(
      Math.ceil(entries.length * 0.1),
      entries.length - this.maxCacheSize + 1
    );
    
    for (let i = 0; i < toRemove && i < scoredEntries.length; i++) {
      this.memoryCache.delete(scoredEntries[i].key);
      this.stats.evictions++;
    }
  }

  /**
   * Clean up expired entries
   * @returns {Promise<void>}
   */
  async cleanup() {
    const now = Date.now();
    const entriesToDelete = [];
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (this.isExpired(entry)) {
        entriesToDelete.push(key);
      }
    }
    
    for (const key of entriesToDelete) {
      this.memoryCache.delete(key);
      this.stats.evictions++;
    }
    
    this.stats.lastCleanup = now;
  }

  /**
   * Clear all cached entries
   * @returns {Promise<void>}
   */
  async clear() {
    this.memoryCache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      lastCleanup: Date.now()
    };
    
    await this.saveToDisk();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    
    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
      size: this.memoryCache.size,
      maxSize: this.maxCacheSize,
      isLoaded: this.isLoaded,
      lastSave: this.lastSave
    };
  }

  /**
   * Get cache file path
   * @returns {string} Cache file path
   */
  getCacheFilePath() {
    return this.cacheFile;
  }

  /**
   * Get cache directory path
   * @returns {string} Cache directory path
   */
  getCacheDir() {
    return this.cacheDir;
  }

  /**
   * Close the cache and save final state
   * @returns {Promise<void>}
   */
  async close() {
    try {
      // Clear the save interval
      if (this.saveIntervalId) {
        clearInterval(this.saveIntervalId);
        this.saveIntervalId = null;
      }
      
      // Save final state
      try {
        await this.saveToDisk();
      } catch (error) {
        console.warn('Failed to save cache on close:', error.message);
      }
      
      // Clear memory cache
      if (this.memoryCache) {
        this.memoryCache.clear();
      }
      
      // Reset state
      this.isLoaded = false;
      this.lastSave = 0;
      
      // Reset statistics
      this.stats = {
        hits: 0,
        misses: 0,
        sets: 0,
        evictions: 0,
        lastCleanup: Date.now()
      };
      
    } catch (error) {
      console.warn('Error during AICache close:', error.message);
    }
  }

  /**
   * Shutdown method for test cleanup
   * @returns {Promise<void>}
   */
  async shutdown() {
    await this.close();
  }

  /**
   * Get cache size in bytes (approximate)
   * @returns {Promise<number>} Cache size in bytes
   */
  async getCacheSize() {
    try {
      const stats = await fs.stat(this.cacheFile);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Export cache data for backup
   * @returns {Promise<Object>} Cache data
   */
  async export() {
    return {
      entries: Object.fromEntries(this.memoryCache),
      stats: this.stats,
      metadata: {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        cacheDir: this.cacheDir,
        maxSize: this.maxCacheSize,
        maxAge: this.maxAge
      }
    };
  }

  /**
   * Import cache data from backup
   * @param {Object} data - Cache data to import
   * @returns {Promise<void>}
   */
  async import(data) {
    if (data.entries) {
      this.memoryCache.clear();
      for (const [key, entry] of Object.entries(data.entries)) {
        this.memoryCache.set(key, entry);
      }
    }
    
    if (data.stats) {
      this.stats = { ...this.stats, ...data.stats };
    }
    
    await this.saveToDisk();
  }

  /**
   * Compress data using simple JSON string compression
   * @param {Object} data - Data to compress
   * @returns {string} Compressed data
   * @private
   */
  compressData(data) {
    try {
      const jsonString = JSON.stringify(data);
      // Simple compression: remove extra whitespace and use shorter property names
      return jsonString
        .replace(/\s+/g, ' ')
        .replace(/"clientName"/g, '"c"')
        .replace(/"clientConfidence"/g, '"cc"')
        .replace(/"date"/g, '"d"')
        .replace(/"dateConfidence"/g, '"dc"')
        .replace(/"docType"/g, '"dt"')
        .replace(/"docTypeConfidence"/g, '"dtc"')
        .replace(/"snippets"/g, '"s"')
        .replace(/"source"/g, '"src"')
        .replace(/"timestamp"/g, '"ts"')
        .replace(/"overallConfidence"/g, '"oc"')
        .trim();
    } catch (error) {
      console.warn('Failed to compress data:', error.message);
      return data;
    }
  }

  /**
   * Decompress data that was compressed
   * @param {string} compressedData - Compressed data
   * @returns {Object} Decompressed data
   * @private
   */
  decompressData(compressedData) {
    try {
      // Reverse the compression
      const decompressed = compressedData
        .replace(/"c"/g, '"clientName"')
        .replace(/"cc"/g, '"clientConfidence"')
        .replace(/"d"/g, '"date"')
        .replace(/"dc"/g, '"dateConfidence"')
        .replace(/"dt"/g, '"docType"')
        .replace(/"dtc"/g, '"docTypeConfidence"')
        .replace(/"s"/g, '"snippets"')
        .replace(/"src"/g, '"source"')
        .replace(/"ts"/g, '"timestamp"')
        .replace(/"oc"/g, '"overallConfidence"');
      
      return JSON.parse(decompressed);
    } catch (error) {
      console.warn('Failed to decompress data:', error.message);
      return compressedData;
    }
  }

  /**
   * Calculate approximate data size in bytes
   * @param {*} data - Data to measure
   * @returns {number} Size in bytes
   * @private
   */
  calculateDataSize(data) {
    try {
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get total cache size in bytes
   * @returns {number} Total cache size in bytes
   */
  getTotalCacheSize() {
    let totalSize = 0;
    for (const [key, entry] of this.memoryCache.entries()) {
      totalSize += key.length * 2; // Key size (UTF-16)
      totalSize += entry.size || 0; // Data size
      totalSize += 50; // Overhead for entry metadata
    }
    return totalSize;
  }

  /**
   * Warm up cache with common document patterns
   * @param {Array} commonPatterns - Array of common document text patterns
   * @returns {Promise<void>}
   */
  async warmCache(commonPatterns = []) {
    if (!Array.isArray(commonPatterns) || commonPatterns.length === 0) {
      return;
    }

    console.log(`🔥 Warming cache with ${commonPatterns.length} common patterns...`);
    
    for (const pattern of commonPatterns) {
      const hash = this.generateHash(pattern);
      const exists = await this.has(hash);
      
      if (!exists) {
        // Pre-populate with a generic result for common patterns
        const genericResult = {
          clientName: 'Common Pattern',
          clientConfidence: 0.5,
          date: new Date().toISOString().split('T')[0],
          dateConfidence: 0.5,
          docType: 'Document',
          docTypeConfidence: 0.5,
          snippets: [pattern.substring(0, 50) + '...'],
          source: 'cache-warmed',
          timestamp: new Date().toISOString()
        };
        
        await this.set(hash, genericResult);
      }
    }
    
    console.log(`✅ Cache warmed with ${commonPatterns.length} patterns`);
  }

  /**
   * Shutdown the cache service
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      // Clear the save interval
      if (this.saveIntervalId) {
        clearInterval(this.saveIntervalId);
        this.saveIntervalId = null;
      }

      // Save any pending changes
      if (this.isLoaded) {
        await this.saveToDisk();
      }

      // Clear memory cache
      this.memoryCache.clear();
      this.isLoaded = false;
      this.initialized = false;

      console.log('✅ AI Cache shutdown completed');
    } catch (error) {
      console.warn('⚠️ Error during AI Cache shutdown:', error.message);
    }
  }
}

module.exports = AICache;
