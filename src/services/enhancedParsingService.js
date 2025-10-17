const ParsingService = require('./parsingService');
const AITextService = require('./aiTextService');
const LLMClientBackend = require('./llmClientBackend');
const AICache = require('./aiCache');
const ConfigService = require('./configService');
const TableExtractorService = require('./tableExtractor');
const OCRService = require('./ocrService');
const HandwritingService = require('./handwritingService');
const WatermarkService = require('./watermarkService');
const TelemetryService = require('./telemetryService');
const CanaryRolloutService = require('./canaryRolloutService');
const RolloutMonitoringService = require('./rolloutMonitoringService');
const BetaUserService = require('./betaUserService');
const EnhancedPdfExtractor = require('./enhancedPdfExtractor');
const { buildMetadataPrompt } = require('./ai_prompts');
const path = require('path');

/**
 * Enhanced Parsing Service with AI Integration
 * 
 * This service extends the base ParsingService with AI capabilities:
 * - Runs regex + fuzzy matching first
 * - Falls back to AI when confidence is low or data is missing
 * - Provides confidence scoring for all methods
 * - Supports batch processing with concurrency control
 * - Caches AI responses to reduce API calls
 */

class EnhancedParsingService extends ParsingService {
  constructor(options = {}) {
    super();
    
    // Initialize configuration service
    this.configService = options.configService || new ConfigService();
    
    // AI Configuration - prioritize options over config over environment variables
    this.useAI = options.useAI !== undefined 
      ? options.useAI 
      : (this.configService.get('ai.enabled') || process.env.USE_AI === 'true');
    this.aiConfidenceThreshold = options.aiConfidenceThreshold !== undefined 
      ? options.aiConfidenceThreshold 
      : (this.configService.get('ai.confidenceThreshold') || parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.5);
    this.aiBatchSize = options.aiBatchSize !== undefined 
      ? options.aiBatchSize 
      : (this.configService.get('ai.batchSize') || parseInt(process.env.AI_BATCH_SIZE) || 5);
    this.aiTimeout = this.configService.get('ai.timeout') || parseInt(process.env.AI_TIMEOUT) || 30000; // 30 seconds
    
    // Extraction feature flags from config
    this.extractionConfig = this.configService.getExtractionConfig();
    this.useOCR = options.useOCR !== undefined ? options.useOCR : this.extractionConfig.useOCR;
    this.useTableExtraction = options.useTableExtraction !== undefined ? options.useTableExtraction : this.extractionConfig.useTableExtraction;
    this.useLLMEnhancer = options.useLLMEnhancer !== undefined ? options.useLLMEnhancer : this.extractionConfig.useLLMEnhancer;
    this.useHandwritingDetection = options.useHandwritingDetection !== undefined ? options.useHandwritingDetection : this.extractionConfig.useHandwritingDetection;
    this.useWatermarkDetection = options.useWatermarkDetection !== undefined ? options.useWatermarkDetection : this.extractionConfig.useWatermarkDetection;
    
    // Initialize AI services
    this.aiTextService = null;
    this.llmClient = null;
    this.aiCache = null;
    this.promptService = null;
    this.telemetry = null;
    
    // Initialize table extractor if enabled
    this.tableExtractor = null;
    if (this.useTableExtraction) {
      this.tableExtractor = new TableExtractorService({
        debug: this.configService.get('debug', false),
        timeout: this.configService.get('extraction.tableTimeout', 30000)
      });
    }
    
    // Initialize OCR service if enabled
    this.ocrService = null;
    if (this.useOCR) {
      this.ocrService = new OCRService({
        language: this.configService.get('extraction.ocrLanguage', 'eng'),
        debug: this.configService.get('debug', false),
        workerPoolSize: this.configService.get('extraction.ocrWorkerPoolSize', 2)
      });
    }
    
    // Initialize enhanced PDF extractor for robust PDF processing
    this.enhancedPdfExtractor = new EnhancedPdfExtractor({
      minTextLength: 50,
      enablePoppler: true,
      enablePdf2pic: true,
      enableOcr: this.useOCR
    });
    
    // Initialize language detection service
    
    // Initialize handwriting service if enabled
    this.handwritingService = null;
    if (this.useHandwritingDetection) {
      this.handwritingService = new HandwritingService({
        language: this.configService.get('extraction.handwritingLanguage', 'eng'),
        debug: this.configService.get('debug', false),
        workerPoolSize: this.configService.get('extraction.handwritingWorkerPoolSize', 1)
      });
    }
    
    // Initialize watermark service if enabled
    this.watermarkService = null;
    if (this.useWatermarkDetection) {
      this.watermarkService = new WatermarkService({
        debug: this.configService.get('debug', false),
        minOccurrences: this.configService.get('extraction.watermarkMinOccurrences', 3),
        pageOverlapThreshold: this.configService.get('extraction.watermarkPageOverlapThreshold', 0.5)
      });
    }
    
    // Processing statistics
    this.stats = {
      totalProcessed: 0,
      regexProcessed: 0,
      aiProcessed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      averageConfidence: 0
    };
    
    // Initialize telemetry service
    this.initializeTelemetry();
    
    // Initialize canary rollout services
    this.initializeCanaryRollout();
    
    // Initialize AI services if enabled (but don't fail if initialization fails)
    if (this.useAI) {
      this.initializeAIServices().catch(error => {
        console.warn('AI services initialization failed, but keeping useAI enabled:', error.message);
      });
    }
  }

  /**
   * Check if a feature is enabled for the current user
   * @param {string} featureName - Feature name
   * @param {string} userId - User ID (optional, defaults to system user)
   * @returns {boolean} True if feature is enabled
   */
  isFeatureEnabledForUser(featureName, userId = 'system') {
    // Check canary rollout service first
    if (this.canaryRolloutService && this.canaryRolloutService.isInitialized) {
      return this.canaryRolloutService.isFeatureEnabledForUser(userId, featureName);
    }
    
    // Fallback to config service
    return this.configService.get(`extraction.${featureName}`, false);
  }

