const fs = require('fs').promises;
const path = require('path');

/**
 * Service for handling file renaming operations
 */
class RenamingService {
  constructor() {
    this.safeCharacters = /[^a-zA-Z0-9._-]/g;
  }

  /**
   * Generate a new filename based on metadata
   * @param {Object} metadata - Document metadata
   * @param {string} originalPath - Original file path
   * @param {boolean} preview - If true, only generate name without checking for duplicates
   * @returns {Promise<Object>} Renaming result with new name and path
   */
  async generateNewFilename(metadata, originalPath, preview = false) {
    try {
      const ext = path.extname(originalPath);
      const baseName = this.buildBaseName(metadata, ext);
      
      if (preview) {
        return {
          success: true,
          originalPath,
          newName: baseName,
          newPath: path.join(path.dirname(originalPath), baseName),
          preview: true
        };
      }

      // Check for duplicates and generate unique name
      const uniqueName = await this.ensureUniqueFilename(originalPath, baseName);
      const newPath = path.join(path.dirname(originalPath), uniqueName);

      return {
        success: true,
        originalPath,
        newName: uniqueName,
        newPath,
        preview: false
      };
    } catch (error) {
      return {
        success: false,
        originalPath,
        error: error.message,
        fallbackName: this.generateFallbackName(originalPath)
      };
    }
  }

  /**
   * Build the base filename from metadata
   * @param {Object} metadata - Document metadata
   * @param {string} ext - File extension
   * @returns {string} Base filename
   */
  buildBaseName(metadata, ext) {
    const client = this.sanitizeName(metadata.clientName || 'unknown');
    const date = metadata.date || 'unknown-date';
    const docType = this.sanitizeName(metadata.type || 'document');
    
    return `${client}_${date}_${docType}${ext}`;
  }

  /**
   * Sanitize name by removing unsafe characters
   * @param {string} name - Name to sanitize
   * @returns {string} Sanitized name
   */
  sanitizeName(name) {
    if (!name || name === 'unknown') return 'unknown';
    
    return name
      .replace(this.safeCharacters, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
  }

  /**
   * Ensure filename is unique by adding suffix if needed
   * @param {string} originalPath - Original file path
   * @param {string} baseName - Base filename
   * @returns {Promise<string>} Unique filename
   */
  async ensureUniqueFilename(originalPath, baseName) {
    const dir = path.dirname(originalPath);
    const ext = path.extname(baseName);
    const nameWithoutExt = path.basename(baseName, ext);
    
    let counter = 0;
    let uniqueName = baseName;
    
    // Check if the target file would be the same as the original
    const targetPath = path.join(dir, uniqueName);
    if (targetPath === originalPath) {
      // If it's the same file, we can use the original name
      return baseName;
    }
    
    while (await this.fileExists(path.join(dir, uniqueName))) {
      counter++;
      uniqueName = `${nameWithoutExt}-${counter}${ext}`;
    }
    
    return uniqueName;
  }

  /**
   * Check if file exists
   * @param {string} filePath - File path to check
   * @returns {Promise<boolean>} True if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate fallback name when metadata is insufficient
   * @param {string} originalPath - Original file path
   * @returns {string} Fallback filename
   */
  generateFallbackName(originalPath) {
    const ext = path.extname(originalPath);
    const baseName = path.basename(originalPath, ext);
    const timestamp = new Date().toISOString().split('T')[0];
    
    return `document_${timestamp}_${baseName}${ext}`;
  }

  /**
   * Rename a single file
   * @param {string} originalPath - Original file path
   * @param {Object} metadata - Document metadata
   * @param {boolean} preview - If true, only simulate the rename
   * @returns {Promise<Object>} Rename result
   */
  async renameFile(originalPath, metadata, preview = false) {
    try {
      const result = await this.generateNewFilename(metadata, originalPath, preview);
      
      if (!result.success) {
        return result;
      }

      if (preview) {
        return {
          ...result,
          message: 'Preview mode - no actual rename performed'
        };
      }

      // Perform actual rename
      await fs.rename(originalPath, result.newPath);
      
      return {
        ...result,
        message: `Successfully renamed to ${result.newName}`
      };
    } catch (error) {
      return {
        success: false,
        originalPath,
        error: error.message,
        fallbackName: this.generateFallbackName(originalPath)
      };
    }
  }

  /**
   * Rename multiple files
   * @param {Array} files - Array of file objects with path and metadata
   * @param {boolean} preview - If true, only simulate the renames
   * @returns {Promise<Array>} Array of rename results
   */
  async renameFiles(files, preview = false) {
    const results = [];
    
    for (const file of files) {
      const result = await this.renameFile(file.path, file.metadata, preview);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Batch rename with progress tracking
   * @param {Array} files - Array of file objects
   * @param {Function} progressCallback - Callback for progress updates
   * @param {boolean} preview - If true, only simulate the renames
   * @returns {Promise<Object>} Batch rename results
   */
  async batchRename(files, progressCallback = null, preview = false) {
    const results = {
      total: files.length,
      successful: 0,
      failed: 0,
      preview: preview,
      results: []
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const result = await this.renameFile(file.path, file.metadata, preview);
      
      results.results.push(result);
      
      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
      }

      // Call progress callback if provided
      if (progressCallback) {
        progressCallback({
          current: i + 1,
          total: files.length,
          file: file.path,
          result: result
        });
      }
    }

    return results;
  }
}

module.exports = RenamingService;
