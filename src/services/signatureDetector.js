/**
 * Signature Detection Service
 * 
 * Detects signature blocks and patterns in document text.
 * Identifies typical signature indicators like "Signed by", "Authorized by",
 * signature lines, and other authentication markers.
 */
class SignatureDetector {
  constructor(options = {}) {
    this.options = {
      // Minimum confidence threshold for signature detection
      minConfidence: options.minConfidence || 0.6,
      // Enable debug logging
      debug: options.debug || false,
      // Case sensitivity for pattern matching
      caseSensitive: options.caseSensitive || false,
      // Maximum text length to process
      maxTextLength: options.maxTextLength || 50000,
      // Enable detailed analysis
      detailedAnalysis: options.detailedAnalysis !== false,
      // Custom signature patterns to look for
      customPatterns: options.customPatterns || [],
      // Enable caching of results
      enableCache: options.enableCache !== false,
      // Cache TTL in milliseconds
      cacheTTL: options.cacheTTL || 300000, // 5 minutes
      // Maximum cache size
      maxCacheSize: options.maxCacheSize || 1000
    };

    // Statistics tracking
    this.stats = {
      totalDetections: 0,
      successfulDetections: 0,
      failedDetections: 0,
      averageConfidence: 0,
      averageProcessingTime: 0,
      signatureTypes: {},
      totalProcessingTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    // Simple in-memory cache
    this.cache = new Map();
    this.cacheTimestamps = new Map();

    // Cache cleanup interval will be set up in initialize() method
    this.cacheCleanupInterval = null;

    // Lazy initialization flag
    this.initialized = false;

    // Initialize signature patterns
    this.initializePatterns();

    this.log('SignatureDetector constructed (lazy initialization)');
  }

  /**
   * Initialize the signature detector
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return; // Already initialized
    }

    // Set up cache cleanup interval only if not already set
    if (!this.cacheCleanupInterval) {
      this.cacheCleanupInterval = setInterval(() => {
        this.cleanupCache();
      }, this.options.cacheTTL);
    }

    this.initialized = true;
    this.log('SignatureDetector initialized');
  }

  /**
   * Initialize signature detection patterns
   * @private
   */
  initializePatterns() {
    // Common signature indicators
    this.signaturePatterns = [
      // Direct signature indicators
      {
        pattern: /(?:signed|authorized|approved|endorsed)\s+(?:by|on behalf of|for)/i,
        type: 'signature_indicator',
        weight: 0.9,
        description: 'Direct signature indicator'
      },
      {
        pattern: /(?:signature|sign|signed)\s*:?\s*(?:_+|$)/im,
        type: 'signature_label',
        weight: 0.8,
        description: 'Signature label'
      },
      {
        pattern: /(?:authorized\s+signature|digital\s+signature|electronic\s+signature|authorized\s+by)/i,
        type: 'authorized_signature',
        weight: 0.95,
        description: 'Authorized signature indicator'
      },
      {
        pattern: /(?:signature\s+line|sign\s+here|signature\s+block)/i,
        type: 'signature_line',
        weight: 0.85,
        description: 'Signature line indicator'
      },
      {
        pattern: /(?:witness|witnessed)\s+(?:by|on)/i,
        type: 'witness_signature',
        weight: 0.8,
        description: 'Witness signature indicator'
      },
      {
        pattern: /(?:notarized|notary|notarization)/i,
        type: 'notarized_signature',
        weight: 0.9,
        description: 'Notarized signature indicator'
      },
      {
        pattern: /(?:executed|execution)\s+(?:by|on)/i,
        type: 'executed_signature',
        weight: 0.85,
        description: 'Executed signature indicator'
      },
      {
        pattern: /(?:acknowledged|acknowledgment)/i,
        type: 'acknowledged_signature',
        weight: 0.8,
        description: 'Acknowledged signature indicator'
      },
      {
        pattern: /(?:certified|certification)/i,
        type: 'certified_signature',
        weight: 0.85,
        description: 'Certified signature indicator'
      },
      {
        pattern: /(?:verified|verification)/i,
        type: 'verified_signature',
        weight: 0.8,
        description: 'Verified signature indicator'
      }
    ];

    // Signature line patterns (visual indicators)
    this.signatureLinePatterns = [
      {
        pattern: /_{3,}/g,
        type: 'underscore_line',
        weight: 0.6,
        description: 'Underscore signature line'
      },
      {
        pattern: /-{3,}/g,
        type: 'dash_line',
        weight: 0.6,
        description: 'Dash signature line'
      },
      {
        pattern: /={3,}/g,
        type: 'equals_line',
        weight: 0.6,
        description: 'Equals signature line'
      },
      {
        pattern: /\.{3,}/g,
        type: 'dot_line',
        weight: 0.6,
        description: 'Dot signature line'
      }
    ];

    // Date patterns near signatures
    this.datePatterns = [
      {
        pattern: /(?:date|dated)\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
        type: 'signature_date',
        weight: 0.7,
        description: 'Date near signature'
      },
      {
        pattern: /(?:signed|executed)\s+(?:on|this)\s+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
        type: 'signature_date_context',
        weight: 0.8,
        description: 'Date in signature context'
      }
    ];

    // Add custom patterns if provided
    if (this.options.customPatterns && this.options.customPatterns.length > 0) {
      this.signaturePatterns.push(...this.options.customPatterns);
    }
  }

  /**
   * Detect signatures in the given text
   * @param {string} text - Text to analyze for signatures
   * @returns {Promise<Object>} Signature detection result
   */
  async detectSignatures(text) {
    // Lazy initialization - only initialize when actually needed
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    this.stats.totalDetections++;

    try {
      // Validate input
      if (!text || typeof text !== 'string') {
        throw new Error('Invalid text input');
      }

      // Check cache first
      const cacheKey = this.getCacheKey(text);
      if (this.options.enableCache && this.cache.has(cacheKey)) {
        this.stats.cacheHits++;
        const cached = this.cache.get(cacheKey);
        this.log(`Cache hit for signature detection`);
        return cached;
      }

      this.stats.cacheMisses++;

      // Truncate text if too long
      const processedText = text.length > this.options.maxTextLength 
        ? text.substring(0, this.options.maxTextLength) 
        : text;

      // Detect signatures
      const result = await this.analyzeText(processedText);

      // Update statistics
      const processingTime = Date.now() - startTime;
      this.stats.totalProcessingTime += processingTime;
      this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.totalDetections;

      if (result.signatures.length > 0) {
        this.stats.successfulDetections++;
        this.stats.averageConfidence = this.updateAverageConfidence(result.confidence);
      } else {
        this.stats.failedDetections++;
      }

      // Cache result
      if (this.options.enableCache) {
        this.cache.set(cacheKey, result);
        this.cacheTimestamps.set(cacheKey, Date.now());
      }

      this.log(`Signature detection completed in ${processingTime}ms`);
      return result;

    } catch (error) {
      this.stats.failedDetections++;
      this.log(`Signature detection failed: ${error.message}`);
      
      return {
        signatures: [],
        confidence: 0,
        success: false,
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Analyze text for signature patterns
   * @param {string} text - Text to analyze
   * @returns {Promise<Object>} Analysis result
   * @private
   */
  async analyzeText(text) {
    const signatures = [];
    let totalConfidence = 0;
    let matchCount = 0;

    // Detect signature indicators
    const indicatorMatches = this.detectSignatureIndicators(text);
    signatures.push(...indicatorMatches);
    totalConfidence += indicatorMatches.reduce((sum, match) => sum + match.confidence, 0);
    matchCount += indicatorMatches.length;

    // Detect signature lines
    const lineMatches = this.detectSignatureLines(text);
    signatures.push(...lineMatches);
    totalConfidence += lineMatches.reduce((sum, match) => sum + match.confidence, 0);
    matchCount += lineMatches.length;

    // Detect dates near signatures
    const dateMatches = this.detectSignatureDates(text);
    signatures.push(...dateMatches);
    totalConfidence += dateMatches.reduce((sum, match) => sum + match.confidence, 0);
    matchCount += dateMatches.length;

    // Calculate overall confidence
    const confidence = matchCount > 0 ? totalConfidence / matchCount : 0;

    // Filter by minimum confidence
    const filteredSignatures = signatures.filter(sig => sig.confidence >= this.options.minConfidence);

    // Update statistics
    filteredSignatures.forEach(sig => {
      if (!this.stats.signatureTypes[sig.type]) {
        this.stats.signatureTypes[sig.type] = 0;
      }
      this.stats.signatureTypes[sig.type]++;
    });

    return {
      signatures: filteredSignatures,
      confidence: confidence,
      success: filteredSignatures.length > 0,
      totalMatches: matchCount,
      filteredMatches: filteredSignatures.length,
      processingTime: Date.now()
    };
  }

  /**
   * Detect signature indicators in text
   * @param {string} text - Text to analyze
   * @returns {Array} Array of signature matches
   * @private
   */
  detectSignatureIndicators(text) {
    const matches = [];

    this.signaturePatterns.forEach(pattern => {
      const regex = this.options.caseSensitive ? pattern.pattern : new RegExp(pattern.pattern.source, 'gi');
      let match;

      while ((match = regex.exec(text)) !== null) {
        matches.push({
          type: pattern.type,
          confidence: pattern.weight,
          text: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          description: pattern.description,
          context: this.getContext(text, match.index, 50)
        });
      }
    });

    return matches;
  }

  /**
   * Detect signature lines in text
   * @param {string} text - Text to analyze
   * @returns {Array} Array of signature line matches
   * @private
   */
  detectSignatureLines(text) {
    const matches = [];

    this.signatureLinePatterns.forEach(pattern => {
      const regex = this.options.caseSensitive ? pattern.pattern : new RegExp(pattern.pattern.source, 'gi');
      let match;

      while ((match = regex.exec(text)) !== null) {
        matches.push({
          type: pattern.type,
          confidence: pattern.weight,
          text: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          description: pattern.description,
          context: this.getContext(text, match.index, 30)
        });
      }
    });

    return matches;
  }

  /**
   * Detect dates near signatures
   * @param {string} text - Text to analyze
   * @returns {Array} Array of date matches
   * @private
   */
  detectSignatureDates(text) {
    const matches = [];

    this.datePatterns.forEach(pattern => {
      const regex = this.options.caseSensitive ? pattern.pattern : new RegExp(pattern.pattern.source, 'gi');
      let match;

      while ((match = regex.exec(text)) !== null) {
        matches.push({
          type: pattern.type,
          confidence: pattern.weight,
          text: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          description: pattern.description,
          context: this.getContext(text, match.index, 50),
          extractedDate: match[1] || null
        });
      }
    });

    return matches;
  }

  /**
   * Get context around a match
   * @param {string} text - Full text
   * @param {number} index - Match index
   * @param {number} contextLength - Length of context to extract
   * @returns {string} Context string
   * @private
   */
  getContext(text, index, contextLength) {
    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + contextLength);
    return text.substring(start, end);
  }

  /**
   * Get cache key for text
   * @param {string} text - Text to cache
   * @returns {string} Cache key
   * @private
   */
  getCacheKey(text) {
    // Use first 1000 characters for cache key
    const keyText = text.substring(0, 1000);
    return `sig_${Buffer.from(keyText).toString('base64')}`;
  }

  /**
   * Clean up expired cache entries
   * @private
   */
  cleanupCache() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, timestamp] of this.cacheTimestamps.entries()) {
      if (now - timestamp > this.options.cacheTTL) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => {
      this.cache.delete(key);
      this.cacheTimestamps.delete(key);
    });

    // Enforce max cache size
    if (this.cache.size > this.options.maxCacheSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => this.cacheTimestamps.get(a[0]) - this.cacheTimestamps.get(b[0]));
      
      const toRemove = entries.slice(0, entries.length - this.options.maxCacheSize);
      toRemove.forEach(([key]) => {
        this.cache.delete(key);
        this.cacheTimestamps.delete(key);
      });
    }

