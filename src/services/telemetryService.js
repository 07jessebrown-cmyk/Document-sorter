const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Telemetry Service for Document Sorter AI Features
 * Tracks AI calls, latency, cache performance, and other metrics
 * 
 * This service provides comprehensive monitoring and diagnostics
 * for the AI-powered document processing features.
 */

class TelemetryService {
  constructor(options = {}) {
    this.enabled = options.enabled !== false; // Default enabled
    this.logDir = options.logDir || this.getDefaultLogDir();
    this.logFile = path.join(this.logDir, 'telemetry.json');
    this.maxLogSize = options.maxLogSize || 10 * 1024 * 1024; // 10MB
    this.retentionDays = options.retentionDays || 30;
    
    // Metrics storage
    this.metrics = {
      aiCalls: {
        total: 0,
        successful: 0,
        failed: 0,
        cached: 0,
        averageLatency: 0,
        totalLatency: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        evictions: 0,
        size: 0,
        hitRate: 0
      },
      processing: {
        totalFiles: 0,
        regexProcessed: 0,
        aiProcessed: 0,
        averageConfidence: 0,
        totalConfidence: 0,
        confidenceCount: 0
      },
      performance: {
        averageProcessingTime: 0,
        totalProcessingTime: 0,
        processingCount: 0,
        memoryUsage: 0,
        cpuUsage: 0
      },
      errors: {
        total: 0,
        byType: {},
        recent: []
      },
      session: {
        startTime: Date.now(),
        lastActivity: Date.now(),
        version: '1.1.0'
      }
    };
    
    // Real-time metrics for current session
    this.sessionMetrics = {
      startTime: Date.now(),
      aiCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      processingTime: 0,
      errors: 0
    };
    
    this.isInitialized = false;
    this.saveInterval = 60000; // Save every minute
    this.saveIntervalId = null;
  }

  /**
   * Get the default log directory based on the operating system
   * @returns {string} Default log directory path
   */
  getDefaultLogDir() {
    const homeDir = os.homedir();
    const appName = 'document-sorter';
    
    switch (process.platform) {
      case 'win32':
        return path.join(homeDir, 'AppData', 'Local', appName, 'logs');
      case 'darwin':
        return path.join(homeDir, 'Library', 'Logs', appName);
      default:
        return path.join(homeDir, '.local', 'share', appName, 'logs');
    }
  }

  /**
   * Initialize the telemetry service
   * @returns {Promise<void>}
   */
  async initialize() {
    if (!this.enabled) {
      console.log('Telemetry service disabled');
      return;
    }

    try {
      await this.ensureLogDir();
      await this.loadMetrics();
      this.isInitialized = true;
      
      // Periodic save will be set up after initialization
      this.saveIntervalId = null;
      
      console.log('Telemetry service initialized');
    } catch (error) {
      console.warn('Failed to initialize telemetry service:', error.message);
      this.isInitialized = false;
    }
  }

