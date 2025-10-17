const fs = require('fs');
const path = require('path');

/**
 * Configuration Service
 * 
 * Handles loading and managing application configuration from config files.
 * Provides a centralized way to access configuration values throughout the application.
 */
class ConfigService {
  constructor() {
    this.config = null;
    // Use CI config in CI environment, otherwise use default
    const configFile = process.env.CI === 'true' ? 'ci.json' : 'default.json';
    this.configPath = path.join(__dirname, '../../config', configFile);
    this.loadConfig();
  }

  /**
   * Load configuration from file
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(configData);
        console.log('✅ Configuration loaded successfully');
      } else {
        console.warn('⚠️ Config file not found, using defaults');
        this.config = this.getDefaultConfig();
      }
    } catch (error) {
      console.error('❌ Error loading configuration:', error.message);
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * Get default configuration
   * @returns {Object} Default configuration object
   */
  getDefaultConfig() {
    return {
      ai: {
        enabled: false,
        confidenceThreshold: 0.5,
        batchSize: 5,
        maxRetries: 3,
        retryDelay: 1000,
        maxDelay: 10000,
        timeout: 30000,
        filenameGeneration: {
          model: "gpt-4-turbo",
          temperature: 0.5,
          maxTokens: 300,
          timeout: 30000
        },
        metadataExtraction: {
          model: "gpt-4-turbo", 
          temperature: 0.25,
          maxTokens: 250,
          timeout: 30000
        },
        qualityLogging: {
          enabled: true,
          logLevel: "info",
          logRequestResponse: true,
          logPerformance: true,
          maxResponseLength: 500
        }
      },
      cache: {
        enabled: true,
        maxSize: 1000,
        maxAge: 604800000,
        compressionEnabled: true
      },
      ui: {
        showAIToggle: true,
        showConfidenceBadges: true,
        showSourceLabels: true,
        highlightLowConfidence: true,
        lowConfidenceThreshold: 0.5
      },
      processing: {
        enableAIFallback: true,
        aiFallbackThreshold: 0.3,
        concurrentProcessing: true,
        maxConcurrentFiles: 5
      },
    extraction: {
      useOCR: false,
      useTableExtraction: false,
      useLLMEnhancer: true,
      useHandwritingDetection: false,
      useWatermarkDetection: false,
      ocrLanguage: 'eng',
      ocrWorkerPoolSize: 2,
      tableTimeout: 30000,
      handwritingLanguage: 'eng',
      handwritingWorkerPoolSize: 1,
      watermarkMinOccurrences: 3,
      watermarkPageOverlapThreshold: 0.5
    },
      telemetry: {
        enabled: true,
        logLevel: "info",
        trackAICalls: true,
        trackCacheStats: true,
        trackPerformance: true,
        retentionDays: 30,
        maxLogSize: 10485760,
        saveInterval: 60000
      }
    };
  }

