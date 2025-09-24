const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

/**
 * Handwriting OCR Service using Tesseract.js
 * 
 * Specialized service for detecting and extracting handwritten text from images and PDFs.
 * Uses handwriting-specific OCR modes and provides confidence scoring for manual review.
 */
class HandwritingService {
  constructor(options = {}) {
    this.options = {
      // Default language is English
      language: options.language || 'eng',
      // Supported languages for handwriting
      supportedLanguages: options.supportedLanguages || ['eng', 'spa', 'fra', 'deu', 'ita', 'por', 'rus'],
      // OCR engine options optimized for handwriting
      engineOptions: {
        logger: options.debug ? m => console.log(`[Handwriting] ${m}`) : () => {},
        ...options.engineOptions
      },
      // Confidence threshold for handwriting detection
      minConfidence: options.minConfidence || 0.2, // Lower threshold for handwriting
      // Timeout for OCR operations (in milliseconds)
      timeout: options.timeout || 90000, // Longer timeout for handwriting
      // Debug mode
      debug: options.debug || false,
      // Worker pool size for concurrent processing
      workerPoolSize: options.workerPoolSize || 1, // Smaller pool for handwriting
      // Cache directory for trained data
      cacheDir: options.cacheDir || path.join(__dirname, '../../../eng.traineddata'),
      // Enable preprocessing for handwriting
      enablePreprocessing: options.enablePreprocessing !== false,
      // Handwriting-specific preprocessing options
      preprocessing: {
        // Convert to grayscale
        grayscale: true,
        // Apply noise reduction (more aggressive for handwriting)
        denoise: true,
        // Enhance contrast (important for handwriting)
        enhanceContrast: true,
        // Resize image if too small
        resize: true,
        minWidth: 200, // Higher minimum for handwriting
        minHeight: 200,
        // Additional handwriting-specific preprocessing
        sharpen: true,
        // Rotate image to correct orientation
        autoRotate: true,
        ...options.preprocessing
      },
      // Handwriting detection patterns
      handwritingPatterns: [
        'signature', 'signed', 'sign here', 'authorized by',
        'manuscript', 'cursive', 'script',
        'personal note', 'memo', 'annotation', 'comment'
      ],
      // Confidence thresholds for different types of handwriting
      confidenceThresholds: {
        signature: 0.15, // Very low threshold for signatures
        handwritten: 0.25, // Low threshold for general handwriting
        printed: 0.7, // Higher threshold for printed text
        mixed: 0.4 // Medium threshold for mixed content
      }
    };

    // Statistics tracking
    this.stats = {
      totalProcessed: 0,
      successfulExtractions: 0,
      failedExtractions: 0,
      handwritingDetected: 0,
      signaturesDetected: 0,
      manualReviewRequired: 0,
      averageConfidence: 0,
      averageProcessingTime: 0,
      languageUsage: {},
      totalProcessingTime: 0,
      handwritingTypes: {
        signature: 0,
        handwritten: 0,
        printed: 0,
        mixed: 0
      }
    };

    // Worker pool for concurrent processing
    this.workers = new Map();
    this.workerQueue = [];
    this.maxWorkers = this.options.workerPoolSize;

    // Initialize worker pool
    this.initializeWorkers();
  }

  /**
   * Initialize worker pool for handwriting OCR processing
   * @private
   */
  async initializeWorkers() {
    try {
      for (let i = 0; i < this.maxWorkers; i++) {
        const worker = await Tesseract.createWorker({
          logger: this.options.engineOptions.logger,
          cachePath: this.options.cacheDir
        });
        
        await worker.loadLanguage(this.options.language);
        await worker.initialize(this.options.language);
        
        // Configure worker for handwriting detection
        await worker.setParameters({
          tessedit_pageseg_mode: '6', // Uniform block of text
          tessedit_ocr_engine_mode: '3', // Default, LSTM OCR Engine Mode
          tessedit_char_whitelist: '', // Allow all characters
          preserve_interword_spaces: '1'
        });
        
        this.workers.set(i, {
          worker,
          busy: false,
          id: i
        });
      }
      
      if (this.options.debug) {
        console.log(`[Handwriting] Initialized ${this.maxWorkers} workers for language: ${this.options.language}`);
      }
    } catch (error) {
      console.warn('[Handwriting] Failed to initialize workers:', error.message);
    }
  }

  /**
   * Get an available worker from the pool
   * @private
   * @returns {Promise<Object>} Available worker
   */
  async getWorker() {
    // Find an available worker
    for (const [id, workerData] of this.workers) {
      if (!workerData.busy) {
        workerData.busy = true;
        return workerData;
      }
    }

    // If no worker is available, wait for one
    return new Promise((resolve) => {
      this.workerQueue.push(resolve);
    });
  }