  /**
   * Enhanced text extraction with multiple fallback methods
   * @param {string} filePath - Path to the file
   * @returns {Promise<string>} Extracted text
   */
  async extractText(filePath) {
    try {
      const fileExtension = path.extname(filePath).toLowerCase();
      
      // For PDFs, use enhanced extractor with multiple fallback methods
      if (fileExtension === '.pdf') {
        console.log(`🔍 Using enhanced PDF extraction for: ${path.basename(filePath)}`);
        const result = await this.enhancedPdfExtractor.extractText(filePath);
        
        if (result.success && result.text) {
          console.log(`✅ Enhanced PDF extraction succeeded: ${result.text.length} chars via ${result.method}`);
          return result.text;
        } else {
          console.log(`⚠️ Enhanced PDF extraction failed, trying standard method`);
          // Fall back to standard extraction
          return await super.extractText(filePath);
        }
      } else {
        // For non-PDF files, use standard extraction
        return await super.extractText(filePath);
      }
    } catch (error) {
      console.error(`Text extraction failed for ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Initialize telemetry service
   * @returns {void}
   */
  initializeTelemetry() {
    try {
      this.telemetry = new TelemetryService({
        enabled: this.configService.get('telemetry.enabled', true),
        logDir: this.configService.get('telemetry.logDir'),
        maxLogSize: this.configService.get('telemetry.maxLogSize', 10 * 1024 * 1024),
        retentionDays: this.configService.get('telemetry.retentionDays', 30)
      });
      
      // Initialize telemetry asynchronously
      this.telemetry.initialize().catch(error => {
        console.warn('Telemetry initialization failed:', error.message);
        this.telemetry = null;
      });
      
      console.log('📊 Telemetry service initialized');
    } catch (error) {
      console.warn('Failed to initialize telemetry service:', error.message);
      this.telemetry = null;
    }
  }

  /**
   * Initialize canary rollout services
   * @returns {void}
   */
  initializeCanaryRollout() {
    try {
      // Initialize canary rollout service
      this.canaryRolloutService = new CanaryRolloutService({
        enabled: this.configService.get('canaryRollout.enabled', true)
      });
      
      // Initialize beta user service
      this.betaUserService = new BetaUserService({
        enabled: this.configService.get('betaUsers.enabled', true)
      });
      
      // Initialize rollout monitoring service
      this.rolloutMonitoringService = new RolloutMonitoringService({
        enabled: this.configService.get('rolloutMonitoring.enabled', true),
        canaryService: this.canaryRolloutService,
        telemetryService: this.telemetryService
      });
      
      // Initialize services asynchronously
      Promise.all([
        this.canaryRolloutService.initialize(),
        this.betaUserService.initialize(),
        this.rolloutMonitoringService.initialize()
      ]).catch(error => {
        console.warn('Canary rollout services initialization failed:', error.message);
      });
      
      console.log('🎯 Canary rollout services initialized');
    } catch (error) {
      console.warn('Failed to initialize canary rollout services:', error.message);
      this.canaryRolloutService = null;
      this.betaUserService = null;
      this.rolloutMonitoringService = null;
    }
  }

  /**
   * Initialize AI services
   * @returns {Promise<void>}
   */
  async initializeAIServices() {
    try {
      // Initialize LLM Client with Backend Proxy
      this.llmClient = new LLMClientBackend({
        baseURL: process.env.BACKEND_URL || 'http://localhost:3000',
        clientToken: process.env.CLIENT_TOKEN || 'your_secure_client_token_here',
        defaultModel: process.env.AI_MODEL || 'gpt-3.5-turbo',
        maxRetries: 3,
        retryDelay: 1000,
        timeout: this.aiTimeout
      });

      // Initialize AI Cache
      this.aiCache = new AICache({
        cacheDir: process.env.AI_CACHE_DIR,
        maxCacheSize: parseInt(process.env.AI_CACHE_SIZE) || 1000,
        maxAge: parseInt(process.env.AI_CACHE_AGE) || 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Initialize AI Text Service
      this.aiTextService = new AITextService();
      this.aiTextService.setLLMClient(this.llmClient);
      this.aiTextService.setCache(this.aiCache);
      this.aiTextService.setTelemetry(this.telemetry);

      // Set telemetry for other services
      if (this.llmClient) {
        this.llmClient.setTelemetry(this.telemetry);
      }
      if (this.aiCache) {
        this.aiCache.setTelemetry(this.telemetry);
      }

      // Prompt service is now imported as functions

      // Initialize cache
      await this.aiCache.initialize();

      console.log('✅ AI services initialized successfully');
    } catch (error) {
      console.warn('⚠️ Failed to initialize AI services:', error.message);
      // Don't disable AI on initialization failure - let the caller decide
    }
  }

  /**
   * Enhanced document analysis with AI fallback
   * @param {string} text - Document text
   * @param {string} filePath - File path
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Enhanced analysis result
   */
  async analyzeDocumentEnhanced(text, filePath, options = {}) {
    const startTime = Date.now();
    this.stats.totalProcessed++;
    
    const result = {
      date: undefined,
      type: 'Unclassified',
      name: undefined,
      clientName: undefined,
      amount: undefined,
      title: undefined,
      confidence: 0,
      rawText: text,
      filePath: filePath,
      source: 'regex', // Track which method was used
      aiConfidence: 0,
      snippets: [],
      tables: [] // Add tables array for table extraction results
    };

    if (!text || text.trim().length === 0) {
      // Track processing completion
      if (this.telemetry) {
        this.telemetry.trackFileProcessing({
          method: 'regex',
          confidence: 0,
          processingTime: Date.now() - startTime,
          success: false
        });
      }
      return result;
    }

    try {
      // Step 1: Extract tables if enabled
      let tableData = null;
      if (this.useTableExtraction && this.tableExtractor) {
        try {
          console.log(`📊 Extracting tables from: ${filePath}`);
          tableData = await this.extractTables(filePath, options);
          if (tableData && tableData.success && tableData.tables.length > 0) {
            result.tables = tableData.tables;
            console.log(`📊 Found ${tableData.tables.length} tables in ${filePath}`);
          }
        } catch (tableError) {
          console.warn(`Table extraction failed for ${filePath}:`, tableError.message);
        }
      }

      // Step 1.5: Detect handwriting if enabled
      let handwritingData = null;
      if (this.useHandwritingDetection && this.handwritingService) {
        try {
          console.log(`✍️ Detecting handwriting in: ${filePath}`);
          handwritingData = await this.detectHandwriting(filePath, options);
          if (handwritingData && handwritingData.success) {
            result.handwritingDetected = handwritingData.hasHandwriting;
            result.handwritingType = handwritingData.handwritingType;
            result.signatureDetected = handwritingData.signatureDetected;
            result.manualReviewRequired = handwritingData.manualReviewRequired;
            result.handwritingConfidence = handwritingData.confidence;
            console.log(`✍️ Handwriting detection: ${handwritingData.handwritingType} (confidence: ${handwritingData.confidence})`);
          }
        } catch (handwritingError) {
          console.warn(`Handwriting detection failed for ${filePath}:`, handwritingError.message);
        }
      }

      // Step 1.6: Detect watermarks if enabled
      let watermarkData = null;
      if (this.useWatermarkDetection && this.watermarkService) {
        try {
          console.log(`💧 Detecting watermarks in: ${filePath}`);
          watermarkData = await this.detectWatermarks(filePath, options);
          if (watermarkData && watermarkData.success) {
            result.watermarksDetected = watermarkData.watermarks.length > 0;
            result.watermarks = watermarkData.watermarks;
            result.watermarkConfidence = watermarkData.confidence;
            result.watermarkCount = watermarkData.watermarks.length;
            console.log(`💧 Watermark detection: ${watermarkData.watermarks.length} watermarks found (confidence: ${watermarkData.confidence})`);
            
            // Filter watermarks from text if high confidence
            if (watermarkData.watermarks.length > 0) {
              text = this.watermarkService.filterWatermarks(text, watermarkData.watermarks);
              console.log(`💧 Filtered watermarks from text, new length: ${text.length}`);
            }
          }
        } catch (watermarkError) {
          console.warn(`Watermark detection failed for ${filePath}:`, watermarkError.message);
        }
      }

      // Step 2: Run traditional regex + fuzzy analysis
      const regexResult = this.analyzeDocument(text, filePath);
      
      // Enhance with confidence scoring
      const enhancedRegexResult = this.enhanceWithConfidence(regexResult, text);
      
      // Merge table data into result
      if (tableData) {
        enhancedRegexResult.tables = tableData.tables || [];
        enhancedRegexResult.tableConfidence = tableData.confidence || 0;
        enhancedRegexResult.tableMethod = tableData.method || 'none';
      } else {
        // Ensure tables array is always present
        enhancedRegexResult.tables = [];
        enhancedRegexResult.tableConfidence = 0;
        enhancedRegexResult.tableMethod = 'none';
      }
      
      // Check if we need AI fallback
      const needsAI = this.shouldUseAI(enhancedRegexResult, options);
      
      if (needsAI && this.useAI) {
        console.log(`🤖 Using AI fallback for: ${filePath}`);
        this.stats.aiProcessed++;
        
        try {
          // Detect language for AI processing
          const aiOptions = {
            ...options,
          };
          
          const aiResult = await this.processWithAI(text, filePath, aiOptions);
          if (aiResult) {
            // Merge AI results with regex results and table data
            const mergedResult = this.mergeResults(enhancedRegexResult, aiResult, tableData);
            this.stats.averageConfidence = this.updateAverageConfidence(mergedResult.confidence);
            
            // Track AI processing completion
            if (this.telemetry) {
              try {
                this.telemetry.trackFileProcessing({
                  method: 'ai',
                  confidence: mergedResult.confidence,
                  processingTime: Date.now() - startTime,
                  success: true
                });
              } catch (telemetryError) {
                console.warn('Telemetry tracking failed:', telemetryError.message);
              }
            }
            
            return mergedResult;
          }
        } catch (aiError) {
          console.warn(`AI processing failed for ${filePath}:`, aiError.message);
          this.stats.errors++;
          
          // Track AI processing error
          if (this.telemetry) {
            try {
              this.telemetry.trackError('ai_processing_failed', aiError.message, { filePath });
            } catch (telemetryError) {
              console.warn('Telemetry error tracking failed:', telemetryError.message);
            }
          }
        }
      }
      
      // Use regex results
      this.stats.regexProcessed++;
      this.stats.averageConfidence = this.updateAverageConfidence(enhancedRegexResult.confidence);
      
      // Track processing completion
      if (this.telemetry) {
        try {
          this.telemetry.trackFileProcessing({
            method: 'regex',
            confidence: enhancedRegexResult.confidence,
            processingTime: Date.now() - startTime,
            success: true
          });
        } catch (telemetryError) {
          console.warn('Telemetry tracking failed:', telemetryError.message);
        }
      }
      
      // Generate improved filename using new filename generation service
      try {
        const { generateImprovedFilename } = require('./filenamePrompts');
        const fileExtension = path.extname(filePath).toLowerCase();
        const suggestedFilename = generateImprovedFilename(enhancedRegexResult, fileExtension, 100);
        enhancedRegexResult.suggestedFilename = suggestedFilename;
        console.log(`📝 Generated filename: ${suggestedFilename}`);
      } catch (filenameError) {
        console.warn(`Filename generation failed: ${filenameError.message}`);
        // Fallback to basic filename generation
        const fileExtension = path.extname(filePath).toLowerCase();
        enhancedRegexResult.suggestedFilename = this.generateBasicFilename(enhancedRegexResult, fileExtension);
      }
      
      return enhancedRegexResult;
      
    } catch (error) {
      console.error(`Analysis failed for ${filePath}:`, error);
      this.stats.errors++;
      result.error = error.message;
      
      // Track processing error
      if (this.telemetry) {
        this.telemetry.trackFileProcessing({
          method: 'regex',
          confidence: 0,
          processingTime: Date.now() - startTime,
          success: false
        });
        this.telemetry.trackError('analysis_failed', error.message, { filePath });
      }
      
      return result;
    }
  }

  /**
   * Detect language of the given text
   * @param {string} text - Text to analyze
   * @returns {Promise<Object>} Language detection result
   */

  /**
   * Extract tables from PDF file
   * @param {string} filePath - Path to PDF file
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} Table extraction result
   */
  async extractTables(filePath, options = {}) {
    if (!this.tableExtractor) {
      return {
        success: false,
        tables: [],
        confidence: 0,
        method: 'none',
        errors: ['Table extraction not enabled']
      };
    }

    try {
      const result = await this.tableExtractor.extractTables(filePath, options);
      return result;
    } catch (error) {
      console.error(`Table extraction failed for ${filePath}:`, error);
      return {
        success: false,
        tables: [],
        confidence: 0,
        method: 'error',
        errors: [error.message]
      };
    }
  }

  /**
   * Detect handwriting in file
   * @param {string} filePath - Path to file
   * @param {Object} options - Detection options
   * @returns {Promise<Object>} Handwriting detection result
   */
  async detectHandwriting(filePath, options = {}) {
    if (!this.handwritingService) {
      return {
        success: false,
        hasHandwriting: false,
        handwritingType: 'none',
        confidence: 0,
        method: 'none',
        errors: ['Handwriting detection not enabled']
      };
    }

    try {
      const result = await this.handwritingService.detectHandwriting(filePath, options);
      return result;
    } catch (error) {
      console.error(`Handwriting detection failed for ${filePath}:`, error);
      return {
        success: false,
        hasHandwriting: false,
        handwritingType: 'none',
        confidence: 0,
        method: 'error',
        errors: [error.message]
      };
    }
  }

  /**
   * Detect watermarks in file
   * @param {string} filePath - Path to file
   * @param {Object} options - Detection options
   * @returns {Promise<Object>} Watermark detection result
   */
  async detectWatermarks(filePath, options = {}) {
    if (!this.watermarkService) {
      return {
        success: false,
        watermarks: [],
        confidence: 0,
        method: 'none',
        errors: ['Watermark detection not enabled']
      };
    }

    try {
      const result = await this.watermarkService.detectWatermarks(filePath, options);
      return result;
    } catch (error) {
      console.error(`Watermark detection failed for ${filePath}:`, error);
      return {
        success: false,
        watermarks: [],
        confidence: 0,
        method: 'error',
        errors: [error.message]
      };
    }
  }

  /**
   * Enhance regex results with confidence scoring
   * @param {Object} result - Regex analysis result
   * @param {string} text - Original text
   * @returns {Object} Enhanced result with confidence scores
   */
  enhanceWithConfidence(result, text) {
    const enhanced = { ...result };
    
    // Calculate confidence for each field
    enhanced.clientConfidence = this.calculateClientConfidence(result.clientName, text);
    enhanced.dateConfidence = this.calculateDateConfidence(result.date, text);
    enhanced.docTypeConfidence = this.calculateDocTypeConfidence(result.type, text);
    
    // Overall confidence is the average of individual confidences
    const confidences = [
      enhanced.clientConfidence,
      enhanced.dateConfidence,
      enhanced.docTypeConfidence
    ].filter(c => c > 0);
    
    enhanced.confidence = confidences.length > 0 
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
      : 0;
    
    enhanced.source = 'regex';
    return enhanced;
  }

  /**
   * Calculate confidence for client name extraction
   * @param {string} clientName - Extracted client name
   * @param {string} text - Original text
   * @returns {number} Confidence score (0-1)
   */
  calculateClientConfidence(clientName, text) {
    if (!clientName) return 0;
    
    // Check if client name appears in multiple contexts
    const contexts = [
      'bill to', 'billed to', 'invoice to', 'to:',
      'from', 'vendor', 'supplier', 'company',
      'customer', 'account holder', 'payee'
    ];
    
    let contextMatches = 0;
    for (const context of contexts) {
      if (text.toLowerCase().includes(context.toLowerCase())) {
        contextMatches++;
      }
    }
    
    // Base confidence on context matches and name length
    const baseConfidence = Math.min(contextMatches / 3, 1);
    const lengthConfidence = Math.min(clientName.length / 20, 1);
    
    return (baseConfidence + lengthConfidence) / 2;
  }

  /**
   * Calculate confidence for date extraction
   * @param {string} date - Extracted date
   * @param {string} text - Original text
   * @returns {number} Confidence score (0-1)
   */
  calculateDateConfidence(date, text) {
    if (!date) return 0;
    
    // Check if date appears in multiple formats or contexts
    const dateContexts = [
      'date', 'issued', 'created', 'generated', 'printed',
      'due', 'expires', 'valid', 'effective'
    ];
    
    let contextMatches = 0;
    for (const context of dateContexts) {
      if (text.toLowerCase().includes(context.toLowerCase())) {
        contextMatches++;
      }
    }
    
    // Base confidence on context matches
    const baseConfidence = Math.min(contextMatches / 2, 1);
    
    // Additional confidence if date is in YYYY-MM-DD format
    const formatConfidence = /^\d{4}-\d{2}-\d{2}$/.test(date) ? 0.2 : 0;
    
    return Math.min(baseConfidence + formatConfidence, 1);
  }

  /**
   * Calculate confidence for document type detection
   * @param {string} docType - Detected document type
   * @param {string} text - Original text
   * @returns {number} Confidence score (0-1)
   */
  calculateDocTypeConfidence(docType, text) {
    if (!docType || docType === 'Unclassified') return 0;
    
    const keywords = this.documentTypeKeywords[docType] || [];
    if (keywords.length === 0) return 0;
    
    let totalMatches = 0;
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const matches = (text.match(regex) || []).length;
      totalMatches += matches;
    }
    
    // Confidence based on keyword matches
    const baseConfidence = Math.min(totalMatches / 5, 1);
    
    // Additional confidence if type appears in header
    const headerConfidence = this.checkHeaderPresence(docType, text) ? 0.2 : 0;
    
    return Math.min(baseConfidence + headerConfidence, 1);
  }

  /**
   * Check if document type appears in header
   * @param {string} docType - Document type
   * @param {string} text - Original text
   * @returns {boolean} True if found in header
   */
  checkHeaderPresence(docType, text) {
    const lines = text.split('\n').slice(0, 10); // First 10 lines
    const headerText = lines.join(' ').toLowerCase();
    
    const keywords = this.documentTypeKeywords[docType] || [];
    for (const keyword of keywords) {
      if (headerText.includes(keyword.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Determine if AI fallback should be used
   * @param {Object} result - Regex analysis result
   * @param {Object} options - Analysis options
   * @returns {boolean} True if AI should be used
   */
  shouldUseAI(result, options) {
    // Force AI if explicitly requested
    if (options.forceAI) return true;
    
    // Use AI if confidence is below threshold
    if (result.confidence < this.aiConfidenceThreshold) return true;
    
    // Use AI if critical fields are missing
    const missingFields = [];
    if (!result.clientName) missingFields.push('clientName');
    if (!result.date) missingFields.push('date');
    if (result.type === 'Unclassified') missingFields.push('type');
    
    // Use AI if more than one critical field is missing
    if (missingFields.length > 1) return true;
    
    // Use AI if confidence is low and at least one field is missing
    if (result.confidence < 0.7 && missingFields.length > 0) return true;
    
    return false;
  }

  /**
   * Process document with AI
   * @param {string} text - Document text
   * @param {string} filePath - File path
   * @param {Object} options - Processing options
   * @returns {Promise<Object|null>} AI analysis result
   */
  async processWithAI(text, filePath, options = {}) {
    if (!this.aiTextService) {
      throw new Error('AI service not initialized');
    }

    try {
      // Check cache first (unless forceRefresh is true)
      if (!options.forceRefresh) {
        const cacheKey = this.aiCache.generateHash(text);
        const cachedResult = await this.aiCache.get(cacheKey, { forceRefresh: options.forceRefresh });
        
        if (cachedResult) {
          this.stats.cacheHits++;
          console.log(`📦 Cache hit for: ${filePath}`);
          
          // Track cache hit
          if (this.telemetry) {
            try {
              this.telemetry.trackCachePerformance({ hit: true, size: this.aiCache.memoryCache?.size || 0 });
            } catch (telemetryError) {
              console.warn('Telemetry cache tracking failed:', telemetryError.message);
            }
          }
          
          return this.formatAIResult(cachedResult, 'ai-cached');
        }
      }
      
      this.stats.cacheMisses++;
      
      // Track cache miss
      if (this.telemetry) {
        try {
          this.telemetry.trackCachePerformance({ hit: false, size: this.aiCache.memoryCache?.size || 0 });
        } catch (telemetryError) {
          console.warn('Telemetry cache tracking failed:', telemetryError.message);
        }
      }
      
      // Get file metadata for enhanced context
      const fileMetadata = await this.getFileMetadata(filePath);
      
      // Get pre-extracted entities for enhanced context
      const preExtractedEntities = this.extractPreEntities(text);
      
      // Process with AI using metadata extraction config and enhanced context
      const aiResult = await this.aiTextService.extractMetadataAI(text, {
        model: options.model,
        temperature: options.temperature, // Will use config default if not specified
        maxTokens: options.maxTokens, // Will use config default if not specified
        detectedLanguage: options.detectedLanguage,
        languageName: options.languageName,
        forceRefresh: options.forceRefresh || false,
        fileMetadata: fileMetadata,
        preExtractedEntities: preExtractedEntities
      });
      
      if (aiResult) {
        // Cache the result
        const cacheKey = this.aiCache.generateHash(text);
        await this.aiCache.set(cacheKey, aiResult);
        
        // Track cache set
        if (this.telemetry) {
          try {
            this.telemetry.trackCachePerformance({ hit: false, size: this.aiCache.memoryCache?.size || 0 });
          } catch (telemetryError) {
            console.warn('Telemetry cache tracking failed:', telemetryError.message);
          }
        }
        
        return this.formatAIResult(aiResult, 'ai');
      }
      
      return null;
    } catch (error) {
      console.error(`AI processing failed for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Format AI result to match expected structure
   * @param {Object} aiResult - AI service result
   * @param {string} source - Source identifier
   * @returns {Object} Formatted result
   */
  formatAIResult(aiResult, source) {
    return {
      clientName: aiResult.clientName,
      clientConfidence: aiResult.clientConfidence || 0,
      date: aiResult.date,
      dateConfidence: aiResult.dateConfidence || 0,
      type: aiResult.docType || 'Unclassified',
      docTypeConfidence: aiResult.docTypeConfidence || 0,
      confidence: (aiResult.clientConfidence + aiResult.dateConfidence + aiResult.docTypeConfidence) / 3,
      source: source,
      aiConfidence: aiResult.confidence || 0,
      snippets: aiResult.snippets || [],
      amount: aiResult.amount,
      title: aiResult.title
    };
  }

  /**
   * Merge results from all extraction methods with priority: regex > table > AI
   * @param {Object} regexResult - Regex analysis result
   * @param {Object} aiResult - AI analysis result
   * @param {Object} tableResult - Table extraction result (optional)
   * @param {Object} languageInfo - Language detection result (optional)
   * @returns {Object} Merged result with enhanced confidence scoring
   */
  mergeResults(regexResult, aiResult, tableResult = null) {
    const merged = { ...regexResult };
    
    // Initialize field sources tracking
    merged.fieldSources = {
      clientName: 'regex',
      date: 'regex',
      type: 'regex',
      amount: 'regex',
      title: 'regex'
    };
    
    // Merge client name with priority: regex > table > AI
    const clientNameResult = this.mergeField(
      'clientName',
      regexResult.clientName,
      regexResult.clientConfidence,
      'regex',
      tableResult?.clientName,
      tableResult?.clientConfidence,
      'table',
      aiResult.clientName,
      aiResult.clientConfidence,
      'ai',
      languageInfo
    );
    
    merged.clientName = clientNameResult.value;
    merged.clientConfidence = clientNameResult.confidence;
    merged.fieldSources.clientName = clientNameResult.source;
    
    // Merge date with priority: regex > table > AI
    const dateResult = this.mergeField(
      'date',
      regexResult.date,
      regexResult.dateConfidence,
      'regex',
      tableResult?.date,
      tableResult?.dateConfidence,
      'table',
      aiResult.date,
      aiResult.dateConfidence,
      'ai',
      languageInfo
    );
    
    merged.date = dateResult.value;
    merged.dateConfidence = dateResult.confidence;
    merged.fieldSources.date = dateResult.source;
    
    // Merge document type with priority: regex > table > AI
    const docTypeResult = this.mergeField(
      'type',
      regexResult.type,
      regexResult.docTypeConfidence,
      'regex',
      tableResult?.type,
      tableResult?.typeConfidence,
      'table',
      aiResult.type,
      aiResult.docTypeConfidence,
      'ai',
      languageInfo
    );
    
    merged.type = docTypeResult.value;
    merged.docTypeConfidence = docTypeResult.confidence;
    merged.fieldSources.type = docTypeResult.source;
    
    // Merge amount with priority: regex > table > AI
    const amountResult = this.mergeField(
      'amount',
      regexResult.amount,
      regexResult.amountConfidence || 0,
      'regex',
      tableResult?.amount,
      tableResult?.amountConfidence || 0,
      'table',
      aiResult.amount,
      aiResult.amountConfidence || 0,
      'ai',
      languageInfo
    );
    
    merged.amount = amountResult.value;
    merged.amountConfidence = amountResult.confidence;
    merged.fieldSources.amount = amountResult.source;
    
    // Merge title with priority: regex > table > AI
    const titleResult = this.mergeField(
      'title',
      regexResult.title,
      regexResult.titleConfidence || 0,
      'regex',
      tableResult?.title,
      tableResult?.titleConfidence || 0,
      'table',
      aiResult.title,
      aiResult.titleConfidence || 0,
      'ai',
      languageInfo
    );
    
    merged.title = titleResult.value;
    merged.titleConfidence = titleResult.confidence;
    merged.fieldSources.title = titleResult.source;
    
    // Preserve table data from regex result (if any)
    if (regexResult.tables) {
      merged.tables = regexResult.tables;
      merged.tableConfidence = regexResult.tableConfidence;
      merged.tableMethod = regexResult.tableMethod;
    }
    
    // Calculate weighted overall confidence
    merged.confidence = this.calculateWeightedConfidence(merged);
    
    // Update source to indicate hybrid approach
    merged.source = 'hybrid';
    
    // Add AI-specific fields
    merged.aiConfidence = aiResult.aiConfidence;
    merged.snippets = aiResult.snippets;
    
    // Add merge metadata
    merged.mergeMetadata = {
      methodsUsed: this.getMethodsUsed(merged.fieldSources),
      confidenceBreakdown: {
        clientName: merged.clientConfidence,
        date: merged.dateConfidence,
        type: merged.docTypeConfidence,
        amount: merged.amountConfidence,
        title: merged.titleConfidence
      },
      sourceBreakdown: merged.fieldSources
    };
    
    return merged;
  }

  /**
   * Merge a single field from multiple sources with priority: regex > table > AI
   * @param {string} fieldName - Name of the field being merged
   * @param {*} regexValue - Value from regex extraction
   * @param {number} regexConfidence - Confidence from regex extraction
   * @param {string} regexSource - Source identifier for regex
   * @param {*} tableValue - Value from table extraction
   * @param {number} tableConfidence - Confidence from table extraction
   * @param {string} tableSource - Source identifier for table
   * @param {*} aiValue - Value from AI extraction
   * @param {number} aiConfidence - Confidence from AI extraction
   * @param {string} aiSource - Source identifier for AI
   * @param {Object} languageInfo - Language detection result (optional)
   * @returns {Object} Merged field result with value, confidence, and source
   * @private
   */
  mergeField(fieldName, regexValue, regexConfidence, regexSource, tableValue, tableConfidence, tableSource, aiValue, aiConfidence, aiSource) {
    // Priority: regex > table > AI
    // But if regex has no value or very low confidence, use the best available
    
    const candidates = [
      { value: regexValue, confidence: regexConfidence || 0, source: regexSource },
      { value: tableValue, confidence: tableConfidence || 0, source: tableSource },
      { value: aiValue, confidence: aiConfidence || 0, source: aiSource }
    ].filter(candidate => candidate.value !== null && candidate.value !== undefined && candidate.value !== '');
    
    if (candidates.length === 0) {
      return { value: null, confidence: 0, source: 'none' };
    }
    
    // Bilingual mode logic: if we're in bilingual mode and regex confidence is low, prefer AI
    
    if (isBilingualMode && fieldName === 'clientName' && regexConfidence < 0.5 && aiValue) {
      return { value: aiValue, confidence: aiConfidence, source: aiSource };
    }
    
    // If regex has a value and reasonable confidence, use it
    if (regexValue && regexConfidence > 0.3) {
      return { value: regexValue, confidence: regexConfidence, source: regexSource };
    }
    
    // If table has a value and reasonable confidence, use it
    if (tableValue && tableConfidence > 0.3) {
      return { value: tableValue, confidence: tableConfidence, source: tableSource };
    }
    
    // Otherwise, use the candidate with highest confidence
    const bestCandidate = candidates.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
    
    return bestCandidate;
  }

  /**
   * Calculate weighted confidence for merged results
   * @param {Object} merged - Merged result object
   * @returns {number} Weighted confidence score
   * @private
   */
  calculateWeightedConfidence(merged) {
    const fields = [
      { value: merged.clientName, confidence: merged.clientConfidence, weight: 0.3 },
      { value: merged.date, confidence: merged.dateConfidence, weight: 0.25 },
      { value: merged.type, confidence: merged.docTypeConfidence, weight: 0.25 },
      { value: merged.amount, confidence: merged.amountConfidence, weight: 0.1 },
      { value: merged.title, confidence: merged.titleConfidence, weight: 0.1 }
    ];
    
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const field of fields) {
      if (field.value && field.confidence > 0) {
        weightedSum += field.confidence * field.weight;
        totalWeight += field.weight;
      }
    }
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Get list of methods used in the merge
   * @param {Object} fieldSources - Object mapping fields to their sources
   * @returns {Array} Array of unique method names used
   * @private
   */
  getMethodsUsed(fieldSources) {
    const methods = new Set(Object.values(fieldSources));
    methods.delete('none');
    return Array.from(methods);
  }

  /**
   * Process multiple documents in batch
   * @param {Array} documents - Array of document objects
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} Array of analysis results
   */
  async processBatch(documents, options = {}) {
    const results = new Array(documents.length);
    const aiCandidates = [];
    
    // Update total processed count
    this.stats.totalProcessed += documents.length;
    
    // First pass: process with enhanced analysis (includes table extraction)
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const enhancedResult = await this.analyzeDocumentEnhanced(doc.text, doc.filePath, options);
      
      if (this.shouldUseAI(enhancedResult, options)) {
        aiCandidates.push({ index: i, doc, result: enhancedResult });
      } else {
        results[i] = enhancedResult;
        this.stats.regexProcessed++;
      }
    }
    
    // Second pass: process AI candidates
    if (aiCandidates.length > 0 && this.useAI) {
      console.log(`🤖 Processing ${aiCandidates.length} documents with AI`);
      
      // Process in batches to respect concurrency limits
      for (let i = 0; i < aiCandidates.length; i += this.aiBatchSize) {
        const batch = aiCandidates.slice(i, i + this.aiBatchSize);
        const batchPromises = batch.map(async ({ index, doc, result }) => {
          try {
            // Detect language for AI processing
            const aiOptions = {
              ...options,
            };
            
            const aiResult = await this.processWithAI(doc.text, doc.filePath, aiOptions);
            if (aiResult) {
              // Extract table data from the result if available
              const tableData = result.tables && result.tables.length > 0 ? {
                clientName: result.clientName,
                clientConfidence: result.clientConfidence,
                date: result.date,
                dateConfidence: result.dateConfidence,
                type: result.type,
                typeConfidence: result.docTypeConfidence,
                amount: result.amount,
                amountConfidence: result.amountConfidence,
                title: result.title,
                titleConfidence: result.titleConfidence
              } : null;
              
              results[index] = this.mergeResults(result, aiResult, tableData);
              this.stats.aiProcessed++;
            } else {
              results[index] = result;
              this.stats.regexProcessed++;
            }
          } catch (error) {
            console.warn(`AI processing failed for ${doc.filePath}:`, error.message);
            results[index] = result;
            this.stats.regexProcessed++;
          }
        });
        
        await Promise.all(batchPromises);
      }
    }
    
    // Ensure all documents have results
    for (let i = 0; i < documents.length; i++) {
      if (!results[i]) {
        // Fallback to enhanced analysis if no result
        const doc = documents[i];
        results[i] = await this.analyzeDocumentEnhanced(doc.text, doc.filePath, options);
        this.stats.regexProcessed++;
      }
    }
    
    return results;
  }

  /**
   * Update average confidence statistic
   * @param {number} confidence - New confidence value
   * @returns {number} Updated average confidence
   */
  updateAverageConfidence(confidence) {
    const total = this.stats.totalProcessed;
    if (total === 0) return 0;
    
    const current = this.stats.averageConfidence;
    const newAverage = ((current * (total - 1)) + confidence) / total;
    this.stats.averageConfidence = newAverage;
    return newAverage;
  }

  /**
   * Get processing statistics
   * @returns {Object} Processing statistics
   */
  getStats() {
    return {
      ...this.stats,
      aiEnabled: this.useAI,
      aiThreshold: this.aiConfidenceThreshold,
      aiBatchSize: this.aiBatchSize,
      cacheStats: this.aiCache ? this.aiCache.getStats() : null,
      extractionConfig: this.extractionConfig,
      telemetryEnabled: this.telemetry !== null
    };
  }

  /**
   * Get telemetry diagnostics
   * @returns {Object} Telemetry diagnostics
   */
  getTelemetryDiagnostics() {
    if (!this.telemetry) {
      return {
        enabled: false,
        error: 'Telemetry service not initialized'
      };
    }
    
    return this.telemetry.getDiagnostics();
  }

  /**
   * Get extraction configuration
   * @returns {Object} Extraction configuration
   */
  getExtractionConfig() {
    return { ...this.extractionConfig };
  }

  /**
   * Update extraction configuration
   * @param {Object} config - New extraction configuration
   */
  updateExtractionConfig(config) {
    if (config.useOCR !== undefined) {
      this.useOCR = config.useOCR;
      this.configService.set('extraction.useOCR', config.useOCR);
      
      // Reinitialize OCR service if needed
      if (this.useOCR && !this.ocrService) {
        this.ocrService = new OCRService({
          language: this.configService.get('extraction.ocrLanguage', 'eng'),
          debug: this.configService.get('debug', false),
          workerPoolSize: this.configService.get('extraction.ocrWorkerPoolSize', 2)
        });
      } else if (!this.useOCR && this.ocrService) {
        // Terminate OCR service if disabling
        this.ocrService.terminate().catch(error => {
          console.warn('Error terminating OCR service:', error.message);
        });
        this.ocrService = null;
      }
    }
    if (config.useTableExtraction !== undefined) {
      this.useTableExtraction = config.useTableExtraction;
      this.configService.set('extraction.useTableExtraction', config.useTableExtraction);
      
      // Reinitialize table extractor if needed
      if (this.useTableExtraction && !this.tableExtractor) {
        this.tableExtractor = new TableExtractorService({
          debug: this.configService.get('debug', false),
          timeout: this.configService.get('extraction.tableTimeout', 30000)
        });
      } else if (!this.useTableExtraction && this.tableExtractor) {
        this.tableExtractor = null;
      }
    }
    if (config.useLLMEnhancer !== undefined) {
      this.useLLMEnhancer = config.useLLMEnhancer;
      this.configService.set('extraction.useLLMEnhancer', config.useLLMEnhancer);
    }
    if (config.useHandwritingDetection !== undefined) {
      this.useHandwritingDetection = config.useHandwritingDetection;
      this.configService.set('extraction.useHandwritingDetection', config.useHandwritingDetection);
      
      // Reinitialize handwriting service if needed
      if (this.useHandwritingDetection && !this.handwritingService) {
        this.handwritingService = new HandwritingService({
          language: this.configService.get('extraction.handwritingLanguage', 'eng'),
          debug: this.configService.get('debug', false),
          workerPoolSize: this.configService.get('extraction.handwritingWorkerPoolSize', 1)
        });
      } else if (!this.useHandwritingDetection && this.handwritingService) {
        // Terminate handwriting service if disabling
        this.handwritingService.terminate().catch(error => {
          console.warn('Error terminating handwriting service:', error.message);
        });
        this.handwritingService = null;
      }
    }
    if (config.useWatermarkDetection !== undefined) {
      this.useWatermarkDetection = config.useWatermarkDetection;
      this.configService.set('extraction.useWatermarkDetection', config.useWatermarkDetection);
      
      // Reinitialize watermark service if needed
      if (this.useWatermarkDetection && !this.watermarkService) {
        this.watermarkService = new WatermarkService({
          debug: this.configService.get('debug', false),
          minOccurrences: this.configService.get('extraction.watermarkMinOccurrences', 3),
          pageOverlapThreshold: this.configService.get('extraction.watermarkPageOverlapThreshold', 0.5)
        });
      } else if (!this.useWatermarkDetection && this.watermarkService) {
        this.watermarkService = null;
      }
    }
    
    // Update local config object
    this.extractionConfig = this.configService.getExtractionConfig();
  }

  /**
   * Save configuration to file
   * @returns {Promise<boolean>} Success status
   */
  async saveConfig() {
    return await this.configService.save();
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalProcessed: 0,
      regexProcessed: 0,
      aiProcessed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      averageConfidence: 0
    };
  }

  /**
   * Close AI services
   * @returns {Promise<void>}
   */
  async close() {
    if (this.aiCache) {
      await this.aiCache.close();
    }
    
    if (this.ocrService) {
      await this.ocrService.terminate();
    }
  }

  /**
   * Generate basic filename from metadata (fallback method)
   * @param {Object} metadata - Document metadata
   * @param {string} fileExtension - File extension
   * @returns {string} Generated filename
   */
  generateBasicFilename(metadata, fileExtension) {
    const parts = [];
    
    // Document type
    let documentType = 'Unknown';
    if (metadata.type && metadata.type.trim()) {
      documentType = this.sanitizeComponent(metadata.type.trim());
    }
    parts.push(documentType);
    
    // Client name
    let clientName = 'UnknownClient';
    if (metadata.clientName && metadata.clientName.trim()) {
      clientName = this.sanitizeComponent(metadata.clientName.trim());
      // Truncate if too long
      if (clientName.length > 30) {
        clientName = clientName.substring(0, 30);
      }
    }
    parts.push(clientName);
    
    // Date
    if (metadata.date) {
      parts.push(metadata.date);
    } else {
      parts.push('UnknownDate');
    }
    
    // Build filename
    let filename = parts.join('_') + fileExtension;
    
    // Truncate if too long
    if (filename.length > 100) {
      const baseLength = 100 - fileExtension.length - 1;
      const truncated = parts.join('_').substring(0, baseLength);
      filename = truncated + fileExtension;
    }
    
    return filename;
  }

  /**
   * Sanitize component for filename
   * @param {string} component - Component to sanitize
   * @returns {string} Sanitized component
   */
  sanitizeComponent(component) {
    if (!component) return 'Unknown';
    
    return component
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .replace(/\b(Inc|Corp|LLC|Ltd|Incorporated|Corporation)\b/gi, '') // Remove common business suffixes
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 50); // Limit component length
  }

