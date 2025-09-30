const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const FileIntegrityService = require('./fileIntegrityService');

/**
 * Secure File Storage Service
 * Implements Write-Once-Read-Many (WORM) storage for client files
 * Ensures file immutability and integrity verification
 */
class SecureFileStorage {
  constructor() {
    this.storageRoot = path.join(os.homedir(), '.document-sorter', 'secure-storage');
    this.metadataFile = path.join(this.storageRoot, 'metadata.json');
    this.integrityFile = path.join(this.storageRoot, 'integrity.json');
    this.integrityService = new FileIntegrityService();
    this.initialized = false;
  }

  /**
   * Initialize secure storage directories and metadata files
   */
  async initialize() {
    try {
      // Create storage directories
      await fs.mkdir(this.storageRoot, { recursive: true });
      await fs.mkdir(path.join(this.storageRoot, 'originals'), { recursive: true });
      await fs.mkdir(path.join(this.storageRoot, 'working'), { recursive: true });
      await fs.mkdir(path.join(this.storageRoot, 'processed'), { recursive: true });

      // Initialize metadata files if they don't exist
      if (!fsSync.existsSync(this.metadataFile)) {
        await fs.writeFile(this.metadataFile, JSON.stringify({ files: {} }, null, 2));
      }

      if (!fsSync.existsSync(this.integrityFile)) {
        await fs.writeFile(this.integrityFile, JSON.stringify({ hashes: {} }, null, 2));
      }

      // Initialize integrity service
      await this.integrityService.initialize();

      this.initialized = true;
      console.log('Secure file storage initialized');
    } catch (error) {
      console.error('Failed to initialize secure file storage:', error);
      throw error;
    }
  }

