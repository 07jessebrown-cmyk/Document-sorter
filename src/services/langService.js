const franc = require('franc');

/**
 * Language Detection Service using franc
 * 
 * Provides language detection capabilities for text content.
 * Uses the franc library to detect language codes with confidence scores.
 * Supports a wide range of languages and provides fallback mechanisms.
 */
class LanguageService {
  constructor(options = {}) {
    this.options = {
      // Minimum text length for reliable detection
      minLength: options.minLength || 10,
      // Maximum text length to process (for performance)
      maxLength: options.maxLength || 10000,
      // Confidence threshold for detection
      minConfidence: options.minConfidence || 0.1,
      // Languages to whitelist (if specified)
      whitelist: options.whitelist || null,
      // Languages to blacklist (if specified)
      blacklist: options.blacklist || null,
      // Debug mode
      debug: options.debug || false,
      // Enable detailed analysis
      detailedAnalysis: options.detailedAnalysis !== false,
      // Fallback language if detection fails
      fallbackLanguage: options.fallbackLanguage || 'eng',
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
      languageDistribution: {},
      totalProcessingTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    // Simple in-memory cache
    this.cache = new Map();
    this.cacheTimestamps = new Map();

    // Language code mappings for better readability (franc v5 codes)
    this.languageNames = {
      'eng': 'English',
      'spa': 'Spanish',
      'fra': 'French',
      'deu': 'German',
      'ita': 'Italian',
      'por': 'Portuguese',
      'rus': 'Russian',
      'jpn': 'Japanese',
      'cmn': 'Chinese (Mandarin)',
      'chi_sim': 'Chinese (Simplified)',
      'chi_tra': 'Chinese (Traditional)',
      'arb': 'Arabic',
      'ara': 'Arabic',
      'bho': 'Bhojpuri',
      'hin': 'Hindi',
      'kor': 'Korean',
      'nld': 'Dutch',
      'swe': 'Swedish',
      'nor': 'Norwegian',
      'dan': 'Danish',
      'fin': 'Finnish',
      'pol': 'Polish',
      'ces': 'Czech',
      'hun': 'Hungarian',
      'ron': 'Romanian',
      'bul': 'Bulgarian',
      'hrv': 'Croatian',
      'slv': 'Slovenian',
      'slk': 'Slovak',
      'est': 'Estonian',
      'lav': 'Latvian',
      'lit': 'Lithuanian',
      'ell': 'Greek',
      'tur': 'Turkish',
      'heb': 'Hebrew',
      'tha': 'Thai',
      'vie': 'Vietnamese',
      'ind': 'Indonesian',
      'msa': 'Malay',
      'tgl': 'Tagalog',
      'ukr': 'Ukrainian',
      'bel': 'Belarusian',
      'kat': 'Georgian',
      'hye': 'Armenian',
      'aze': 'Azerbaijani',
      'kaz': 'Kazakh',
      'kir': 'Kyrgyz',
      'uzb': 'Uzbek',
      'tgk': 'Tajik',
      'mon': 'Mongolian',
      'mya': 'Burmese',
      'khm': 'Khmer',
      'lao': 'Lao',
      'sin': 'Sinhala',
      'nep': 'Nepali',
      'ben': 'Bengali',
      'guj': 'Gujarati',
      'pan': 'Punjabi',
      'mar': 'Marathi',
      'tel': 'Telugu',
      'tam': 'Tamil',
      'kan': 'Kannada',
      'mal': 'Malayalam',
      'ori': 'Odia',
      'asm': 'Assamese',
      'bod': 'Tibetan',
      'dzo': 'Dzongkha',
      'npi': 'Nepali',
      'new': 'Newari',
      'mai': 'Maithili',
      'mag': 'Magahi',
      'awa': 'Awadhi',
      'brx': 'Bodo',
      'mni': 'Manipuri',
      'kok': 'Konkani',
      'sat': 'Santali',
      'lus': 'Mizo',
      'njo': 'Ao',
      'nst': 'Naga',
      'grt': 'Garo',
      'kha': 'Khasi',
      'sco': 'Scots',
      'sot': 'Sotho',
      'glg': 'Galician'
    };

    // Cache cleanup interval will be set up in initialize() method
    this.cacheCleanupInterval = null;
  }

  /**
   * Initialize the language service
   * @returns {Promise<void>}
   */
  async initialize() {
    // Set up cache cleanup interval if caching is enabled
    if (this.options.enableCache && !this.cacheCleanupInterval) {
      this.cacheCleanupInterval = setInterval(() => this.cleanupCache(), this.options.cacheTTL);
    }
  }

  /**
   * Detect the language of the given text
   * @param {string} text - Text to analyze
   * @param {Object} options - Detection options
   * @returns {Promise<Object>} Language detection result
   */
  async detectLanguage(text, options = {}) {
    const startTime = Date.now();
    this.stats.totalDetections++;

    const result = {
      success: false,
      detectedLanguage: null,
      confidence: 0,
      languageName: null,
      candidates: [],
      processingTime: 0,
      metadata: {
        method: 'franc',
        version: 'unknown',
        textLength: 0,
        timestamp: new Date().toISOString()
      },
      warnings: [],
      errors: []
    };

    try {
      // Update version in metadata
      result.metadata.version = franc.version || 'unknown';
      // Validate input
      if (!text || typeof text !== 'string') {
        throw new Error('Text input is required and must be a string');
      }

      // Clean and prepare text
      const cleanText = this.preprocessText(text);
      result.metadata.textLength = cleanText.length;

      // Check cache first
      const cacheKey = this.getCacheKey(cleanText, options);
      if (this.options.enableCache && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - this.cacheTimestamps.get(cacheKey) < this.options.cacheTTL) {
          this.stats.cacheHits++;
          result.success = cached.success;
          result.detectedLanguage = cached.detectedLanguage;
          result.confidence = cached.confidence;
          result.languageName = cached.languageName;
          result.candidates = cached.candidates;
          result.processingTime = Date.now() - startTime;
          result.metadata = { ...result.metadata, ...cached.metadata, cached: true };
          return result;
        } else {
          // Remove expired cache entry
          this.cache.delete(cacheKey);
          this.cacheTimestamps.delete(cacheKey);
        }
      }

      this.stats.cacheMisses++;

      // Check minimum length
      if (cleanText.length < this.options.minLength) {
        result.warnings.push(`Text too short for reliable detection (${cleanText.length} < ${this.options.minLength})`);
        result.detectedLanguage = this.options.fallbackLanguage;
        result.languageName = this.languageNames[this.options.fallbackLanguage] || this.options.fallbackLanguage;
        result.confidence = 0.1; // Low confidence for short text
        result.success = true;
        result.processingTime = Date.now() - startTime;
        return result;
      }

      // Truncate if too long
      const textToAnalyze = cleanText.length > this.options.maxLength 
        ? cleanText.substring(0, this.options.maxLength)
        : cleanText;

      if (cleanText.length > this.options.maxLength) {
        result.warnings.push(`Text truncated for analysis (${cleanText.length} > ${this.options.maxLength})`);
      }

      // Perform language detection
      const detectionResult = this.performDetection(textToAnalyze, options);
      
      // Process results
      result.success = detectionResult.success;
      result.detectedLanguage = detectionResult.detectedLanguage;
      result.confidence = detectionResult.confidence;
      result.languageName = this.languageNames[detectionResult.detectedLanguage] || detectionResult.detectedLanguage;
      result.candidates = detectionResult.candidates;
      result.metadata = { ...result.metadata, ...detectionResult.metadata };

      // Apply confidence filtering
      if (result.confidence < this.options.minConfidence) {
        result.warnings.push(`Low confidence detection: ${result.confidence} < ${this.options.minConfidence}`);
        if (result.confidence < 0.05) {
          result.detectedLanguage = this.options.fallbackLanguage;
          result.languageName = this.languageNames[this.options.fallbackLanguage] || this.options.fallbackLanguage;
          result.warnings.push(`Using fallback language: ${result.detectedLanguage}`);
        }
      }

      // Update statistics
      this.updateStats(true, result.detectedLanguage, result.confidence, Date.now() - startTime);

      // Cache result
      if (this.options.enableCache) {
        this.cacheResult(cacheKey, result);
      }

      if (this.options.debug) {
        console.log(`[LangService] Detected language: ${result.detectedLanguage} (${result.languageName}) with confidence: ${result.confidence}`);
      }

    } catch (error) {
      result.errors.push(error.message);
      this.updateStats(false, null, 0, Date.now() - startTime);
      
      if (this.options.debug) {
        console.error('[LangService] Language detection failed:', error.message);
      }
    }

    result.processingTime = Date.now() - startTime;
    return result;
  }

