const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const SecureFileStorage = require('./secureFileStorage');

/**
 * Secure File Processor
 * Enforces file copy-based processing to preserve original file integrity
 * All processing operations work on working copies, never on originals
 */
class SecureFileProcessor {
  constructor() {
    this.secureStorage = new SecureFileStorage();
    this.workingDir = path.join(os.tmpdir(), 'document-sorter-working');
    this.initialized = false;
  }

  /**
   * Initialize secure file processor
   */
  async initialize() {
    try {
      await this.secureStorage.initialize();
      
      // Create working directory
      await fs.mkdir(this.workingDir, { recursive: true });
      
      this.initialized = true;
      console.log('Secure file processor initialized');
    } catch (error) {
      console.error('Failed to initialize secure file processor:', error);
      throw error;
    }
  }

  /**
   * Process a file securely using working copies
   * @param {string} originalPath - Original file path
   * @param {string} clientId - Client identifier
   * @param {Function} processingFunction - Function to process the file
   * @param {Object} options - Processing options
   * @returns {Object} Processing result
   */
  async processFileSecurely(originalPath, clientId, processingFunction, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    let fileId = null;
    let workingCopy = null;

    try {
      console.log(`🔒 Starting secure processing: ${path.basename(originalPath)}`);

      // Step 1: Store original file in secure storage (WORM)
      const storageResult = await this.secureStorage.storeFile(
        originalPath, 
        clientId, 
        {
          originalPath,
          processingStarted: new Date().toISOString(),
          ...options.metadata
        }
      );

      fileId = storageResult.fileId;
      console.log(`📦 Original file stored securely: ${fileId}`);

      // Step 2: Create working copy for processing
      workingCopy = await this.secureStorage.createWorkingCopy(fileId, clientId);
      console.log(`📋 Working copy created: ${path.basename(workingCopy.workingPath)}`);

      // Step 3: Verify working copy integrity
      const integrityCheck = await this.secureStorage.verifyFileIntegrity(fileId);
      if (!integrityCheck) {
        throw new Error('File integrity verification failed');
      }
      console.log(`✅ File integrity verified`);

      // Step 4: Process the working copy (never the original)
      const processingResult = await this.processWorkingCopy(
        workingCopy.workingPath,
        fileId,
        clientId,
        processingFunction,
        options
      );

      // Step 5: Store processing results
      await this.storeProcessingResults(fileId, clientId, processingResult);

      console.log(`✅ Secure processing completed: ${fileId}`);
      
      return {
        success: true,
        fileId,
        originalPath,
        workingPath: workingCopy.workingPath,
        processingResult,
        integrityVerified: true
      };

    } catch (error) {
      console.error(`❌ Secure processing failed: ${error.message}`);
      
      // Cleanup on failure
      if (workingCopy) {
        await this.cleanupWorkingCopy(fileId, clientId);
      }

      throw error;
    } finally {
      // Always cleanup working copy after processing
      if (fileId && workingCopy) {
        await this.cleanupWorkingCopy(fileId, clientId);
      }
    }
  }

  /**
   * Process working copy with the provided function
   * @param {string} workingPath - Working copy path
   * @param {string} fileId - File identifier
   * @param {string} clientId - Client identifier
   * @param {Function} processingFunction - Processing function
   * @param {Object} options - Processing options
   * @returns {Object} Processing result
   */
  async processWorkingCopy(workingPath, fileId, clientId, processingFunction, options) {
    try {
      // Create a temporary processing directory
      const processingDir = path.join(this.workingDir, fileId, 'processing');
      await fs.mkdir(processingDir, { recursive: true });

      // Copy working file to processing directory
      const processingPath = path.join(processingDir, path.basename(workingPath));
      await fs.copyFile(workingPath, processingPath);

      // Execute processing function on the copy
      const result = await processingFunction(processingPath, {
        fileId,
        clientId,
        originalPath: workingPath,
        ...options
      });

      // Cleanup processing directory
      await fs.rm(processingDir, { recursive: true, force: true });

      return result;

    } catch (error) {
      console.error('Failed to process working copy:', error);
      throw error;
    }
  }

