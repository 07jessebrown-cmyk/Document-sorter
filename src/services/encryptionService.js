/**
 * Encryption Service for Files at Rest
 * Implements AES-256 encryption for all stored files with key management
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class EncryptionService {
    constructor(options = {}) {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16; // 128 bits
        this.tagLength = 16; // 128 bits
        this.keyDerivationIterations = 100000;
        this.keyStoragePath = options.keyStoragePath || '/var/lib/document-sorter/keys';
        this.encryptedStoragePath = options.encryptedStoragePath || '/var/lib/document-sorter/encrypted';
        this.masterKey = null;
        this.keyCache = new Map();
        this.auditLogger = null;
        this.isInitialized = false;
    }

    /**
     * Set audit logger reference
     */
    setAuditLogger(auditLogger) {
        this.auditLogger = auditLogger;
    }

    /**
     * Initialize encryption service
     */
    async initialize() {
        try {
            // Create key storage directory
            await fs.mkdir(this.keyStoragePath, { recursive: true });
            await fs.mkdir(this.encryptedStoragePath, { recursive: true });

            // Set secure permissions
            await this.setSecurePermissions(this.keyStoragePath, 700);
            await this.setSecurePermissions(this.encryptedStoragePath, 750);

            // Load or generate master key
            await this.loadOrGenerateMasterKey();

            this.isInitialized = true;

            if (this.auditLogger) {
                await this.auditLogger.logSystemEvent('encryption_service_initialized', {
                    keyStoragePath: this.keyStoragePath,
                    encryptedStoragePath: this.encryptedStoragePath
                });
            }

            return { success: true };
        } catch (error) {
            console.error('Failed to initialize encryption service:', error);
            throw error;
        }
    }

    /**
     * Load or generate master key
     */
    async loadOrGenerateMasterKey() {
        const masterKeyPath = path.join(this.keyStoragePath, 'master.key');
        
        try {
            // Try to load existing master key
            const encryptedMasterKey = await fs.readFile(masterKeyPath);
            this.masterKey = await this.decryptMasterKey(encryptedMasterKey);
        } catch (error) {
            // Generate new master key if none exists
            console.log('Generating new master key...');
            this.masterKey = crypto.randomBytes(this.keyLength);
            const encryptedMasterKey = await this.encryptMasterKey(this.masterKey);
            await fs.writeFile(masterKeyPath, encryptedMasterKey);
            await this.setSecurePermissions(masterKeyPath, 600);
        }
    }

    /**
     * Encrypt master key with system key
     */
    async encryptMasterKey(masterKey) {
        const systemKey = await this.getSystemKey();
        const iv = crypto.randomBytes(this.ivLength);
        const cipher = crypto.createCipher(this.algorithm, systemKey);
        cipher.setAAD(Buffer.from('master-key'));
        
        let encrypted = cipher.update(masterKey);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const tag = cipher.getAuthTag();
        
        return Buffer.concat([iv, tag, encrypted]);
    }

    /**
     * Decrypt master key with system key
     */
    async decryptMasterKey(encryptedMasterKey) {
        const systemKey = await this.getSystemKey();
        const iv = encryptedMasterKey.slice(0, this.ivLength);
        const tag = encryptedMasterKey.slice(this.ivLength, this.ivLength + this.tagLength);
        const encrypted = encryptedMasterKey.slice(this.ivLength + this.tagLength);
        
        const decipher = crypto.createDecipher(this.algorithm, systemKey);
        decipher.setAAD(Buffer.from('master-key'));
        decipher.setAuthTag(tag);
        
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted;
    }

    /**
     * Get system-derived key
     */
    async getSystemKey() {
        // Use system information to derive a consistent key
        const systemInfo = {
            hostname: require('os').hostname(),
            platform: process.platform,
            arch: process.arch
        };
        
        const systemString = JSON.stringify(systemInfo);
        return crypto.pbkdf2Sync(systemString, 'document-sorter-salt', 100000, this.keyLength, 'sha512');
    }

    /**
     * Encrypt file
     */
    async encryptFile(filePath, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Encryption service not initialized');
        }

        try {
            const fileData = await fs.readFile(filePath);
            const fileId = options.fileId || this.generateFileId(filePath);
            const encryptionKey = await this.deriveFileKey(fileId);
            
            // Generate random IV for this file
            const iv = crypto.randomBytes(this.ivLength);
            
            // Create cipher
            const cipher = crypto.createCipher(this.algorithm, encryptionKey);
            cipher.setAAD(Buffer.from(fileId));
            
            // Encrypt file data
            let encrypted = cipher.update(fileData);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const tag = cipher.getAuthTag();
            
            // Create encrypted file structure
            const encryptedFile = {
                version: '1.0',
                algorithm: this.algorithm,
                fileId: fileId,
                iv: iv,
                tag: tag,
                encryptedData: encrypted,
                originalPath: filePath,
                encryptedAt: new Date().toISOString(),
                metadata: options.metadata || {}
            };
            
            // Save encrypted file
            const encryptedFilePath = path.join(this.encryptedStoragePath, `${fileId}.enc`);
            await fs.writeFile(encryptedFilePath, JSON.stringify(encryptedFile, null, 2));
            await this.setSecurePermissions(encryptedFilePath, 640);
            
            // Log encryption
            if (this.auditLogger) {
                await this.auditLogger.logSystemEvent('file_encrypted', {
                    fileId,
                    originalPath: filePath,
                    encryptedPath: encryptedFilePath,
                    algorithm: this.algorithm
                });
            }
            
            return {
                success: true,
                fileId,
                encryptedPath: encryptedFilePath,
                originalSize: fileData.length,
                encryptedSize: encrypted.length
            };
        } catch (error) {
            console.error(`Failed to encrypt file ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Decrypt file
     */
    async decryptFile(fileId, outputPath = null) {
        if (!this.isInitialized) {
            throw new Error('Encryption service not initialized');
        }

        try {
            const encryptedFilePath = path.join(this.encryptedStoragePath, `${fileId}.enc`);
            const encryptedFileData = await fs.readFile(encryptedFilePath);
            const encryptedFile = JSON.parse(encryptedFileData.toString());
            
            // Verify file structure
            if (!this.validateEncryptedFile(encryptedFile)) {
                throw new Error('Invalid encrypted file format');
            }
            
            // Derive decryption key
            const decryptionKey = await this.deriveFileKey(fileId);
            
            // Create decipher
            const decipher = crypto.createDecipher(encryptedFile.algorithm, decryptionKey);
            decipher.setAAD(Buffer.from(encryptedFile.fileId));
            decipher.setAuthTag(encryptedFile.tag);
            
            // Decrypt file data
            let decrypted = decipher.update(encryptedFile.encryptedData);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            
            // Write decrypted file
            const finalOutputPath = outputPath || encryptedFile.originalPath;
            await fs.writeFile(finalOutputPath, decrypted);
            await this.setSecurePermissions(finalOutputPath, 640);
            
            // Log decryption
            if (this.auditLogger) {
                await this.auditLogger.logSystemEvent('file_decrypted', {
                    fileId,
                    outputPath: finalOutputPath,
                    originalPath: encryptedFile.originalPath
                });
            }
            
            return {
                success: true,
                fileId,
                outputPath: finalOutputPath,
                originalPath: encryptedFile.originalPath,
                decryptedSize: decrypted.length
            };
        } catch (error) {
            console.error(`Failed to decrypt file ${fileId}:`, error);
            throw error;
        }
    }

    /**
     * Derive file-specific encryption key
     */
    async deriveFileKey(fileId) {
        if (this.keyCache.has(fileId)) {
            return this.keyCache.get(fileId);
        }
        
        const salt = Buffer.from(fileId, 'hex');
        const key = crypto.pbkdf2Sync(this.masterKey, salt, this.keyDerivationIterations, this.keyLength, 'sha512');
        
        this.keyCache.set(fileId, key);
        return key;
    }

    /**
     * Generate unique file ID
     */
    generateFileId(filePath) {
        const timestamp = Date.now().toString();
        const random = crypto.randomBytes(16).toString('hex');
        const hash = crypto.createHash('sha256')
            .update(filePath + timestamp + random)
            .digest('hex');
        return hash;
    }

    /**
     * Validate encrypted file structure
     */
    validateEncryptedFile(encryptedFile) {
        const requiredFields = ['version', 'algorithm', 'fileId', 'iv', 'tag', 'encryptedData'];
        return requiredFields.every(field => encryptedFile.hasOwnProperty(field));
    }

    /**
     * Set secure file permissions
     */
    async setSecurePermissions(filePath, mode) {
        try {
            await fs.chmod(filePath, mode);
        } catch (error) {
            console.warn(`Failed to set permissions for ${filePath}:`, error.message);
        }
    }

    /**
     * Encrypt directory recursively
     */
    async encryptDirectory(dirPath, options = {}) {
        const results = [];
        
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    const subResults = await this.encryptDirectory(fullPath, options);
                    results.push(...subResults);
                } else if (entry.isFile()) {
                    const result = await this.encryptFile(fullPath, {
                        ...options,
                        fileId: options.fileId || this.generateFileId(fullPath)
                    });
                    results.push(result);
                }
            }
            
            return results;
        } catch (error) {
            console.error(`Failed to encrypt directory ${dirPath}:`, error);
            throw error;
        }
    }

    /**
     * Decrypt directory recursively
     */
    async decryptDirectory(encryptedDirPath, outputDirPath) {
        const results = [];
        
        try {
            await fs.mkdir(outputDirPath, { recursive: true });
            
            const entries = await fs.readdir(encryptedDirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('.enc')) {
                    const fileId = entry.name.replace('.enc', '');
                    const outputPath = path.join(outputDirPath, fileId);
                    
                    const result = await this.decryptFile(fileId, outputPath);
                    results.push(result);
                }
            }
            
            return results;
        } catch (error) {
            console.error(`Failed to decrypt directory ${encryptedDirPath}:`, error);
            throw error;
        }
    }

    /**
     * Get encryption status
     */
    getEncryptionStatus() {
        return {
            isInitialized: this.isInitialized,
            algorithm: this.algorithm,
            keyLength: this.keyLength,
            keyStoragePath: this.keyStoragePath,
            encryptedStoragePath: this.encryptedStoragePath,
            cachedKeys: this.keyCache.size
        };
    }

    /**
     * List encrypted files
     */
    async listEncryptedFiles() {
        try {
            const files = await fs.readdir(this.encryptedStoragePath);
            const encryptedFiles = files
                .filter(file => file.endsWith('.enc'))
                .map(file => ({
                    fileId: file.replace('.enc', ''),
                    encryptedPath: path.join(this.encryptedStoragePath, file),
                    size: 0 // Would need to read file to get actual size
                }));
            
            return encryptedFiles;
        } catch (error) {
            console.error('Failed to list encrypted files:', error);
            return [];
        }
    }

    /**
     * Delete encrypted file
     */
    async deleteEncryptedFile(fileId) {
        try {
            const encryptedFilePath = path.join(this.encryptedStoragePath, `${fileId}.enc`);
            await fs.unlink(encryptedFilePath);
            
            // Remove from key cache
            this.keyCache.delete(fileId);
            
            // Log deletion
            if (this.auditLogger) {
                await this.auditLogger.logSystemEvent('encrypted_file_deleted', {
                    fileId,
                    encryptedPath: encryptedFilePath
                });
            }
            
            return { success: true, fileId };
        } catch (error) {
            console.error(`Failed to delete encrypted file ${fileId}:`, error);
            throw error;
        }
    }

    /**
     * Rotate master key
     */
    async rotateMasterKey() {
        try {
            // Generate new master key
            const newMasterKey = crypto.randomBytes(this.keyLength);
            
            // Re-encrypt all files with new key
            const encryptedFiles = await this.listEncryptedFiles();
            const results = [];
            
            for (const file of encryptedFiles) {
                try {
                    // Decrypt with old key
                    const decrypted = await this.decryptFile(file.fileId);
                    
                    // Update master key
                    const oldMasterKey = this.masterKey;
                    this.masterKey = newMasterKey;
                    
                    // Re-encrypt with new key
                    const reEncrypted = await this.encryptFile(decrypted.outputPath, {
                        fileId: file.fileId
                    });
                    
                    results.push(reEncrypted);
                } catch (error) {
                    console.error(`Failed to rotate key for file ${file.fileId}:`, error);
                }
            }
            
            // Save new master key
            const masterKeyPath = path.join(this.keyStoragePath, 'master.key');
            const encryptedMasterKey = await this.encryptMasterKey(newMasterKey);
            await fs.writeFile(masterKeyPath, encryptedMasterKey);
            
            // Clear key cache
            this.keyCache.clear();
            
            // Log key rotation
            if (this.auditLogger) {
                await this.auditLogger.logSystemEvent('master_key_rotated', {
                    filesRotated: results.length,
                    newKeyGenerated: true
                });
            }
            
            return { success: true, filesRotated: results.length };
        } catch (error) {
            console.error('Failed to rotate master key:', error);
            throw error;
        }
    }

    /**
     * Verify file integrity
     */
    async verifyFileIntegrity(fileId) {
        try {
            const encryptedFilePath = path.join(this.encryptedStoragePath, `${fileId}.enc`);
            const encryptedFileData = await fs.readFile(encryptedFilePath);
            const encryptedFile = JSON.parse(encryptedFileData.toString());
            
            // Verify file structure
            if (!this.validateEncryptedFile(encryptedFile)) {
                return { valid: false, error: 'Invalid file format' };
            }
            
            // Verify decryption works
            const decryptionKey = await this.deriveFileKey(fileId);
            const decipher = crypto.createDecipher(encryptedFile.algorithm, decryptionKey);
            decipher.setAAD(Buffer.from(encryptedFile.fileId));
            decipher.setAuthTag(encryptedFile.tag);
            
            try {
                decipher.update(encryptedFile.encryptedData);
                decipher.final();
                return { valid: true };
            } catch (error) {
                return { valid: false, error: 'Decryption failed' };
            }
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }
}

module.exports = EncryptionService;