  /**
   * Store a file with WORM (Write-Once-Read-Many) protection
   * @param {string} sourcePath - Original file path
   * @param {string} clientId - Client identifier
   * @param {Object} metadata - File metadata
   * @returns {Object} Storage result with file ID and paths
   */
  async storeFile(sourcePath, clientId, metadata = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Generate unique file ID
      const fileId = this.generateFileId(sourcePath, clientId);
      
      // Create client-specific directory
      const clientDir = path.join(this.storageRoot, 'originals', clientId);
      await fs.mkdir(clientDir, { recursive: true });

      // Generate secure filename
      const secureFileName = this.generateSecureFileName(sourcePath, fileId);
      const securePath = path.join(clientDir, secureFileName);

      // Check if file already exists (WORM protection)
      if (fsSync.existsSync(securePath)) {
        throw new Error(`File already exists in secure storage: ${secureFileName}`);
      }

      // Copy file to secure storage (never move original)
      await fs.copyFile(sourcePath, securePath);

      // Generate and store file integrity hashes using integrity service
      const integrityData = await this.integrityService.storeFileHash(fileId, securePath, {
        originalPath: sourcePath,
        clientId,
        ...metadata
      });

      // Store metadata
      const fileMetadata = {
        fileId,
        originalPath: sourcePath,
        securePath,
        clientId,
        fileName: path.basename(sourcePath),
        secureFileName,
        fileHash: integrityData.hashes.sha256, // Primary hash for compatibility
        multiHashes: integrityData.hashes, // All hash algorithms
        size: integrityData.size,
        uploadedAt: new Date().toISOString(),
        metadata: {
          ...metadata,
          immutable: true,
          worm: true,
          integrityVerified: true
        }
      };

      await this.updateFileMetadata(fileId, fileMetadata);
      await this.updateIntegrityHash(fileId, integrityData.hashes.sha256);

      console.log(`File stored securely: ${fileId}`);
      return {
        fileId,
        securePath,
        fileHash,
        metadata: fileMetadata
      };

    } catch (error) {
      console.error('Failed to store file securely:', error);
      throw error;
    }
  }

  /**
   * Create a working copy for processing (never modify original)
   * @param {string} fileId - File identifier
   * @param {string} clientId - Client identifier
   * @returns {Object} Working copy details
   */
  async createWorkingCopy(fileId, clientId) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const fileMetadata = await this.getFileMetadata(fileId);
      
      if (!fileMetadata) {
        throw new Error(`File not found: ${fileId}`);
      }

      if (fileMetadata.clientId !== clientId) {
        throw new Error(`Access denied: File belongs to different client`);
      }

      // Create working directory for this processing session
      const workingDir = path.join(this.storageRoot, 'working', clientId, fileId);
      await fs.mkdir(workingDir, { recursive: true });

      const workingFileName = `working_${Date.now()}_${fileMetadata.fileName}`;
      const workingPath = path.join(workingDir, workingFileName);

      // Copy from secure storage to working directory
      await fs.copyFile(fileMetadata.securePath, workingPath);

      // Verify integrity of working copy
      const workingHash = await this.generateFileHash(workingPath);
      if (workingHash !== fileMetadata.fileHash) {
        throw new Error('Working copy integrity verification failed');
      }

      console.log(`Working copy created: ${fileId}`);
      return {
        fileId,
        workingPath,
        originalPath: fileMetadata.securePath,
        fileHash: workingHash
      };

    } catch (error) {
      console.error('Failed to create working copy:', error);
      throw error;
    }
  }

  /**
   * Verify file integrity using stored hash
   * @param {string} fileId - File identifier
   * @returns {boolean} Integrity verification result
   */
  async verifyFileIntegrity(fileId) {
    try {
      const fileMetadata = await this.getFileMetadata(fileId);
      if (!fileMetadata) {
        return false;
      }

      // Use integrity service for comprehensive verification
      const verificationResult = await this.integrityService.verifyFileIntegrity(fileId, fileMetadata.securePath);
      return verificationResult.verified;

    } catch (error) {
      console.error('Failed to verify file integrity:', error);
      return false;
    }
  }

  /**
   * Get file metadata by file ID
   * @param {string} fileId - File identifier
   * @returns {Object|null} File metadata
   */
  async getFileMetadata(fileId) {
    try {
      const metadata = JSON.parse(await fs.readFile(this.metadataFile, 'utf8'));
      return metadata.files[fileId] || null;
    } catch (error) {
      console.error('Failed to get file metadata:', error);
      return null;
    }
  }

  /**
   * List files for a specific client
   * @param {string} clientId - Client identifier
   * @returns {Array} List of client files
   */
  async listClientFiles(clientId) {
    try {
      const metadata = JSON.parse(await fs.readFile(this.metadataFile, 'utf8'));
      return Object.values(metadata.files).filter(file => file.clientId === clientId);
    } catch (error) {
      console.error('Failed to list client files:', error);
      return [];
    }
  }

  /**
   * Clean up working copies (called after processing)
   * @param {string} fileId - File identifier
   * @param {string} clientId - Client identifier
   */
  async cleanupWorkingCopy(fileId, clientId) {
    try {
      const workingDir = path.join(this.storageRoot, 'working', clientId, fileId);
      if (fsSync.existsSync(workingDir)) {
        await fs.rm(workingDir, { recursive: true, force: true });
        console.log(`Working copy cleaned up: ${fileId}`);
      }
    } catch (error) {
      console.error('Failed to cleanup working copy:', error);
    }
  }

  /**
   * Generate unique file ID
   * @param {string} sourcePath - Original file path
   * @param {string} clientId - Client identifier
   * @returns {string} Unique file ID
   */
  generateFileId(sourcePath, clientId) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const fileName = path.basename(sourcePath);
    const hash = crypto.createHash('sha256')
      .update(`${clientId}_${fileName}_${timestamp}_${random}`)
      .digest('hex')
      .substring(0, 16);
    return `${clientId}_${hash}`;
  }

  /**
   * Generate secure filename
   * @param {string} sourcePath - Original file path
   * @param {string} fileId - File identifier
   * @returns {string} Secure filename
   */
  generateSecureFileName(sourcePath, fileId) {
    const ext = path.extname(sourcePath);
    const timestamp = Date.now();
    return `${fileId}_${timestamp}${ext}`;
  }

  /**
   * Generate SHA-256 hash of file
   * @param {string} filePath - File path
   * @returns {string} File hash
   */
  async generateFileHash(filePath) {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Update file metadata
   * @param {string} fileId - File identifier
   * @param {Object} metadata - File metadata
   */
  async updateFileMetadata(fileId, metadata) {
    try {
      const data = JSON.parse(await fs.readFile(this.metadataFile, 'utf8'));
      data.files[fileId] = metadata;
      await fs.writeFile(this.metadataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to update file metadata:', error);
      throw error;
    }
  }

  /**
   * Update integrity hash
   * @param {string} fileId - File identifier
   * @param {string} hash - File hash
   */
  async updateIntegrityHash(fileId, hash) {
    try {
      const data = JSON.parse(await fs.readFile(this.integrityFile, 'utf8'));
      data.hashes[fileId] = {
        hash,
        verifiedAt: new Date().toISOString()
      };
      await fs.writeFile(this.integrityFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to update integrity hash:', error);
      throw error;
    }
  }

  /**
   * Get storage statistics
   * @returns {Object} Storage statistics
   */
  async getStorageStats() {
    try {
      const metadata = JSON.parse(await fs.readFile(this.metadataFile, 'utf8'));
      const files = Object.values(metadata.files);
      
      return {
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + (file.size || 0), 0),
        clients: [...new Set(files.map(file => file.clientId))].length,
        oldestFile: files.length > 0 ? Math.min(...files.map(f => new Date(f.uploadedAt).getTime())) : null,
        newestFile: files.length > 0 ? Math.max(...files.map(f => new Date(f.uploadedAt).getTime())) : null
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return { totalFiles: 0, totalSize: 0, clients: 0 };
    }
  }

  /**
   * Verify all files integrity using integrity service
   * @returns {Object} Bulk verification results
   */
  async verifyAllFilesIntegrity() {
    return await this.integrityService.verifyAllFilesIntegrity();
  }

  /**
   * Get integrity verification statistics
   * @returns {Object} Integrity statistics
   */
  async getIntegrityStats() {
    return await this.integrityService.getVerificationStats();
  }

  /**
   * Get detailed integrity verification for a specific file
   * @param {string} fileId - File identifier
   * @returns {Object} Detailed verification result
   */
  async getDetailedIntegrityVerification(fileId) {
    const fileMetadata = await this.getFileMetadata(fileId);
    if (!fileMetadata) {
      throw new Error(`File not found: ${fileId}`);
    }

    return await this.integrityService.verifyFileIntegrity(fileId, fileMetadata.securePath);
  }
}

module.exports = SecureFileStorage;
