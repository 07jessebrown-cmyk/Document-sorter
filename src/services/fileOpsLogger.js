const fs = require('fs');
const path = require('path');
const fsp = fs.promises;

/**
 * File Operations Logger Service
 * Handles logging of file rename, move, and sorting operations
 */
class FileOpsLogger {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(__dirname, '../../logs');
    this.logFile = path.join(this.logDir, 'fileops.log');
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
      console.error('Failed to create fileops log directory:', error);
    }
  }

  /**
   * Log file operation
   * @param {Object} data - File operation data
   * @returns {Promise<Object>} Log result
   */
  async logFileOperation(data) {
    try {
      // Validate required fields
      if (!data.oldPath || !data.newPath) {
        throw new Error('Missing required fields: oldPath and newPath');
      }

      // Create log entry with standardized schema
      const logEntry = {
        timestamp: data.timestamp || new Date().toISOString(),
        oldPath: data.oldPath,
        newPath: data.newPath,
        status: data.status || 'success', // success | failed | skipped
        source: data.source || 'manual', // ai | manual | batch
        confidence: data.confidence || null,
        documentHash: data.documentHash || null,
        documentType: data.documentType || null,
        durationMs: data.durationMs || 0,
        error: data.error || null,
        metadata: data.metadata || {},
        operation: data.operation || 'rename' // rename | move | sort
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
      await this.logInternalError('fileOpsLogger', error, data);
      
      return {
        success: false,
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Log batch file operations
   * @param {Array} dataArray - Array of file operation data
   * @returns {Promise<Object>} Batch log result
   */
  async logBatchFileOperations(dataArray) {
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
            oldPath: data.oldPath,
            newPath: data.newPath,
            status: data.status || 'success',
            source: data.source || 'batch',
            confidence: data.confidence || null,
            documentHash: data.documentHash || null,
            documentType: data.documentType || null,
            durationMs: data.durationMs || 0,
            error: data.error || null,
            metadata: data.metadata || {},
            operation: data.operation || 'rename'
          };

          logLines.push(JSON.stringify(logEntry) + '\n');
          results.push({ success: true, oldPath: data.oldPath });
        } catch (entryError) {
          results.push({ success: false, oldPath: data.oldPath, error: entryError.message });
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
      await this.logInternalError('fileOpsLogger', error, { batchSize: dataArray?.length });
      
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
      await this.logInternalError('fileOpsLogger', error, { operation: 'log_rotation' });
    }
  }

  /**
   * Get recent file operations
   * @param {number} limit - Number of recent entries to return
   * @returns {Promise<Array>} Recent log entries
   */
  async getRecentOperations(limit = 100) {
    try {
      const logContent = await fsp.readFile(this.logFile, 'utf8');
      const lines = logContent.trim().split('\n').filter(line => line.trim());
      
      const operations = lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (error) {
            return null;
          }
        })
        .filter(op => op !== null)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);

      return operations;

    } catch (error) {
      await this.logInternalError('fileOpsLogger', error, { operation: 'get_recent_operations' });
      return [];
    }
  }

  /**
   * Get file operations statistics
   * @returns {Promise<Object>} Operations statistics
   */
  async getOperationsStats() {
    try {
      const operations = await this.getRecentOperations(1000); // Get last 1000 entries
      
      const stats = {
        totalOperations: operations.length,
        successful: 0,
        failed: 0,
        skipped: 0,
        bySource: {},
        byOperation: {},
        byDocumentType: {},
        averageDuration: 0,
        errorRate: 0
      };

      if (operations.length === 0) {
        return stats;
      }

      // Count operations
      operations.forEach(op => {
        stats[op.status] = (stats[op.status] || 0) + 1;
        stats.bySource[op.source] = (stats.bySource[op.source] || 0) + 1;
        stats.byOperation[op.operation] = (stats.byOperation[op.operation] || 0) + 1;
        if (op.documentType) {
          stats.byDocumentType[op.documentType] = (stats.byDocumentType[op.documentType] || 0) + 1;
        }
      });

      // Calculate averages
      const durations = operations.filter(op => op.durationMs > 0).map(op => op.durationMs);
      stats.averageDuration = durations.length > 0 
        ? durations.reduce((a, b) => a + b, 0) / durations.length 
        : 0;

      // Calculate error rate
      stats.errorRate = operations.length > 0 ? (stats.failed / operations.length) * 100 : 0;

      return stats;

    } catch (error) {
      await this.logInternalError('fileOpsLogger', error, { operation: 'get_operations_stats' });
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
      console.error(`[${source}] File operations logging error:`, error.message, context);
    }
  }
}

module.exports = FileOpsLogger;