  /**
   * Get a configuration value by key path
   * @param {string} keyPath - Dot-separated path to the config value (e.g., 'ai.enabled')
   * @param {*} defaultValue - Default value if key not found
   * @returns {*} Configuration value or default
   */
  get(keyPath, defaultValue = null) {
    if (!this.config) {
      return defaultValue;
    }

    const keys = keyPath.split('.');
    let value = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * Set a configuration value by key path
   * @param {string} keyPath - Dot-separated path to the config value
   * @param {*} value - Value to set
   */
  set(keyPath, value) {
    if (!this.config) {
      this.config = this.getDefaultConfig();
    }

    const keys = keyPath.split('.');
    let current = this.config;

    // Navigate to the parent of the target key
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    // Set the final value
    current[keys[keys.length - 1]] = value;
  }

  /**
   * Save configuration to file
   * @returns {Promise<boolean>} Success status
   */
  async save() {
    try {
      if (!this.config) {
        throw new Error('No configuration to save');
      }

      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Write configuration file
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      console.log('✅ Configuration saved successfully');
      return true;
    } catch (error) {
      console.error('❌ Error saving configuration:', error.message);
      return false;
    }
  }

  /**
   * Get all configuration
   * @returns {Object} Complete configuration object
   */
  getAll() {
    return this.config || this.getDefaultConfig();
  }

  /**
   * Reload configuration from file
   */
  reload() {
    this.loadConfig();
  }

  /**
   * Get extraction feature flags
   * @returns {Object} Extraction configuration
   */
  getExtractionConfig() {
    return {
      useOCR: this.get('extraction.useOCR', false),
      useTableExtraction: this.get('extraction.useTableExtraction', false),
      useLLMEnhancer: this.get('extraction.useLLMEnhancer', true)
    };
  }

  /**
   * Get AI configuration
   * @returns {Object} AI configuration
   */
  getAIConfig() {
    return {
      enabled: this.get('ai.enabled', false),
      confidenceThreshold: this.get('ai.confidenceThreshold', 0.5),
      batchSize: this.get('ai.batchSize', 5),
      maxRetries: this.get('ai.maxRetries', 3),
      retryDelay: this.get('ai.retryDelay', 1000),
      maxDelay: this.get('ai.maxDelay', 10000),
      timeout: this.get('ai.timeout', 30000)
    };
  }

  /**
   * Get filename generation AI configuration
   * @returns {Object} Filename generation AI configuration
   */
  getFilenameGenerationConfig() {
    return {
      model: this.get('ai.filenameGeneration.model', 'gpt-4-turbo'),
      temperature: this.get('ai.filenameGeneration.temperature', 0.5),
      maxTokens: this.get('ai.filenameGeneration.maxTokens', 300),
      timeout: this.get('ai.filenameGeneration.timeout', 30000)
    };
  }

  /**
   * Get metadata extraction AI configuration
   * @returns {Object} Metadata extraction AI configuration
   */
  getMetadataExtractionConfig() {
    return {
      model: this.get('ai.metadataExtraction.model', 'gpt-4-turbo'),
      temperature: this.get('ai.metadataExtraction.temperature', 0.25),
      maxTokens: this.get('ai.metadataExtraction.maxTokens', 250),
      timeout: this.get('ai.metadataExtraction.timeout', 30000)
    };
  }

  /**
   * Get quality logging configuration
   * @returns {Object} Quality logging configuration
   */
  getQualityLoggingConfig() {
    return {
      enabled: this.get('ai.qualityLogging.enabled', true),
      logLevel: this.get('ai.qualityLogging.logLevel', 'info'),
      logRequestResponse: this.get('ai.qualityLogging.logRequestResponse', true),
      logPerformance: this.get('ai.qualityLogging.logPerformance', true),
      maxResponseLength: this.get('ai.qualityLogging.maxResponseLength', 500)
    };
  }

  /**
   * Get context enhancement configuration
   * @returns {Object} Context enhancement configuration
   */
  getContextEnhancementConfig() {
    return {
      maxTextLength: this.get('ai.contextEnhancement.maxTextLength', 6000),
      includeFileMetadata: this.get('ai.contextEnhancement.includeFileMetadata', true),
      includePreExtractedEntities: this.get('ai.contextEnhancement.includePreExtractedEntities', true),
      metadataFields: this.get('ai.contextEnhancement.metadataFields', ['created', 'modified', 'size', 'name', 'mimeType']),
      entityFields: this.get('ai.contextEnhancement.entityFields', ['docType', 'clientName', 'date', 'amount'])
    };
  }

  /**
   * Get prompt versioning configuration
   * @returns {Object} Prompt versioning configuration
   */
  getPromptVersioningConfig() {
    return {
      filenameGeneration: this.get('ai.promptVersioning.filenameGeneration', {
        version: 'v1.6.1',
        templatePath: 'prompts/filename_v1.6.1.txt',
        description: 'Enhanced filename generation with context improvements',
        created: '2025-10-17',
        parameters: {
          model: 'gpt-4-turbo',
          temperature: 0.5,
          maxTokens: 300
        }
      }),
      metadataExtraction: this.get('ai.promptVersioning.metadataExtraction', {
        version: 'v1.6.1',
        templatePath: 'prompts/metadata_v1.6.1.txt',
        description: 'Enhanced metadata extraction with context improvements',
        created: '2025-10-17',
        parameters: {
          model: 'gpt-4-turbo',
          temperature: 0.25,
          maxTokens: 250
        }
      })
    };
  }

  /**
   * Get current prompt version for a specific type
   * @param {string} type - Prompt type ('filenameGeneration' or 'metadataExtraction')
   * @returns {Object} Current prompt version info
   */
  getCurrentPromptVersion(type) {
    const versioning = this.getPromptVersioningConfig();
    return versioning[type] || null;
  }

  /**
   * Update prompt version
   * @param {string} type - Prompt type
   * @param {Object} versionInfo - New version information
   */
  updatePromptVersion(type, versionInfo) {
    const currentConfig = this.config;
    if (!currentConfig.ai) currentConfig.ai = {};
    if (!currentConfig.ai.promptVersioning) currentConfig.ai.promptVersioning = {};
    if (!currentConfig.ai.promptVersioning[type]) currentConfig.ai.promptVersioning[type] = {};
    
    currentConfig.ai.promptVersioning[type] = {
      ...currentConfig.ai.promptVersioning[type],
      ...versionInfo,
      updated: new Date().toISOString()
    };
    
    this.saveConfig();
  }

  /**
   * Get processing configuration
   * @returns {Object} Processing configuration
   */
  getProcessingConfig() {
    return {
      enableAIFallback: this.get('processing.enableAIFallback', true),
      aiFallbackThreshold: this.get('processing.aiFallbackThreshold', 0.3),
      concurrentProcessing: this.get('processing.concurrentProcessing', true),
      maxConcurrentFiles: this.get('processing.maxConcurrentFiles', 5)
    };
  }
}

module.exports = ConfigService;