  /**
   * Release a worker back to the pool
   * @private
   * @param {Object} workerData - Worker to release
   */
  releaseWorker(workerData) {
    workerData.busy = false;
    
    // Process queued requests
    if (this.workerQueue.length > 0) {
      const resolve = this.workerQueue.shift();
      resolve(workerData);
    }
  }

  /**
   * Detect handwriting in an image
   * @param {string} imagePath - Path to the image file
   * @param {Object} options - Detection options
   * @returns {Promise<Object>} Handwriting detection result
   */
  async detectHandwriting(imagePath, options = {}) {
    const startTime = Date.now();
    this.stats.totalProcessed++;

    const result = {
      success: false,
      hasHandwriting: false,
      handwritingType: 'none',
      confidence: 0,
      text: '',
      signatureDetected: false,
      manualReviewRequired: false,
      language: options.language || this.options.language,
      processingTime: 0,
      metadata: {
        method: 'tesseract-handwriting',
        version: Tesseract.version,
        imagePath: imagePath,
        timestamp: new Date().toISOString()
      },
      errors: [],
      warnings: []
    };

    try {
      // Validate file exists
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      // Validate file type
      const ext = path.extname(imagePath).toLowerCase();
      const supportedFormats = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp'];
      if (!supportedFormats.includes(ext)) {
        throw new Error(`Unsupported image format: ${ext}. Supported formats: ${supportedFormats.join(', ')}`);
      }

      // Get worker
      const workerData = await this.getWorker();
      
      try {
        // Set language if different from default
        const targetLanguage = options.language || this.options.language;
        if (targetLanguage !== this.options.language) {
          await workerData.worker.loadLanguage(targetLanguage);
          await workerData.worker.initialize(targetLanguage);
        }

        // Configure OCR parameters for handwriting detection
        const ocrOptions = {
          // Use handwriting-optimized page segmentation
          tessedit_pageseg_mode: '6', // Uniform block of text
          tessedit_ocr_engine_mode: '3', // LSTM OCR Engine Mode
          // Allow all characters for handwriting
          tessedit_char_whitelist: '',
          // Preserve spaces
          preserve_interword_spaces: '1',
          // Additional handwriting-specific options
          tessedit_do_invert: '0', // Don't invert image
          ...options.tesseractOptions
        };

        // Perform OCR
        const { data } = await workerData.worker.recognize(imagePath, ocrOptions);
        
        // Process results
        result.success = true;
        result.text = data.text || '';
        result.confidence = data.confidence || 0;
        result.language = targetLanguage;
        result.metadata.words = data.words || [];
        result.metadata.lines = data.lines || [];
        result.metadata.blocks = data.blocks || [];
        result.metadata.paragraphs = data.paragraphs || [];

        // Analyze text for handwriting characteristics
        const handwritingAnalysis = this.analyzeHandwritingCharacteristics(result.text, data.words || []);
        result.hasHandwriting = handwritingAnalysis.hasHandwriting;
        result.handwritingType = handwritingAnalysis.type;
        result.signatureDetected = handwritingAnalysis.isSignature;
        result.manualReviewRequired = handwritingAnalysis.requiresManualReview;

        // Update statistics
        this.updateStats(true, targetLanguage, result.confidence, Date.now() - startTime, handwritingAnalysis);
        
        if (this.options.debug) {
          console.log(`[Handwriting] Detected ${result.handwritingType} in ${imagePath} (confidence: ${result.confidence})`);
        }

      } finally {
        // Always release the worker
        this.releaseWorker(workerData);
      }

    } catch (error) {
      result.errors.push(error.message);
      this.updateStats(false, options.language || this.options.language, 0, Date.now() - startTime);
      
      if (this.options.debug) {
        console.error(`[Handwriting] Failed to detect handwriting in ${imagePath}:`, error.message);
      }
    }

    result.processingTime = Date.now() - startTime;
    return result;
  }