  /**
   * Perform the actual language detection using franc
   * @private
   * @param {string} text - Text to analyze
   * @param {Object} options - Detection options
   * @returns {Object} Detection result
   */
  performDetection(text, options = {}) {
    try {
      // Get detection options
      const detectionOptions = {
        whitelist: options.whitelist || this.options.whitelist,
        blacklist: options.blacklist || this.options.blacklist,
        minLength: this.options.minLength
      };

      // Perform detection
      const detected = franc(text, detectionOptions);
      const confidence = franc.all(text, detectionOptions);

      // Sort candidates by confidence
      const candidates = confidence
        .map(item => ({
          language: item[0],
          confidence: item[1],
          languageName: this.languageNames[item[0]] || item[0]
        }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10); // Top 10 candidates

      return {
        success: true,
        detectedLanguage: detected,
        confidence: confidence[0] ? confidence[0][1] : 0,
        candidates: candidates,
        metadata: {
          totalCandidates: confidence.length,
          detectionMethod: 'franc',
          options: detectionOptions
        }
      };
    } catch (error) {
      return {
        success: false,
        detectedLanguage: this.options.fallbackLanguage,
        confidence: 0,
        candidates: [],
        metadata: {
          error: error.message,
          detectionMethod: 'franc'
        }
      };
    }
  }

  /**
   * Preprocess text for better detection
   * @private
   * @param {string} text - Raw text
   * @returns {string} Cleaned text
   */
  preprocessText(text) {
    return text
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\p{L}\p{N}\p{P}\p{S}\p{Z}]/gu, '') // Remove control characters
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .replace(/\t+/g, ' '); // Replace tabs with spaces
  }

  /**
   * Get cache key for text and options
   * @private
   * @param {string} text - Text content
   * @param {Object} options - Detection options
   * @returns {string} Cache key
   */
  getCacheKey(text, options) {
    const optionsStr = JSON.stringify({
      whitelist: options.whitelist || this.options.whitelist,
      blacklist: options.blacklist || this.options.blacklist,
      minLength: this.options.minLength
    });
    return `${text.substring(0, 100)}_${optionsStr}`;
  }

  /**
   * Cache detection result
   * @private
   * @param {string} key - Cache key
   * @param {Object} result - Detection result
   */
  cacheResult(key, result) {
    // Check cache size limit
    if (this.cache.size >= this.options.maxCacheSize) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.cacheTimestamps.delete(oldestKey);
    }

    this.cache.set(key, {
      success: result.success,
      detectedLanguage: result.detectedLanguage,
      confidence: result.confidence,
      languageName: result.languageName,
      candidates: result.candidates,
      metadata: result.metadata
    });
    this.cacheTimestamps.set(key, Date.now());
  }

  /**
   * Clean up expired cache entries
   * @private
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, timestamp] of this.cacheTimestamps) {
      if (now - timestamp > this.options.cacheTTL) {
        this.cache.delete(key);
        this.cacheTimestamps.delete(key);
      }
    }
  }

  /**
   * Detect language for multiple texts in batch
   * @param {Array<string>} texts - Array of texts to analyze
   * @param {Object} options - Detection options
   * @returns {Promise<Array<Object>>} Array of detection results
   */
  async detectLanguageBatch(texts, options = {}) {
    const results = [];
    
    for (const text of texts) {
      const result = await this.detectLanguage(text, options);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Get supported languages
   * @returns {Array<string>} Array of supported language codes
   */
  getSupportedLanguages() {
    return Object.keys(this.languageNames);
  }

  /**
   * Get language name from code
   * @param {string} code - Language code
   * @returns {string} Language name
   */
  getLanguageName(code) {
    return this.languageNames[code] || code;
  }

  /**
   * Check if a language is supported
   * @param {string} language - Language code to check
   * @returns {boolean} True if language is supported
   */
  isLanguageSupported(language) {
    return language in this.languageNames;
  }

  /**
   * Update statistics
   * @private
   * @param {boolean} success - Whether the operation was successful
   * @param {string} language - Detected language
   * @param {number} confidence - Confidence score
   * @param {number} processingTime - Processing time in milliseconds
   */
  updateStats(success, language, confidence, processingTime) {
    if (success) {
      this.stats.successfulDetections++;
      
      // Update language distribution
      if (language) {
        this.stats.languageDistribution[language] = (this.stats.languageDistribution[language] || 0) + 1;
      }

      // Update average confidence
      const totalSuccessful = this.stats.successfulDetections;
      if (totalSuccessful > 0) {
        this.stats.averageConfidence = 
          ((this.stats.averageConfidence * (totalSuccessful - 1)) + confidence) / totalSuccessful;
      }
    } else {
      this.stats.failedDetections++;
    }

    // Update processing time statistics
    this.stats.totalProcessingTime += processingTime;
    this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.totalDetections;
  }

  /**
   * Get current statistics
   * @returns {Object} Current statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalDetections > 0 
        ? this.stats.successfulDetections / this.stats.totalDetections 
        : 0,
      cacheHitRate: (this.stats.cacheHits + this.stats.cacheMisses) > 0
        ? this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)
        : 0,
      cacheSize: this.cache.size
    };
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
      languageDistribution: {},
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
  }

  /**
   * Log debug message
   * @private
   * @param {string} message - Message to log
   */
  log(message) {
    if (this.options.debug) {
      console.log(`[LangService] ${message}`);
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
      
      // Clear any pending promises
      this.pendingDetections = new Map();
      
    } catch (error) {
      console.warn('Error during LanguageService close:', error.message);
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
      
      // Clear any pending promises
      this.pendingDetections = new Map();
      
      this.log('LanguageService shutdown complete');
      
    } catch (error) {
      console.warn('Error during LanguageService shutdown:', error.message);
    }
  }
}

module.exports = LanguageService;
