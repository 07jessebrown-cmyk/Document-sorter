const crypto = require('crypto');

/**
 * AI Text Service for Document Metadata Extraction
 * Provides AI-powered fallback when regex/fuzzy matching fails
 * 
 * This service consumes raw extracted text and returns structured metadata
 * with confidence scores for each extracted field.
 */

class AITextService {
  constructor() {
    this.isEnabled = process.env.USE_AI === 'true' || process.env.NODE_ENV === 'test';
    this.model = process.env.AI_MODEL || 'gpt-3.5-turbo';
    this.confidenceThreshold = parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.5;
    this.batchSize = parseInt(process.env.AI_BATCH_SIZE) || 5;
    
    // Initialize LLM client (will be injected or created)
    this.llmClient = null;
    this.cache = null;
    this.telemetry = null;
  }

  /**
   * Set the LLM client instance
   * @param {Object} client - The LLM client instance
   */
  setLLMClient(client) {
    this.llmClient = client;
  }

  /**
   * Set the cache instance
   * @param {Object} cache - The cache instance
   */
  setCache(cache) {
    this.cache = cache;
  }

  /**
   * Set the telemetry instance
   * @param {Object} telemetry - The telemetry instance
   */
  setTelemetry(telemetry) {
    this.telemetry = telemetry;
  }

  /**
   * Extract metadata from a single document using AI
   * @param {string} text - Raw extracted text from document
   * @param {Object} options - Optional configuration
   * @param {boolean} options.useCache - Whether to use cache (default: true)
   * @param {boolean} options.forceRefresh - Whether to bypass cache (default: false)
   * @param {string} options.detectedLanguage - Detected language code (e.g., 'eng', 'spa', 'fra')
   * @param {string} options.languageName - Human-readable language name (e.g., 'English', 'Spanish')
   * @returns {Promise<Object|null>} Structured metadata or null on failure
   */
  async extractMetadataAI(text, options = {}) {
    const { useCache = true, forceRefresh = false } = options;

    if (!this.isEnabled || !text || text.trim().length === 0) {
      return null;
    }

    try {
      // Generate cache key from text hash
      const textHash = this.generateTextHash(text);
      
      // Check cache first (if enabled and not forcing refresh)
      if (useCache && this.cache && !forceRefresh) {
        const cachedResult = await this.cache.get(textHash);
        if (cachedResult) {
          console.log('AI metadata retrieved from cache');
          
          // Track cache hit
          if (this.telemetry) {
            this.telemetry.trackCachePerformance({ hit: true, size: this.cache.memoryCache?.size || 0 });
          }
          
          return cachedResult;
        } else {
          // Track cache miss
          if (this.telemetry) {
            this.telemetry.trackCachePerformance({ hit: false, size: this.cache.memoryCache?.size || 0 });
          }
        }
      }

      // Validate LLM client is available
      if (!this.llmClient) {
        console.warn('AI Text Service: LLM client not initialized');
        return null;
      }

      // Call AI service
      const startTime = Date.now();
      const result = await this.callAIService(text, options);
      const latency = Date.now() - startTime;
      
      if (!result) {
        // Track failed AI call
        if (this.telemetry) {
          this.telemetry.trackAICall({
            success: false,
            latency,
            cached: false,
            model: this.model,
            error: 'No result returned'
          });
        }
        return null;
      }

      // Track successful AI call
      if (this.telemetry) {
        this.telemetry.trackAICall({
          success: true,
          latency,
          cached: false,
          model: this.model
        });
      }

      // Cache the result if cache is available
      if (useCache && this.cache) {
        await this.cache.set(textHash, result);
      }

      return result;

    } catch (error) {
      console.error('AI Text Service error:', error.message);
      
      // Track error
      if (this.telemetry) {
        this.telemetry.trackError('ai_service_error', error.message, { method: 'extractMetadataAI' });
      }
      
      return null;
    }
  }

