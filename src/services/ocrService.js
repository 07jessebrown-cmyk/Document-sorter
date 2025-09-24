const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

/**
 * OCR Service using Tesseract.js
 * 
 * Provides optical character recognition capabilities for extracting text from images and PDFs.
 * Supports multiple languages with English as default, and includes confidence scoring.
 */
class OCRService {
  constructor(options = {}) {
    this.options = {
      // Default language is English
      language: options.language || 'eng',
      // Supported languages (can be expanded)
      supportedLanguages: options.supportedLanguages || ['eng', 'spa', 'fra', 'deu', 'ita', 'por', 'rus', 'jpn', 'chi_sim', 'chi_tra'],
      // OCR engine options
      engineOptions: {
        logger: options.debug ? m => console.log(`[OCR] ${m}`) : () => {},
        ...options.engineOptions
      },
      // Confidence threshold for text extraction
      minConfidence: options.minConfidence || 0.3,
      // Timeout for OCR operations (in milliseconds)
      timeout: options.timeout || 60000,
      // Debug mode
      debug: options.debug || false,
      // Worker pool size for concurrent processing
      workerPoolSize: options.workerPoolSize || 2,
      // Cache directory for trained data
      cacheDir: options.cacheDir || path.join(__dirname, '../../../eng.traineddata'),
      // Enable preprocessing
      enablePreprocessing: options.enablePreprocessing !== false,
      // Preprocessing options
      preprocessing: {
        // Convert to grayscale
        grayscale: true,
        // Apply noise reduction
        denoise: true,
        // Enhance contrast
        enhanceContrast: true,
        // Resize image if too small
        resize: true,
        minWidth: 100,
        minHeight: 100,
        ...options.preprocessing
      }
    };

    // Statistics tracking
    this.stats = {
      totalProcessed: 0,
      successfulExtractions: 0,
      failedExtractions: 0,
      averageConfidence: 0,
      averageProcessingTime: 0,
      languageUsage: {},
      totalProcessingTime: 0
    };

    // Worker pool for concurrent processing
    this.workers = new Map();
    this.workerQueue = [];
    this.maxWorkers = this.options.workerPoolSize;

    // Initialize worker pool
    this.initializeWorkers();
  }

  /**
   * Initialize worker pool for concurrent OCR processing
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
        
        this.workers.set(i, {
          worker,
          busy: false,
          id: i
        });
      }
      
      if (this.options.debug) {
        console.log(`[OCR] Initialized ${this.maxWorkers} workers for language: ${this.options.language}`);
      }
    } catch (error) {
      console.warn('[OCR] Failed to initialize workers:', error.message);
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
   * Extract text from an image file using OCR
   * @param {string} imagePath - Path to the image file
   * @param {Object} options - OCR options
   * @returns {Promise<Object>} OCR result with text and metadata
   */
  async extractText(imagePath, options = {}) {
    const startTime = Date.now();
    this.stats.totalProcessed++;

    const result = {
      success: false,
      text: '',
      confidence: 0,
      language: options.language || this.options.language,
      processingTime: 0,
      metadata: {
        method: 'tesseract',
        version: Tesseract.version,
        imagePath: imagePath,
        timestamp: new Date().toISOString()
      },
      errors: []
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

        // Configure OCR parameters
        const ocrOptions = {
          // Set confidence threshold
          tessedit_char_whitelist: options.whitelist || '',
          tessedit_blacklist: options.blacklist || '',
          preserve_interword_spaces: options.preserveSpaces !== false ? '1' : '0',
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

        // Apply confidence filtering
        if (result.confidence < this.options.minConfidence) {
          result.warnings = result.warnings || [];
          result.warnings.push(`Low confidence: ${result.confidence} < ${this.options.minConfidence}`);
        }

        // Update statistics
        this.updateStats(true, targetLanguage, result.confidence, Date.now() - startTime);
        
        if (this.options.debug) {
          console.log(`[OCR] Extracted text from ${imagePath} (confidence: ${result.confidence})`);
        }

      } finally {
        // Always release the worker
        this.releaseWorker(workerData);
      }

    } catch (error) {
      result.errors.push(error.message);
      this.updateStats(false, options.language || this.options.language, 0, Date.now() - startTime);
      
      if (this.options.debug) {
        console.error(`[OCR] Failed to extract text from ${imagePath}:`, error.message);
      }
    }

    result.processingTime = Date.now() - startTime;
    return result;
  }

