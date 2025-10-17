const fs = require('fs');
const path = require('path');
const fsp = fs.promises;

/**
 * File Operations Helper Functions
 * Provides utilities for filename validation, conflict resolution, and directory management
 */
class FileOpsHelpers {
  /**
   * Validate and sanitize filename
   * @param {string} filename - Original filename
   * @returns {Object} Validation result with sanitized filename
   */
  static validateFilename(filename) {
    if (!filename || typeof filename !== 'string') {
      return {
        valid: false,
        sanitized: null,
        error: 'Invalid filename: must be a non-empty string'
      };
    }

    // Remove invalid characters for Windows/Unix compatibility
    const invalidChars = /[\/\\:*?"<>|]/g;
    let sanitized = filename.replace(invalidChars, '_');

    // Remove leading/trailing dots and spaces
    sanitized = sanitized.replace(/^[.\s]+|[.\s]+$/g, '');

    // Ensure filename is not empty after sanitization
    if (!sanitized || sanitized.trim().length === 0) {
      return {
        valid: false,
        sanitized: null,
        error: 'Filename is empty after sanitization'
      };
    }

    // Check length (Windows limit is 255 characters)
    if (sanitized.length > 255) {
      const ext = path.extname(sanitized);
      const nameWithoutExt = sanitized.substring(0, 255 - ext.length);
      sanitized = nameWithoutExt + ext;
    }

    // Check for reserved names (Windows)
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    const nameWithoutExt = path.basename(sanitized, path.extname(sanitized));
    
    if (reservedNames.includes(nameWithoutExt.toUpperCase())) {
      sanitized = sanitized + '_';
    }

    return {
      valid: true,
      sanitized: sanitized,
      original: filename,
      changes: filename !== sanitized
    };
  }

  /**
   * Get unique filename by auto-incrementing if conflict exists
   * @param {string} targetDir - Target directory path
   * @param {string} baseName - Base filename
   * @returns {Promise<string>} Unique filename
   */
  static async getUniqueFilename(targetDir, baseName) {
    try {
      const ext = path.extname(baseName);
      const nameWithoutExt = path.basename(baseName, ext);
      
      let counter = 1;
      let uniqueName = baseName;
      
      while (true) {
        const fullPath = path.join(targetDir, uniqueName);
        
        try {
          await fsp.access(fullPath);
          // File exists, try next number
          counter++;
          uniqueName = `${nameWithoutExt}_${counter}${ext}`;
        } catch (error) {
          // File doesn't exist, we can use this name
          break;
        }
      }
      
      return uniqueName;
    } catch (error) {
      throw new Error(`Failed to generate unique filename: ${error.message}`);
    }
  }

  /**
   * Get sorting directory based on document type
   * @param {string} baseDir - Base directory for sorting
   * @param {string} documentType - Document type (e.g., 'Invoice', 'Contract')
   * @returns {string} Sorting directory path
   */
  static getSortingDirectory(baseDir, documentType) {
    if (!documentType || typeof documentType !== 'string') {
      return path.join(baseDir, 'Uncategorized');
    }

    // Sanitize document type for directory name
    const sanitizedType = documentType
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');

    return path.join(baseDir, sanitizedType);
  }

  /**
   * Ensure directory exists
   * @param {string} dirPath - Directory path
   * @returns {Promise<void>}
   */
  static async ensureDirectoryExists(dirPath) {
    try {
      await fsp.mkdir(dirPath, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Check file permissions
   * @param {string} filePath - File path
   * @param {string} mode - Permission mode ('r', 'w', 'rw')
   * @returns {Promise<boolean>} True if file has required permissions
   */
  static async checkFilePermissions(filePath, mode = 'rw') {
    try {
      await fsp.access(filePath, mode);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file hash for tracking
   * @param {string} filePath - File path
   * @returns {Promise<string>} File hash
   */
  static async getFileHash(filePath) {
    try {
      const crypto = require('crypto');
      const fileBuffer = await fsp.readFile(filePath);
      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      return hashSum.digest('hex');
    } catch (error) {
      throw new Error(`Failed to calculate file hash: ${error.message}`);
    }
  }

  /**
   * Validate file operation parameters
   * @param {Object} params - Operation parameters
   * @returns {Object} Validation result
   */
  static validateOperationParams(params) {
    const { oldPath, newName, source, metadata } = params;

    if (!oldPath || typeof oldPath !== 'string') {
      return {
        valid: false,
        error: 'Invalid oldPath: must be a non-empty string'
      };
    }

    if (!newName || typeof newName !== 'string') {
      return {
        valid: false,
        error: 'Invalid newName: must be a non-empty string'
      };
    }

    if (source && !['ai', 'manual', 'batch'].includes(source)) {
      return {
        valid: false,
        error: 'Invalid source: must be "ai", "manual", or "batch"'
      };
    }

    return {
      valid: true,
      error: null
    };
  }

  /**
   * Format file size for logging
   * @param {number} sizeBytes - Size in bytes
   * @returns {string} Formatted size string
   */
  static formatFileSize(sizeBytes) {
    if (sizeBytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(sizeBytes) / Math.log(k));
    
    return parseFloat((sizeBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get file metadata for logging
   * @param {string} filePath - File path
   * @returns {Promise<Object>} File metadata
   */
  static async getFileMetadata(filePath) {
    try {
      const stats = await fsp.stat(filePath);
      return {
        sizeBytes: stats.size,
        sizeFormatted: this.formatFileSize(stats.size),
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory()
      };
    } catch (error) {
      return {
        sizeBytes: 0,
        sizeFormatted: '0 B',
        created: null,
        modified: null,
        isFile: false,
        isDirectory: false,
        error: error.message
      };
    }
  }
}

module.exports = FileOpsHelpers;