  /**
   * Analyze text characteristics to determine if it's handwriting
   * @private
   * @param {string} text - Extracted text
   * @param {Array} words - Word-level data from OCR
   * @returns {Object} Handwriting analysis result
   */
  analyzeHandwritingCharacteristics(text, words) {
    const analysis = {
      hasHandwriting: false,
      type: 'none',
      isSignature: false,
      requiresManualReview: false,
      confidence: 0
    };

    if (!text || text.trim().length === 0) {
      return analysis;
    }

    // Check for signature patterns (more specific patterns)
    const signaturePatterns = [
      /signature/i, /signed/i, /sign here/i, /authorized by/i,
      /manuscript/i, /cursive/i, /script/i
    ];

    const hasSignaturePatterns = signaturePatterns.some(pattern => pattern.test(text));
    
    // Analyze word-level characteristics
    let handwritingIndicators = 0;
    let totalWords = words.length;
    let lowConfidenceWords = 0;
    let irregularSpacing = 0;

    if (words.length > 0) {
      // Check for low confidence words (common in handwriting)
      lowConfidenceWords = words.filter(word => word.confidence < 0.5).length;
      
      // Check for irregular spacing (common in handwriting)
      const wordSpacings = [];
      for (let i = 1; i < words.length; i++) {
        const prevWord = words[i - 1];
        const currWord = words[i];
        if (prevWord.bbox && currWord.bbox) {
          const spacing = currWord.bbox.x0 - prevWord.bbox.x1;
          wordSpacings.push(spacing);
        }
      }
      
      if (wordSpacings.length > 0) {
        const avgSpacing = wordSpacings.reduce((a, b) => a + b, 0) / wordSpacings.length;
        const spacingVariance = wordSpacings.reduce((sum, spacing) => sum + Math.pow(spacing - avgSpacing, 2), 0) / wordSpacings.length;
        irregularSpacing = spacingVariance > (avgSpacing * 0.5) ? 1 : 0;
      }
    }

    // Calculate handwriting indicators
    if (lowConfidenceWords / totalWords > 0.3) handwritingIndicators++;
    if (irregularSpacing) handwritingIndicators++;
    if (hasSignaturePatterns) handwritingIndicators++;
    
    // Check for handwriting-specific character patterns
    const handwritingChars = /[a-z]/g;
    const printedChars = /[A-Z0-9]/g;
    const handwritingCharCount = (text.match(handwritingChars) || []).length;
    const printedCharCount = (text.match(printedChars) || []).length;
    
    if (handwritingCharCount > printedCharCount) handwritingIndicators++;
    
    // Determine handwriting type
    if (hasSignaturePatterns && handwritingIndicators >= 2) {
      analysis.type = 'signature';
      analysis.isSignature = true;
      analysis.hasHandwriting = true;
      analysis.confidence = 0.8;
    } else if (handwritingIndicators >= 2) {
      analysis.type = 'handwritten';
      analysis.hasHandwriting = true;
      analysis.confidence = 0.6;
    } else if (handwritingIndicators === 1) {
      analysis.type = 'mixed';
      analysis.hasHandwriting = true;
      analysis.confidence = 0.4;
    } else {
      analysis.type = 'printed';
      analysis.hasHandwriting = false;
      analysis.confidence = 0.8;
    }

    // Determine if manual review is required
    analysis.requiresManualReview = (
      analysis.hasHandwriting && 
      (analysis.confidence < this.options.confidenceThresholds[analysis.type] || 
       lowConfidenceWords / totalWords > 0.5)
    );

    return analysis;
  }

  /**
   * Extract handwritten text from an image
   * @param {string} imagePath - Path to the image file
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} Handwriting extraction result
   */
  async extractHandwrittenText(imagePath, options = {}) {
    const detectionResult = await this.detectHandwriting(imagePath, options);
    
    if (!detectionResult.success) {
      return detectionResult;
    }

    // If no handwriting detected, return the detection result
    if (!detectionResult.hasHandwriting) {
      detectionResult.warnings.push('No handwriting detected in image');
      return detectionResult;
    }

    // If handwriting detected, return the extracted text
    return {
      ...detectionResult,
      extractedText: detectionResult.text,
      handwritingType: detectionResult.handwritingType,
      signatureDetected: detectionResult.signatureDetected,
      manualReviewRequired: detectionResult.manualReviewRequired
    };
  }