  /**
   * Extract text from multiple images in batch
   * @param {Array<string>} imagePaths - Array of image file paths
   * @param {Object} options - OCR options
   * @returns {Promise<Array<Object>>} Array of OCR results
   */
  async extractTextBatch(imagePaths, options = {}) {
    const results = [];
    const batchSize = options.batchSize || this.maxWorkers;
    
    // Process in batches to respect worker pool size
    for (let i = 0; i < imagePaths.length; i += batchSize) {
      const batch = imagePaths.slice(i, i + batchSize);
      const batchPromises = batch.map(imagePath => 
        this.extractText(imagePath, options)
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Extract text from a PDF by converting pages to images first
   * @param {string} pdfPath - Path to the PDF file
   * @param {Object} options - OCR options
   * @returns {Promise<Object>} OCR result with text from all pages
   */
  async extractTextFromPDF(pdfPath, options = {}) {
    const startTime = Date.now();
    
    try {
      // This would require pdf2pic or similar library to convert PDF to images
      // For now, we'll return a not implemented error
      throw new Error('PDF OCR not implemented - requires pdf2pic library for PDF to image conversion');
    } catch (error) {
      return {
        success: false,
        text: '',
        confidence: 0,
        language: options.language || this.options.language,
        processingTime: Date.now() - startTime,
        metadata: {
          method: 'tesseract-pdf',
          pdfPath: pdfPath,
          timestamp: new Date().toISOString()
        },
        errors: [error.message]
      };
    }
  }

  /**
   * Detect the language of text in an image
   * @param {string} imagePath - Path to the image file
   * @param {Array<string>} candidateLanguages - Languages to test
   * @returns {Promise<Object>} Language detection result
   */
  async detectLanguage(imagePath, candidateLanguages = null) {
    const languages = candidateLanguages || this.options.supportedLanguages;
    const results = [];
    
    for (const lang of languages) {
      try {
        const result = await this.extractText(imagePath, { 
          language: lang,
          tesseractOptions: {
            tessedit_pageseg_mode: '1' // Automatic page segmentation with OSD
          }
        });
        
        if (result.success) {
          results.push({
            language: lang,
            confidence: result.confidence,
            text: result.text
          });
        }
      } catch (error) {
        // Skip failed languages
        continue;
      }
    }
    
    // Sort by confidence and return best match
    results.sort((a, b) => b.confidence - a.confidence);
    
    return {
      success: results.length > 0,
      detectedLanguage: results[0]?.language || 'unknown',
      confidence: results[0]?.confidence || 0,
      candidates: results,
      metadata: {
        method: 'tesseract-language-detection',
        imagePath: imagePath,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Update statistics
   * @private
   * @param {boolean} success - Whether the operation was successful
   * @param {string} language - Language used
   * @param {number} confidence - Confidence score
   * @param {number} processingTime - Processing time in milliseconds
   */
  updateStats(success, language, confidence, processingTime) {
    if (success) {
      this.stats.successfulExtractions++;
    } else {
      this.stats.failedExtractions++;
    }

    // Update language usage
    this.stats.languageUsage[language] = (this.stats.languageUsage[language] || 0) + 1;

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
      averageConfidence: 0,
      averageProcessingTime: 0,
      languageUsage: {},
      totalProcessingTime: 0
    };
  }

  /**
   * Check if a language is supported
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
        console.log(`[OCR] Added language support: ${language}`);
      }
      
      return true;
    } catch (error) {
      console.error(`[OCR] Failed to add language support for ${language}:`, error.message);
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
        console.log('[OCR] All workers terminated');
      }
    } catch (error) {
      console.error('[OCR] Error during termination:', error.message);
    }
  }

  /**
   * Log debug message
   * @private
   * @param {string} message - Message to log
   */
  log(message) {
    if (this.options.debug) {
      console.log(`[OCR] ${message}`);
    }
  }
}

module.exports = OCRService;