  /**
   * Extract metadata from multiple documents using AI (batch processing)
   * @param {Array<Object>} items - Array of items with text property
   * @param {Object} options - Optional configuration
   * @param {boolean} options.useCache - Whether to use cache (default: true)
   * @param {boolean} options.forceRefresh - Whether to bypass cache (default: false)
   * @param {number} options.concurrency - Max concurrent requests (default: this.batchSize)
   * @returns {Promise<Array<Object>>} Array of structured metadata results
   */
  async extractMetadataAIBatch(items, options = {}) {
    const { useCache = true, forceRefresh = false, concurrency = this.batchSize } = options;

    if (!this.isEnabled || !Array.isArray(items) || items.length === 0) {
      return [];
    }

    const results = [];
    const validItems = items.filter(item => item && item.text && item.text.trim().length > 0);

    if (validItems.length === 0) {
      return results;
    }

    try {
      // Process items in batches to respect rate limits
      for (let i = 0; i < validItems.length; i += concurrency) {
        const batch = validItems.slice(i, i + concurrency);
        const batchPromises = batch.map(async (item, index) => {
          try {
            const result = await this.extractMetadataAI(item.text, { useCache, forceRefresh });
            return {
              index: i + index,
              result: result,
              success: result !== null
            };
          } catch (error) {
            console.error(`AI batch processing error for item ${i + index}:`, error.message);
            return {
              index: i + index,
              result: null,
              success: false,
              error: error.message
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Add small delay between batches to be respectful to API
        if (i + concurrency < validItems.length) {
          await this.delay(100);
        }
      }

      // Sort results by original index and return only the results
      return results
        .sort((a, b) => a.index - b.index)
        .map(item => item.result);

    } catch (error) {
      console.error('AI batch processing error:', error.message);
      return [];
    }
  }

  /**
   * Call the AI service to extract metadata
   * @param {string} text - Raw text to analyze
   * @param {Object} options - Options including language information
   * @returns {Promise<Object|null>} Structured metadata or null
   * @private
   */
  async callAIService(text, options = {}) {
    try {
      // Build the prompt for metadata extraction
      const prompt = this.buildMetadataPrompt(text, options);
      
      // Call the LLM client
      const response = await this.llmClient.callLLM({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert document metadata extraction assistant. Extract client name, date, and document type from the provided text. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 500,
        temperature: 0.1
      });

      if (!response || !response.content) {
        console.warn('AI service returned empty response');
        return null;
      }

      // Parse the JSON response
      const metadata = this.parseAIResponse(response.content);
      
      if (!metadata) {
        console.warn('Failed to parse AI response as valid metadata');
        return null;
      }

      // Validate and enhance the metadata
      return this.validateAndEnhanceMetadata(metadata, text);

    } catch (error) {
      console.error('AI service call failed:', error.message);
      return null;
    }
  }

  /**
   * Build the prompt for metadata extraction
   * @param {string} text - Raw text to analyze
   * @param {Object} options - Options including language information
   * @returns {string} Formatted prompt
   * @private
   */
  buildMetadataPrompt(text, options = {}) {
    // Use the imported prompt function
    const { buildMetadataPrompt: buildPrompt } = require('./ai_prompts');
    const promptData = buildPrompt(text, {
      model: this.model,
      includeExamples: true,
      maxTokens: 500,
      detectedLanguage: options.detectedLanguage,
      languageName: options.languageName
    });
    
    // Return the user message content
    return promptData.messages.find(m => m.role === 'user').content;
  }

  /**
   * Parse AI response and extract JSON
   * @param {string} response - Raw AI response
   * @returns {Object|null} Parsed metadata or null
   * @private
   */
  parseAIResponse(response) {
    try {
      // Try to find JSON in the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('No JSON found in AI response');
        return null;
      }

      const jsonStr = jsonMatch[0];
      const metadata = JSON.parse(jsonStr);

      // Validate required keys
      const requiredKeys = ['clientName', 'clientConfidence', 'date', 'dateConfidence', 'docType', 'docTypeConfidence', 'snippets'];
      const hasAllKeys = requiredKeys.every(key => key in metadata);
      
      if (!hasAllKeys) {
        console.warn('AI response missing required keys');
        return null;
      }

      return metadata;

    } catch (error) {
      console.warn('Failed to parse AI response as JSON:', error.message);
      return null;
    }
  }

  /**
   * Validate and enhance metadata with additional processing
   * @param {Object} metadata - Raw metadata from AI
   * @param {string} originalText - Original text for validation
   * @returns {Object} Validated and enhanced metadata
   * @private
   */
  validateAndEnhanceMetadata(metadata, originalText) {
    const result = {
      clientName: this.validateClientName(metadata.clientName),
      clientConfidence: this.validateConfidence(metadata.clientConfidence),
      date: this.validateDate(metadata.date),
      dateConfidence: this.validateConfidence(metadata.dateConfidence),
      docType: this.validateDocumentType(metadata.docType),
      docTypeConfidence: this.validateConfidence(metadata.docTypeConfidence),
      snippets: this.validateSnippets(metadata.snippets, originalText),
      source: 'AI',
      timestamp: new Date().toISOString()
    };

    // Calculate overall confidence
    result.overallConfidence = this.calculateOverallConfidence(result);

    return result;
  }

  /**
   * Validate and clean client name
   * @param {string} clientName - Raw client name
   * @returns {string|null} Cleaned client name or null
   * @private
   */
  validateClientName(clientName) {
    if (!clientName || typeof clientName !== 'string') {
      return null;
    }

    const cleaned = clientName.trim();
    return cleaned.length > 0 && cleaned.length < 200 ? cleaned : null;
  }

  /**
   * Validate and clean date
   * @param {string} date - Raw date string
   * @returns {string|null} Validated date in YYYY-MM-DD format or null
   * @private
   */
  validateDate(date) {
    if (!date || typeof date !== 'string') {
      return null;
    }

    // Check if already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }

    // Try to parse and normalize other formats
    try {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return null;
      }
      
      return parsedDate.toISOString().split('T')[0];
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate and clean document type
   * @param {string} docType - Raw document type
   * @returns {string|null} Cleaned document type or null
   * @private
   */
  validateDocumentType(docType) {
    if (!docType || typeof docType !== 'string') {
      return null;
    }

    const cleaned = docType.trim();
    return cleaned.length > 0 && cleaned.length < 100 ? cleaned : null;
  }

  /**
   * Validate confidence score
   * @param {number} confidence - Raw confidence score
   * @returns {number} Validated confidence (0.0-1.0)
   * @private
   */
  validateConfidence(confidence) {
    if (typeof confidence !== 'number' || isNaN(confidence)) {
      return 0.0;
    }

    return Math.max(0.0, Math.min(1.0, confidence));
  }

  /**
   * Validate and clean snippets
   * @param {Array} snippets - Raw snippets array
   * @param {string} originalText - Original text for validation
   * @returns {Array} Validated snippets array
   * @private
   */
  validateSnippets(snippets, originalText) {
    if (!Array.isArray(snippets)) {
      return [];
    }

    return snippets
      .filter(snippet => typeof snippet === 'string' && snippet.trim().length > 0)
      .map(snippet => snippet.trim())
      .filter(snippet => snippet.length < 500) // Reasonable snippet length
      .slice(0, 5); // Limit to 5 snippets
  }

  /**
   * Calculate overall confidence score
   * @param {Object} metadata - Metadata object
   * @returns {number} Overall confidence (0.0-1.0)
   * @private
   */
  calculateOverallConfidence(metadata) {
    const confidences = [
      metadata.clientConfidence,
      metadata.dateConfidence,
      metadata.docTypeConfidence
    ].filter(conf => conf > 0);

    if (confidences.length === 0) {
      return 0.0;
    }

    // Weighted average with slight bias toward higher scores
    const sum = confidences.reduce((acc, conf) => acc + conf, 0);
    const avg = sum / confidences.length;
    
    // Apply slight boost for having multiple confident extractions
    const boost = confidences.length > 1 ? 0.1 : 0;
    
    return Math.min(1.0, avg + boost);
  }

  /**
   * Generate hash for text content
   * @param {string} text - Text to hash
   * @returns {string} SHA256 hash
   * @private
   */
  generateTextHash(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Add delay between operations
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   * @private
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if AI service is enabled and ready
   * @returns {boolean} True if service is ready
   */
  isReady() {
    return this.isEnabled && this.llmClient !== null;
  }

  /**
   * Get service configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return {
      enabled: this.isEnabled,
      model: this.model,
      confidenceThreshold: this.confidenceThreshold,
      batchSize: this.batchSize,
      hasLLMClient: this.llmClient !== null,
      hasCache: this.cache !== null
    };
  }
}

module.exports = AITextService;