  /**
   * Extract pre-entities using regex and keyword analysis for AI context
   * @param {string} text - Document text
   * @returns {Object} Pre-extracted entities
   * @private
   */
  extractPreEntities(text) {
    if (!text || text.trim().length === 0) {
      return {
        docType: null,
        clientName: null,
        date: null,
        amount: null
      };
    }

    // Use parent class methods for extraction
    const docType = this.detectDocumentType(text);
    const clientName = this.extractClientName(text);
    const date = this.extractDate(text);
    const amount = this.extractAmount(text);

    return {
      docType: docType || null,
      clientName: clientName || null,
      date: date || null,
      amount: amount || null
    };
  }

  /**
   * Shutdown method for test cleanup
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      // Close AI services
      await this.close();
      
      // Close language service
      if (this.languageService) {
        await this.languageService.terminate();
      }
      
      // Close handwriting service
      if (this.handwritingService) {
        await this.handwritingService.terminate();
        this.handwritingService = null;
      }
      
      // Close watermark service
      if (this.watermarkService) {
        this.watermarkService = null;
      }
      
      // Close telemetry service
      if (this.telemetry) {
        await this.telemetry.shutdown();
        this.telemetry = null;
      }
      
      // Close canary rollout service
      if (this.canaryRolloutService) {
        await this.canaryRolloutService.shutdown();
        this.canaryRolloutService = null;
      }
      
      // Close beta user service
      if (this.betaUserService) {
        await this.betaUserService.shutdown();
        this.betaUserService = null;
      }
      
      // Close rollout monitoring service
      if (this.rolloutMonitoringService) {
        await this.rolloutMonitoringService.shutdown();
        this.rolloutMonitoringService = null;
      }
      
      // Clear any potential timers (defensive programming)
      if (this._timers) {
        this._timers.forEach(timer => clearTimeout(timer));
        this._timers = [];
      }
      
      // Reset AI service references
      this.aiTextService = null;
      this.llmClient = null;
      this.aiCache = null;
      this.promptService = null;
      this.ocrService = null;
      
      // Reset statistics
      this.stats = {
        totalProcessed: 0,
        regexProcessed: 0,
        aiProcessed: 0,
        cacheHits: 0,
        cacheMisses: 0,
        errors: 0,
        averageConfidence: 0
      };
      
      // Reset configuration
      this.useAI = false;
      
    } catch (error) {
      console.warn('Error during EnhancedParsingService shutdown:', error.message);
    }
  }
}

module.exports = EnhancedParsingService;