    this.log(`Cache cleanup: removed ${expiredKeys.length} expired entries`);
  }

  /**
   * Update average confidence
   * @param {number} confidence - New confidence value
   * @returns {number} Updated average confidence
   * @private
   */
  updateAverageConfidence(confidence) {
    const totalConfidence = this.stats.averageConfidence * (this.stats.successfulDetections - 1) + confidence;
    return totalConfidence / this.stats.successfulDetections;
  }

  /**
   * Get statistics
   * @returns {Object} Current statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalDetections: 0,
      successfulDetections: 0,
      failedDetections: 0,
      averageConfidence: 0,
      averageProcessingTime: 0,
      signatureTypes: {},
      totalProcessingTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheTimestamps.clear();
    this.log('Cache cleared');
  }

  /**
   * Log debug message
   * @private
   * @param {string} message - Message to log
   */
  log(message) {
    if (this.options.debug) {
      console.log(`[SignatureDetector] ${message}`);
    }
  }

  /**
   * Close the service and clean up resources
   * @returns {Promise<void>}
   */
  async close() {
    try {
      // Clear the cache cleanup interval
      if (this.cacheCleanupInterval) {
        clearInterval(this.cacheCleanupInterval);
        this.cacheCleanupInterval = null;
      }
      
      // Clear cache
      this.clearCache();
      
      // Reset statistics
      this.resetStats();
      
      // Clear any pending operations
      this.pendingDetections = new Map();
      
    } catch (error) {
      console.warn('Error during SignatureDetector cleanup:', error.message);
    }
  }

  /**
   * Shutdown method for test cleanup and production shutdown
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      // Clear the cache cleanup interval
      if (this.cacheCleanupInterval) {
        clearInterval(this.cacheCleanupInterval);
        this.cacheCleanupInterval = null;
      }
      
      // Clear cache
      this.clearCache();
      
      // Reset statistics
      this.resetStats();
      
      // Clear any pending operations
      this.pendingDetections = new Map();
      
      this.log('SignatureDetector shutdown complete');
      
    } catch (error) {
      console.warn('Error during SignatureDetector shutdown:', error.message);
    }
  }
}

module.exports = SignatureDetector;
