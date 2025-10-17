const fs = require('fs');
const path = require('path');
const fsp = fs.promises;

/**
 * Quality Logger Service
 * Handles logging of user interactions, quality ratings, and feedback for AI suggestions
 */
class QualityLogger {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(__dirname, '../../logs');
    this.logFile = path.join(this.logDir, 'quality.log');
    this.maxFileSize = options.maxFileSize || 5 * 1024 * 1024; // 5MB
    this.maxBackups = options.maxBackups || 3;
    this.errorLogger = options.errorLogger || null;
    
    // Ensure log directory exists
    this.ensureLogDirectory();
  }

  /**
   * Ensure log directory exists
   */
  async ensureLogDirectory() {
    try {
      await fsp.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create quality log directory:', error);
    }
  }

  /**
   * Log quality feedback and user interactions
   * @param {Object} data - Quality log data
   * @returns {Promise<Object>} Log result
   */
  async logQuality(data) {
    try {
      // Validate required fields
      if (!data.timestamp || !data.action) {
        throw new Error('Missing required fields: timestamp and action');
      }

      // Create log entry with standardized schema
      const logEntry = {
        timestamp: data.timestamp || new Date().toISOString(),
        documentHash: data.documentHash || null,
        fileName: data.fileName || null,
        action: data.action, // accepted | rejected | regenerated | edited
        rating: data.rating || null, // thumbs_up | thumbs_down | null
        previousSuggestion: data.previousSuggestion || null,
        finalSuggestion: data.finalSuggestion || null,
        confidenceScore: data.confidenceScore || null,
        fileMetadata: data.fileMetadata || {},
        timing: data.timing || {},
        feedbackContext: data.feedbackContext || null,
        aiModel: data.aiModel || null,
        source: data.source || 'UI',
        status: 'logged'
      };

      // Convert to JSON line
      const logLine = JSON.stringify(logEntry) + '\n';

      // Check if log rotation is needed
      await this.rotateLogIfNeeded();

      // Append to log file asynchronously
      await fsp.appendFile(this.logFile, logLine, 'utf8');

      return {
        success: true,
        status: 'logged',
        timestamp: logEntry.timestamp
      };

    } catch (error) {
      // Log error internally but don't throw
      await this.logInternalError('qualityLogger', error, data);
      
      return {
        success: false,
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Log batch quality data (for batch operations)
   * @param {Array} dataArray - Array of quality log data
   * @returns {Promise<Object>} Batch log result
   */
  async logBatchQuality(dataArray) {
    try {
      if (!Array.isArray(dataArray) || dataArray.length === 0) {
        throw new Error('Invalid data array provided');
      }

      const results = [];
      const logLines = [];

      // Process each entry
      for (const data of dataArray) {
        try {
          const logEntry = {
            timestamp: data.timestamp || new Date().toISOString(),
            documentHash: data.documentHash || null,
            fileName: data.fileName || null,
            action: data.action,
            rating: data.rating || null,
            previousSuggestion: data.previousSuggestion || null,
            finalSuggestion: data.finalSuggestion || null,
            confidenceScore: data.confidenceScore || null,
            fileMetadata: data.fileMetadata || {},
            timing: data.timing || {},
            feedbackContext: data.feedbackContext || null,
            aiModel: data.aiModel || null,
            source: data.source || 'UI',
            status: 'logged'
          };

          logLines.push(JSON.stringify(logEntry) + '\n');
          results.push({ success: true, action: data.action });
        } catch (entryError) {
          results.push({ success: false, action: data.action, error: entryError.message });
        }
      }

      // Check if log rotation is needed
      await this.rotateLogIfNeeded();

      // Append all log lines at once
      if (logLines.length > 0) {
        await fsp.appendFile(this.logFile, logLines.join(''), 'utf8');
      }

      return {
        success: true,
        status: 'batch_logged',
        processed: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      };

    } catch (error) {
      await this.logInternalError('qualityLogger', error, { batchSize: dataArray?.length });
      
      return {
        success: false,
        status: 'batch_failed',
        error: error.message
      };
    }
  }

  /**
   * Check if log rotation is needed and perform it
   */
  async rotateLogIfNeeded() {
    try {
      const stats = await fsp.stat(this.logFile).catch(() => null);
      
      if (!stats || stats.size < this.maxFileSize) {
        return; // No rotation needed
      }

      // Rotate existing backups
      for (let i = this.maxBackups - 1; i > 0; i--) {
        const oldFile = `${this.logFile}.${i}`;
        const newFile = `${this.logFile}.${i + 1}`;
        
        try {
          await fsp.rename(oldFile, newFile);
        } catch (error) {
          // Ignore if file doesn't exist
        }
      }

      // Move current log to .1
      await fsp.rename(this.logFile, `${this.logFile}.1`);

    } catch (error) {
      await this.logInternalError('qualityLogger', error, { operation: 'log_rotation' });
    }
  }

  /**
   * Get recent quality logs
   * @param {number} limit - Number of recent entries to return
   * @returns {Promise<Array>} Recent log entries
   */
  async getRecentLogs(limit = 100) {
    try {
      const logContent = await fsp.readFile(this.logFile, 'utf8');
      const lines = logContent.trim().split('\n').filter(line => line.trim());
      
      const logs = lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (error) {
            return null;
          }
        })
        .filter(log => log !== null)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);

      return logs;

    } catch (error) {
      await this.logInternalError('qualityLogger', error, { operation: 'get_recent_logs' });
      return [];
    }
  }

  /**
   * Get quality statistics
   * @returns {Promise<Object>} Quality statistics
   */
  async getQualityStats() {
    try {
      const logs = await this.getRecentLogs(1000); // Get last 1000 entries
      
      const stats = {
        totalEntries: logs.length,
        actions: {},
        ratings: {},
        averageConfidence: 0,
        averageTimeToDecision: 0,
        regenerationRate: 0,
        acceptanceRate: 0
      };

      if (logs.length === 0) {
        return stats;
      }

      // Count actions
      logs.forEach(log => {
        stats.actions[log.action] = (stats.actions[log.action] || 0) + 1;
        if (log.rating) {
          stats.ratings[log.rating] = (stats.ratings[log.rating] || 0) + 1;
        }
      });

      // Calculate averages
      const confidenceScores = logs.filter(log => log.confidenceScore).map(log => log.confidenceScore);
      const timeToDecisions = logs.filter(log => log.timing?.timeToDecisionMs).map(log => log.timing.timeToDecisionMs);

      stats.averageConfidence = confidenceScores.length > 0 
        ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length 
        : 0;

      stats.averageTimeToDecision = timeToDecisions.length > 0 
        ? timeToDecisions.reduce((a, b) => a + b, 0) / timeToDecisions.length 
        : 0;

      // Calculate rates
      const totalActions = logs.length;
      const regenerations = stats.actions.regenerated || 0;
      const acceptances = stats.actions.accepted || 0;

      stats.regenerationRate = totalActions > 0 ? (regenerations / totalActions) * 100 : 0;
      stats.acceptanceRate = totalActions > 0 ? (acceptances / totalActions) * 100 : 0;

      return stats;

    } catch (error) {
      await this.logInternalError('qualityLogger', error, { operation: 'get_quality_stats' });
      return { error: 'Failed to calculate statistics' };
    }
  }

  /**
   * Log internal errors to error logger
   * @param {string} source - Error source
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   */
  async logInternalError(source, error, context = {}) {
    if (this.errorLogger) {
      try {
        await this.errorLogger.logError(`[${source}] ${error.message}`, {
          context: context,
          stack: error.stack
        });
      } catch (logError) {
        console.error('Failed to log internal error:', logError);
      }
    } else {
      console.error(`[${source}] Quality logging error:`, error.message, context);
    }
  }
}

module.exports = QualityLogger;