  /**
   * Store processing results securely
   * @param {string} fileId - File identifier
   * @param {string} clientId - Client identifier
   * @param {Object} processingResult - Processing results
   */
  async storeProcessingResults(fileId, clientId, processingResult) {
    try {
      const resultsDir = path.join(this.secureStorage.storageRoot, 'processed', clientId);
      await fs.mkdir(resultsDir, { recursive: true });

      const resultsFile = path.join(resultsDir, `${fileId}_results.json`);
      const resultsData = {
        fileId,
        clientId,
        processedAt: new Date().toISOString(),
        result: processingResult
      };

      await fs.writeFile(resultsFile, JSON.stringify(resultsData, null, 2));
      console.log(`📊 Processing results stored: ${fileId}`);

    } catch (error) {
      console.error('Failed to store processing results:', error);
      throw error;
    }
  }

  /**
   * Cleanup working copy
   * @param {string} fileId - File identifier
   * @param {string} clientId - Client identifier
   */
  async cleanupWorkingCopy(fileId, clientId) {
    try {
      await this.secureStorage.cleanupWorkingCopy(fileId, clientId);
      console.log(`🧹 Working copy cleaned up: ${fileId}`);
    } catch (error) {
      console.error('Failed to cleanup working copy:', error);
    }
  }

  /**
   * Get file processing history for a client
   * @param {string} clientId - Client identifier
   * @returns {Array} Processing history
   */
  async getProcessingHistory(clientId) {
    try {
      const resultsDir = path.join(this.secureStorage.storageRoot, 'processed', clientId);
      
      if (!fsSync.existsSync(resultsDir)) {
        return [];
      }

      const files = await fs.readdir(resultsDir);
      const history = [];

      for (const file of files) {
        if (file.endsWith('_results.json')) {
          const filePath = path.join(resultsDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const data = JSON.parse(content);
          history.push(data);
        }
      }

      return history.sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt));

    } catch (error) {
      console.error('Failed to get processing history:', error);
      return [];
    }
  }

  /**
   * Verify all stored files integrity
   * @returns {Object} Integrity verification results
   */
  async verifyAllFilesIntegrity() {
    try {
      const metadata = await fs.readFile(this.secureStorage.metadataFile, 'utf8');
      const data = JSON.parse(metadata);
      const files = Object.values(data.files);

      const results = {
        totalFiles: files.length,
        verifiedFiles: 0,
        failedFiles: 0,
        errors: []
      };

      for (const file of files) {
        try {
          const isValid = await this.secureStorage.verifyFileIntegrity(file.fileId);
          if (isValid) {
            results.verifiedFiles++;
          } else {
            results.failedFiles++;
            results.errors.push({
              fileId: file.fileId,
              error: 'Integrity verification failed'
            });
          }
        } catch (error) {
          results.failedFiles++;
          results.errors.push({
            fileId: file.fileId,
            error: error.message
          });
        }
      }

      return results;

    } catch (error) {
      console.error('Failed to verify all files integrity:', error);
      return { totalFiles: 0, verifiedFiles: 0, failedFiles: 0, errors: [error.message] };
    }
  }

  /**
   * Get storage statistics
   * @returns {Object} Storage statistics
   */
  async getStorageStats() {
    return await this.secureStorage.getStorageStats();
  }

  /**
   * Cleanup old working directories
   * @param {number} maxAgeHours - Maximum age in hours
   */
  async cleanupOldWorkingDirs(maxAgeHours = 24) {
    try {
      const workingDir = this.secureStorage.storageRoot + '/working';
      
      if (!fsSync.existsSync(workingDir)) {
        return;
      }

      const clients = await fs.readdir(workingDir);
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);

      for (const clientId of clients) {
        const clientDir = path.join(workingDir, clientId);
        const fileIds = await fs.readdir(clientDir);

        for (const fileId of fileIds) {
          const fileIdDir = path.join(clientDir, fileId);
          const stats = await fs.stat(fileIdDir);
          
          if (stats.mtime.getTime() < cutoffTime) {
            await fs.rm(fileIdDir, { recursive: true, force: true });
            console.log(`🧹 Cleaned up old working dir: ${fileId}`);
          }
        }
      }

    } catch (error) {
      console.error('Failed to cleanup old working directories:', error);
    }
  }
}

module.exports = SecureFileProcessor;