  /**
   * Ensure the log directory exists
   * @returns {Promise<void>}
   */
  async ensureLogDir() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create log directory: ${error.message}`);
    }
  }

  /**
   * Load metrics from disk
   * @returns {Promise<void>}
   */
  async loadMetrics() {
    try {
      const data = await fs.readFile(this.logFile, 'utf8');
      const savedMetrics = JSON.parse(data);
      
      // Merge with current metrics, preserving session data
      this.metrics = {
        ...this.metrics,
        ...savedMetrics,
        session: {
          ...this.metrics.session,
          ...savedMetrics.session
        }
      };
      
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to load telemetry metrics:', error.message);
      }
      // Initialize with default metrics if file doesn't exist
    }
  }

  /**
   * Save metrics to disk
   * @returns {Promise<void>}
   */
  async saveMetrics() {
    if (!this.enabled || !this.isInitialized) return;
    
    try {
      // Update session data
      this.metrics.session.lastActivity = Date.now();
      
      const data = JSON.stringify(this.metrics, null, 2);
      await fs.writeFile(this.logFile, data, 'utf8');
      
    } catch (error) {
      console.warn('Failed to save telemetry metrics:', error.message);
    }
  }

  /**
   * Track an AI call
   * @param {Object} callData - AI call data
   * @param {boolean} callData.success - Whether the call was successful
   * @param {number} callData.latency - Call latency in milliseconds
   * @param {boolean} callData.cached - Whether result was from cache
   * @param {string} callData.model - AI model used
   * @param {string} callData.error - Error message if failed
   */
  trackAICall(callData) {
    if (!this.enabled) return;
    
    const { success, latency, cached, model, error } = callData;
    
    this.metrics.aiCalls.total++;
    this.sessionMetrics.aiCalls++;
    
    if (success) {
      this.metrics.aiCalls.successful++;
    } else {
      this.metrics.aiCalls.failed++;
      this.trackError('ai_call_failed', error);
    }
    
    if (cached) {
      this.metrics.aiCalls.cached++;
    }
    
    // Update latency metrics
    if (latency && latency > 0) {
      this.metrics.aiCalls.totalLatency += latency;
      this.metrics.aiCalls.averageLatency = 
        this.metrics.aiCalls.totalLatency / this.metrics.aiCalls.successful;
    }
    
    // Update session metrics
    this.sessionMetrics.lastActivity = Date.now();
  }

  /**
   * Track cache performance
   * @param {Object} cacheData - Cache performance data
   * @param {boolean} cacheData.hit - Whether it was a cache hit
   * @param {number} cacheData.size - Current cache size
   * @param {boolean} cacheData.eviction - Whether an eviction occurred
   */
  trackCachePerformance(cacheData) {
    if (!this.enabled) return;
    
    const { hit, size, eviction } = cacheData;
    
    if (hit) {
      this.metrics.cache.hits++;
      this.sessionMetrics.cacheHits++;
    } else {
      this.metrics.cache.misses++;
      this.sessionMetrics.cacheMisses++;
    }
    
    if (eviction) {
      this.metrics.cache.evictions++;
    }
    
    if (size !== undefined) {
      this.metrics.cache.size = size;
    }
    
    // Calculate hit rate
    const totalRequests = this.metrics.cache.hits + this.metrics.cache.misses;
    this.metrics.cache.hitRate = totalRequests > 0 ? 
      (this.metrics.cache.hits / totalRequests) * 100 : 0;
  }

  /**
   * Track file processing
   * @param {Object} processingData - Processing data
   * @param {string} processingData.method - Processing method (regex/ai)
   * @param {number} processingData.confidence - Confidence score
   * @param {number} processingData.processingTime - Processing time in ms
   * @param {boolean} processingData.success - Whether processing was successful
   */
  trackFileProcessing(processingData) {
    if (!this.enabled) return;
    
    const { method, confidence, processingTime, success } = processingData;
    
    this.metrics.processing.totalFiles++;
    this.sessionMetrics.lastActivity = Date.now();
    
    if (method === 'regex') {
      this.metrics.processing.regexProcessed++;
    } else if (method === 'ai') {
      this.metrics.processing.aiProcessed++;
    }
    
    if (confidence !== undefined && confidence !== null) {
      this.metrics.processing.totalConfidence += confidence;
      this.metrics.processing.confidenceCount++;
      this.metrics.processing.averageConfidence = 
        this.metrics.processing.totalConfidence / this.metrics.processing.confidenceCount;
    }
    
    if (processingTime && processingTime > 0) {
      this.metrics.performance.totalProcessingTime += processingTime;
      this.metrics.performance.processingCount++;
      this.metrics.performance.averageProcessingTime = 
        this.metrics.performance.totalProcessingTime / this.metrics.performance.processingCount;
    }
    
    if (!success) {
      this.sessionMetrics.errors++;
    }
  }

  /**
   * Track an error
   * @param {string} type - Error type
   * @param {string} message - Error message
   * @param {Object} context - Additional context
   */
  trackError(type, message, context = {}) {
    if (!this.enabled) return;
    
    this.metrics.errors.total++;
    this.sessionMetrics.errors++;
    
    if (!this.metrics.errors.byType[type]) {
      this.metrics.errors.byType[type] = 0;
    }
    this.metrics.errors.byType[type]++;
    
    // Store recent errors (keep last 50)
    this.metrics.errors.recent.push({
      type,
      message,
      context,
      timestamp: Date.now()
    });
    
    if (this.metrics.errors.recent.length > 50) {
      this.metrics.errors.recent = this.metrics.errors.recent.slice(-50);
    }
  }

  /**
   * Update performance metrics
   * @param {Object} perfData - Performance data
   * @param {number} perfData.memoryUsage - Memory usage in MB
   * @param {number} perfData.cpuUsage - CPU usage percentage
   */
  updatePerformanceMetrics(perfData) {
    if (!this.enabled) return;
    
    const { memoryUsage, cpuUsage } = perfData;
    
    if (memoryUsage !== undefined) {
      this.metrics.performance.memoryUsage = memoryUsage;
    }
    
    if (cpuUsage !== undefined) {
      this.metrics.performance.cpuUsage = cpuUsage;
    }
  }

  /**
   * Get current metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      session: {
        ...this.sessionMetrics,
        duration: Date.now() - this.sessionMetrics.startTime
      }
    };
  }

  /**
   * Get diagnostics data for UI
   * @returns {Object} Diagnostics data
   */
  getDiagnostics() {
    const metrics = this.getMetrics();
    const sessionDuration = Date.now() - this.sessionMetrics.startTime;
    
    return {
      ai: {
        totalCalls: metrics.aiCalls.total,
        successfulCalls: metrics.aiCalls.successful,
        failedCalls: metrics.aiCalls.failed,
        cachedCalls: metrics.aiCalls.cached,
        averageLatency: Math.round(metrics.aiCalls.averageLatency),
        successRate: metrics.aiCalls.total > 0 ? 
          Math.round((metrics.aiCalls.successful / metrics.aiCalls.total) * 100) : 0
      },
      cache: {
        hits: metrics.cache.hits,
        misses: metrics.cache.misses,
        hitRate: Math.round(metrics.cache.hitRate * 100) / 100,
        size: metrics.cache.size,
        evictions: metrics.cache.evictions
      },
      processing: {
        totalFiles: metrics.processing.totalFiles,
        regexProcessed: metrics.processing.regexProcessed,
        aiProcessed: metrics.processing.aiProcessed,
        averageConfidence: Math.round(metrics.processing.averageConfidence * 100) / 100,
        averageProcessingTime: Math.round(metrics.performance.averageProcessingTime)
      },
      performance: {
        memoryUsage: Math.round(metrics.performance.memoryUsage * 100) / 100,
        cpuUsage: Math.round(metrics.performance.cpuUsage * 100) / 100,
        sessionDuration: Math.round(sessionDuration / 1000)
      },
      errors: {
        total: metrics.errors.total,
        byType: metrics.errors.byType,
        recent: metrics.errors.recent.slice(-10) // Last 10 errors
      },
      session: {
        startTime: new Date(this.sessionMetrics.startTime).toLocaleString(),
        lastActivity: new Date(this.sessionMetrics.lastActivity).toLocaleString(),
        duration: Math.round(sessionDuration / 1000)
      }
    };
  }

  /**
   * Get telemetry log file path
   * @returns {string} Log file path
   */
  getLogFilePath() {
    return this.logFile;
  }

  /**
   * Export telemetry data
   * @returns {Object} Exported telemetry data
   */
  exportData() {
    return {
      metrics: this.metrics,
      sessionMetrics: this.sessionMetrics,
      metadata: {
        exportedAt: new Date().toISOString(),
        version: '1.1.0',
        logDir: this.logDir,
        enabled: this.enabled
      }
    };
  }

  /**
   * Clear all telemetry data
   * @returns {Promise<void>}
   */
  async clearData() {
    this.metrics = {
      aiCalls: { total: 0, successful: 0, failed: 0, cached: 0, averageLatency: 0, totalLatency: 0 },
      cache: { hits: 0, misses: 0, evictions: 0, size: 0, hitRate: 0 },
      processing: { totalFiles: 0, regexProcessed: 0, aiProcessed: 0, averageConfidence: 0, totalConfidence: 0, confidenceCount: 0 },
      performance: { averageProcessingTime: 0, totalProcessingTime: 0, processingCount: 0, memoryUsage: 0, cpuUsage: 0 },
      errors: { total: 0, byType: {}, recent: [] },
      session: { startTime: Date.now(), lastActivity: Date.now(), version: '1.1.0' }
    };
    
    this.sessionMetrics = {
      startTime: Date.now(),
      aiCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      processingTime: 0,
      errors: 0
    };
    
    await this.saveMetrics();
  }

  /**
   * Close the telemetry service
   * @returns {Promise<void>}
   */
  async close() {
    try {
      // Clear the save interval
      if (this.saveIntervalId) {
        clearInterval(this.saveIntervalId);
        this.saveIntervalId = null;
      }
      
      // Save final metrics
      if (this.isInitialized) {
        await this.saveMetrics();
      }
      
      this.isInitialized = false;
      
    } catch (error) {
      console.warn('Error during telemetry service close:', error.message);
    }
  }

  /**
   * Shutdown method for test cleanup
   * @returns {Promise<void>}
   */
  async shutdown() {
    await this.close();
  }
}

module.exports = TelemetryService;
