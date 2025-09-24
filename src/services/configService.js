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
    this.configPath = path.join(__dirname, '../../config/default.json');
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
        model: "gpt-3.5-turbo",
        confidenceThreshold: 0.5,
        batchSize: 5,
        maxRetries: 3,
        retryDelay: 1000,
        maxDelay: 10000,
        timeout: 30000
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
        ocrLanguage: 'eng',
        ocrWorkerPoolSize: 2,
        tableTimeout: 30000,
        handwritingLanguage: 'eng',
        handwritingWorkerPoolSize: 1
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
      model: this.get('ai.model', 'gpt-3.5-turbo'),
      confidenceThreshold: this.get('ai.confidenceThreshold', 0.5),
      batchSize: this.get('ai.batchSize', 5),
      maxRetries: this.get('ai.maxRetries', 3),
      retryDelay: this.get('ai.retryDelay', 1000),
      maxDelay: this.get('ai.maxDelay', 10000),
      timeout: this.get('ai.timeout', 30000)
    };
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