  /**
   * Extract handwritten text from multiple images in batch
   * @param {Array<string>} imagePaths - Array of image file paths
   * @param {Object} options - Extraction options
   * @returns {Promise<Array<Object>>} Array of handwriting extraction results
   */
  async extractHandwrittenTextBatch(imagePaths, options = {}) {
    const results = [];
    const batchSize = options.batchSize || this.maxWorkers;
    
    // Process in batches to respect worker pool size
    for (let i = 0; i < imagePaths.length; i += batchSize) {
      const batch = imagePaths.slice(i, i + batchSize);
      const batchPromises = batch.map(imagePath => 
        this.extractHandwrittenText(imagePath, options)
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Check if text contains handwriting patterns
   * @param {string} text - Text to analyze
   * @returns {Object} Handwriting pattern analysis
   */
  analyzeTextForHandwriting(text) {
    if (!text || text.trim().length === 0) {
      return {
        hasHandwriting: false,
        patterns: [],
        confidence: 0
      };
    }

    const patterns = [];
    let confidence = 0;

    // Check for handwriting-related patterns
    for (const pattern of this.options.handwritingPatterns) {
      const regex = new RegExp(pattern, 'gi');
      if (regex.test(text)) {
        patterns.push(pattern);
        confidence += 0.1;
      }
    }

    // Check for signature-like patterns
    const signaturePatterns = [
      /signature/i, /signed/i, /sign here/i, /authorized by/i,
      /handwritten/i, /manuscript/i, /cursive/i, /script/i
    ];

    for (const pattern of signaturePatterns) {
      if (pattern.test(text)) {
        patterns.push('signature_pattern');
        confidence += 0.2;
      }
    }

    return {
      hasHandwriting: patterns.length > 0,
      patterns: patterns,
      confidence: Math.min(confidence, 1.0)
    };
  }

  /**
   * Update statistics
   * @private
   * @param {boolean} success - Whether the operation was successful
   * @param {string} language - Language used
   * @param {number} confidence - Confidence score
   * @param {number} processingTime - Processing time in milliseconds
   * @param {Object} handwritingAnalysis - Handwriting analysis result
   */
  updateStats(success, language, confidence, processingTime, handwritingAnalysis = {}) {
    if (success) {
      this.stats.successfulExtractions++;
    } else {
      this.stats.failedExtractions++;
    }

    // Update language usage
    this.stats.languageUsage[language] = (this.stats.languageUsage[language] || 0) + 1;

    // Update handwriting-specific statistics
    if (handwritingAnalysis.hasHandwriting) {
      this.stats.handwritingDetected++;
      this.stats.handwritingTypes[handwritingAnalysis.type] = 
        (this.stats.handwritingTypes[handwritingAnalysis.type] || 0) + 1;
    }

    if (handwritingAnalysis.isSignature) {
      this.stats.signaturesDetected++;
    }

    if (handwritingAnalysis.requiresManualReview) {
      this.stats.manualReviewRequired++;
    }

    // Update average confidence
    const totalSuccessful = this.stats.successfulExtractions;
    if (totalSuccessful > 0) {
      this.stats.averageConfidence = 
        ((this.stats.averageConfidence * (totalSuccessful - 1)) + confidence) / totalSuccessful;
    }

    // Update processing time statistics
    this.stats.totalProcessingTime += processingTime;
    this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.totalProcessed;
  }

  /**
   * Get current statistics
   * @returns {Object} Current statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalProcessed > 0 
        ? this.stats.successfulExtractions / this.stats.totalProcessed 
        : 0,
      handwritingDetectionRate: this.stats.totalProcessed > 0
        ? this.stats.handwritingDetected / this.stats.totalProcessed
        : 0,
      signatureDetectionRate: this.stats.totalProcessed > 0
        ? this.stats.signaturesDetected / this.stats.totalProcessed
        : 0,
      manualReviewRate: this.stats.totalProcessed > 0
        ? this.stats.manualReviewRequired / this.stats.totalProcessed
        : 0,
      activeWorkers: Array.from(this.workers.values()).filter(w => w.busy).length,
      queuedRequests: this.workerQueue.length
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalProcessed: 0,
      successfulExtractions: 0,
      failedExtractions: 0,
      handwritingDetected: 0,
      signaturesDetected: 0,
      manualReviewRequired: 0,
      averageConfidence: 0,
      averageProcessingTime: 0,
      languageUsage: {},
      totalProcessingTime: 0,
      handwritingTypes: {
        signature: 0,
        handwritten: 0,
        printed: 0,
        mixed: 0
      }
    };
  }

  /**
   * Check if a language is supported for handwriting
   * @param {string} language - Language code to check
   * @returns {boolean} True if language is supported
   */
  isLanguageSupported(language) {
    return this.options.supportedLanguages.includes(language);
  }

  /**
   * Add support for a new language
   * @param {string} language - Language code to add
   * @returns {Promise<boolean>} Success status
   */
  async addLanguageSupport(language) {
    if (this.isLanguageSupported(language)) {
      return true;
    }

    try {
      // Add to supported languages
      this.options.supportedLanguages.push(language);
      
      // Load language for all workers
      for (const [id, workerData] of this.workers) {
        await workerData.worker.loadLanguage(language);
      }
      
      if (this.options.debug) {
        console.log(`[Handwriting] Added language support: ${language}`);
      }
      
      return true;
    } catch (error) {
      console.error(`[Handwriting] Failed to add language support for ${language}:`, error.message);
      return false;
    }
  }

  /**
   * Terminate all workers and cleanup
   * @returns {Promise<void>}
   */
  async terminate() {
    try {
      // Terminate all workers
      for (const [id, workerData] of this.workers) {
        await workerData.worker.terminate();
      }
      
      this.workers.clear();
      this.workerQueue = [];
      
      if (this.options.debug) {
        console.log('[Handwriting] All workers terminated');
      }
    } catch (error) {
      console.error('[Handwriting] Error during termination:', error.message);
    }
  }

  /**
   * Log debug message
   * @private
   * @param {string} message - Message to log
   */
  log(message) {
    if (this.options.debug) {
      console.log(`[Handwriting] ${message}`);
    }
  }
}

module.exports = HandwritingService;
