const crypto = require('crypto');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

/**
 * File Integrity Verification Service
 * Provides cryptographic hash generation, verification, and tamper detection
 * Implements SHA-256 hashing with integrity monitoring
 */
class FileIntegrityService {
  constructor() {
    this.integrityDir = path.join(os.homedir(), '.document-sorter', 'integrity');
    this.hashesFile = path.join(this.integrityDir, 'hashes.json');
    this.verificationLogFile = path.join(this.integrityDir, 'verification.log');
    this.initialized = false;
  }

  /**
   * Initialize integrity service
   */
  async initialize() {
    try {
      // Create integrity directory
      await fs.mkdir(this.integrityDir, { recursive: true });

      // Initialize hashes file if it doesn't exist
      if (!fsSync.existsSync(this.hashesFile)) {
        await fs.writeFile(this.hashesFile, JSON.stringify({ files: {} }, null, 2));
      }

      // Initialize verification log if it doesn't exist
      if (!fsSync.existsSync(this.verificationLogFile)) {
        await fs.writeFile(this.verificationLogFile, '');
      }

      this.initialized = true;
      console.log('File integrity service initialized');
    } catch (error) {
      console.error('Failed to initialize file integrity service:', error);
      throw error;
    }
  }

  /**
   * Generate SHA-256 hash for a file
   * @param {string} filePath - Path to the file
   * @returns {Promise<string>} SHA-256 hash
   */
  async generateFileHash(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } catch (error) {
      console.error(`Failed to generate hash for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Generate multiple hash algorithms for enhanced security
   * @param {string} filePath - Path to the file
   * @returns {Promise<Object>} Multiple hashes
   */
  async generateMultiHash(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      
      return {
        sha256: crypto.createHash('sha256').update(fileBuffer).digest('hex'),
        sha512: crypto.createHash('sha512').update(fileBuffer).digest('hex'),
        blake2b256: crypto.createHash('blake2b256').update(fileBuffer).digest('hex'),
        md5: crypto.createHash('md5').update(fileBuffer).digest('hex')
      };
    } catch (error) {
      console.error(`Failed to generate multi-hash for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Store file hash with metadata
   * @param {string} fileId - Unique file identifier
   * @param {string} filePath - Path to the file
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Stored hash information
   */
  async storeFileHash(fileId, filePath, metadata = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Generate hashes
      const hashes = await this.generateMultiHash(filePath);
      const fileStats = await fs.stat(filePath);

      const hashData = {
        fileId,
        filePath,
        hashes,
        size: fileStats.size,
        createdAt: new Date().toISOString(),
        lastVerified: new Date().toISOString(),
        metadata: {
          ...metadata,
          algorithm: 'multi-hash',
          version: '1.0'
        }
      };

      // Load existing hashes
      const existingData = JSON.parse(await fs.readFile(this.hashesFile, 'utf8'));
      
      // Check if file already exists (WORM protection)
      if (existingData.files[fileId]) {
        throw new Error(`File hash already exists for ${fileId} - WORM protection active`);
      }

      // Store new hash
      existingData.files[fileId] = hashData;
      await fs.writeFile(this.hashesFile, JSON.stringify(existingData, null, 2));

      // Log the storage
      await this.logVerification('STORE', fileId, filePath, 'Hash stored successfully');

      console.log(`File hash stored: ${fileId}`);
      return hashData;

    } catch (error) {
      console.error(`Failed to store file hash for ${fileId}:`, error);
      throw error;
    }
  }

  /**
   * Verify file integrity against stored hash
   * @param {string} fileId - File identifier
   * @param {string} filePath - Path to the file to verify
   * @returns {Promise<Object>} Verification result
   */
  async verifyFileIntegrity(fileId, filePath) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Load stored hash data
      const existingData = JSON.parse(await fs.readFile(this.hashesFile, 'utf8'));
      const storedHashData = existingData.files[fileId];

      if (!storedHashData) {
        throw new Error(`No stored hash found for file ${fileId}`);
      }

      // Generate current hashes
      const currentHashes = await this.generateMultiHash(filePath);
      const currentStats = await fs.stat(filePath);

      // Compare hashes
      const verificationResult = {
        fileId,
        filePath,
        verified: true,
        timestamp: new Date().toISOString(),
        results: {},
        errors: []
      };

      // Verify each hash algorithm
      for (const [algorithm, storedHash] of Object.entries(storedHashData.hashes)) {
        const currentHash = currentHashes[algorithm];
        const matches = storedHash === currentHash;
        
        verificationResult.results[algorithm] = {
          matches,
          stored: storedHash,
          current: currentHash
        };

        if (!matches) {
          verificationResult.verified = false;
          verificationResult.errors.push(`${algorithm} hash mismatch`);
        }
      }

      // Verify file size
      if (storedHashData.size !== currentStats.size) {
        verificationResult.verified = false;
        verificationResult.errors.push('File size mismatch');
        verificationResult.results.size = {
          matches: false,
          stored: storedHashData.size,
          current: currentStats.size
        };
      } else {
        verificationResult.results.size = {
          matches: true,
          stored: storedHashData.size,
          current: currentStats.size
        };
      }

      // Update last verified timestamp
      if (verificationResult.verified) {
        storedHashData.lastVerified = new Date().toISOString();
        existingData.files[fileId] = storedHashData;
        await fs.writeFile(this.hashesFile, JSON.stringify(existingData, null, 2));
      }

      // Log verification result
      const logMessage = verificationResult.verified 
        ? 'File integrity verified successfully'
        : `File integrity verification failed: ${verificationResult.errors.join(', ')}`;
      
      await this.logVerification('VERIFY', fileId, filePath, logMessage, verificationResult.verified);

      console.log(`File integrity ${verificationResult.verified ? 'verified' : 'failed'}: ${fileId}`);
      return verificationResult;

    } catch (error) {
      console.error(`Failed to verify file integrity for ${fileId}:`, error);
      await this.logVerification('ERROR', fileId, filePath, `Verification error: ${error.message}`, false);
      throw error;
    }
  }

  /**
   * Verify all stored files integrity
   * @returns {Promise<Object>} Bulk verification results
   */
  async verifyAllFilesIntegrity() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const existingData = JSON.parse(await fs.readFile(this.hashesFile, 'utf8'));
      const files = Object.values(existingData.files);

      const results = {
        totalFiles: files.length,
        verifiedFiles: 0,
        failedFiles: 0,
        errors: [],
        startTime: new Date().toISOString(),
        endTime: null
      };

      console.log(`Starting bulk integrity verification for ${files.length} files`);

      for (const file of files) {
        try {
          // Check if file still exists
          if (!fsSync.existsSync(file.filePath)) {
            results.failedFiles++;
            results.errors.push({
              fileId: file.fileId,
              error: 'File not found',
              filePath: file.filePath
            });
            continue;
          }

          const verification = await this.verifyFileIntegrity(file.fileId, file.filePath);
          
          if (verification.verified) {
            results.verifiedFiles++;
          } else {
            results.failedFiles++;
            results.errors.push({
              fileId: file.fileId,
              error: 'Integrity verification failed',
              details: verification.errors
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

      results.endTime = new Date().toISOString();
      
      // Log bulk verification results
      await this.logVerification('BULK_VERIFY', 'ALL', 'ALL', 
        `Bulk verification completed: ${results.verifiedFiles}/${results.totalFiles} files verified`);

      console.log(`Bulk integrity verification completed: ${results.verifiedFiles}/${results.totalFiles} files verified`);
      return results;

    } catch (error) {
      console.error('Failed to verify all files integrity:', error);
      throw error;
    }
  }

  /**
   * Get file hash information
   * @param {string} fileId - File identifier
   * @returns {Promise<Object|null>} Hash information
   */
  async getFileHashInfo(fileId) {
    try {
      const existingData = JSON.parse(await fs.readFile(this.hashesFile, 'utf8'));
      return existingData.files[fileId] || null;
    } catch (error) {
      console.error(`Failed to get file hash info for ${fileId}:`, error);
      return null;
    }
  }

  /**
   * List all files with their hash information
   * @returns {Promise<Array>} List of files with hash info
   */
  async listAllFiles() {
    try {
      const existingData = JSON.parse(await fs.readFile(this.hashesFile, 'utf8'));
      return Object.values(existingData.files);
    } catch (error) {
      console.error('Failed to list all files:', error);
      return [];
    }
  }

  /**
   * Log verification events
   * @param {string} action - Action performed
   * @param {string} fileId - File identifier
   * @param {string} filePath - File path
   * @param {string} message - Log message
   * @param {boolean} success - Whether the action was successful
   */
  async logVerification(action, fileId, filePath, message, success = true) {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        action,
        fileId,
        filePath: path.basename(filePath),
        success,
        message
      };

      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(this.verificationLogFile, logLine);

    } catch (error) {
      console.error('Failed to log verification event:', error);
    }
  }

  /**
   * Get verification statistics
   * @returns {Promise<Object>} Verification statistics
   */
  async getVerificationStats() {
    try {
      const files = await this.listAllFiles();
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const recentVerifications = files.filter(file => 
        new Date(file.lastVerified) > oneDayAgo
      );

      const weeklyVerifications = files.filter(file => 
        new Date(file.lastVerified) > oneWeekAgo
      );

      return {
        totalFiles: files.length,
        verifiedToday: recentVerifications.length,
        verifiedThisWeek: weeklyVerifications.length,
        oldestVerification: files.length > 0 
          ? Math.min(...files.map(f => new Date(f.lastVerified).getTime()))
          : null,
        newestVerification: files.length > 0 
          ? Math.max(...files.map(f => new Date(f.lastVerified).getTime()))
          : null
      };

    } catch (error) {
      console.error('Failed to get verification stats:', error);
      return { totalFiles: 0, verifiedToday: 0, verifiedThisWeek: 0 };
    }
  }

  /**
   * Clean up old verification logs
   * @param {number} maxAgeDays - Maximum age in days
   */
  async cleanupOldLogs(maxAgeDays = 30) {
    try {
      const logContent = await fs.readFile(this.verificationLogFile, 'utf8');
      const lines = logContent.split('\n').filter(line => line.trim());
      
      const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
      const recentLines = lines.filter(line => {
        try {
          const entry = JSON.parse(line);
          return new Date(entry.timestamp).getTime() > cutoffTime;
        } catch {
          return false;
        }
      });

      await fs.writeFile(this.verificationLogFile, recentLines.join('\n') + '\n');
      console.log(`Cleaned up verification logs older than ${maxAgeDays} days`);

    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }
}

module.exports = FileIntegrityService;
