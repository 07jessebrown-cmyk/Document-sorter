/**
 * Tamper-Proof Storage Service
 * Implements offline and immutable storage options for the most sensitive originals
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class TamperProofStorageService {
    constructor(options = {}) {
        this.storagePolicies = new Map();
        this.activeStorages = new Map();
        this.auditLogger = null;
        this.isWindows = process.platform === 'win32';
        this.isLinux = process.platform === 'linux';
        this.isMacOS = process.platform === 'darwin';
        this.initializeDefaultPolicies();
    }

    /**
     * Set audit logger reference
     */
    setAuditLogger(auditLogger) {
        this.auditLogger = auditLogger;
    }

    /**
     * Initialize default tamper-proof storage policies
     */
    initializeDefaultPolicies() {
        // High-security offline storage policy
        this.storagePolicies.set('offlineStorage', {
            policyName: 'offlineStorage',
            description: 'Offline storage for highest assurance files',
            storageType: 'offline',
            config: {
                primaryPath: '/var/lib/document-sorter/offline-storage',
                backupPath: '/var/lib/document-sorter/offline-backup',
                checksumPath: '/var/lib/document-sorter/offline-checksums',
                manifestPath: '/var/lib/document-sorter/offline-manifest.json',
                encryptionEnabled: true,
                compressionEnabled: true,
                redundancyLevel: 3
            },
            accessControl: {
                readOnly: true,
                requireAuthentication: true,
                allowedUsers: ['admin', 'auditor'],
                allowedGroups: ['security-team'],
                accessTimeWindow: '09:00-17:00',
                maxAccessAttempts: 3
            },
            integrityChecks: {
                algorithm: 'sha256',
                checkInterval: 86400, // 24 hours
                autoQuarantine: true,
                alertOnTamper: true
            },
            retention: {
                minRetentionDays: 2555, // 7 years
                maxRetentionDays: 3650, // 10 years
                autoArchive: true,
                archivePath: '/var/lib/document-sorter/archived'
            }
        });

        // Immutable cloud storage policy
        this.storagePolicies.set('immutableCloudStorage', {
            policyName: 'immutableCloudStorage',
            description: 'Immutable cloud storage with WORM capabilities',
            storageType: 'cloud-immutable',
            config: {
                provider: 'aws-s3',
                bucketName: 'document-sorter-immutable',
                region: 'us-east-1',
                storageClass: 'GLACIER',
                encryptionEnabled: true,
                versioningEnabled: true,
                mfaDeleteEnabled: true
            },
            accessControl: {
                readOnly: true,
                requireMFA: true,
                allowedRoles: ['DocumentAuditor', 'SecurityAdmin'],
                ipWhitelist: ['10.0.0.0/8', '172.16.0.0/12'],
                timeRestrictions: true
            },
            integrityChecks: {
                algorithm: 'sha256',
                checkInterval: 3600, // 1 hour
                crossRegionReplication: true,
                alertOnTamper: true
            },
            retention: {
                minRetentionDays: 2555, // 7 years
                maxRetentionDays: 3650, // 10 years
                legalHold: true,
                complianceMode: 'SEC17A4'
            }
        });

        // Blockchain-based storage policy
        this.storagePolicies.set('blockchainStorage', {
            policyName: 'blockchainStorage',
            description: 'Blockchain-based immutable storage for critical files',
            storageType: 'blockchain',
            config: {
                blockchain: 'ethereum',
                network: 'mainnet',
                contractAddress: '0x...',
                gasLimit: 1000000,
                encryptionEnabled: true,
                merkleTreeEnabled: true
            },
            accessControl: {
                readOnly: true,
                requireWallet: true,
                allowedWallets: ['0x...', '0x...'],
                requireSignature: true,
                timeLock: 86400 // 24 hours
            },
            integrityChecks: {
                algorithm: 'keccak256',
                checkInterval: 300, // 5 minutes
                onChainVerification: true,
                alertOnTamper: true
            },
            retention: {
                permanent: true,
                immutable: true,
                gasOptimized: true
            }
        });

        // Hardware security module storage policy
        this.storagePolicies.set('hsmStorage', {
            policyName: 'hsmStorage',
            description: 'Hardware Security Module based storage',
            storageType: 'hsm',
            config: {
                hsmType: 'thales-luna',
                slotId: 1,
                keyId: 'document-sorter-key',
                encryptionEnabled: true,
                tamperDetection: true,
                secureBoot: true
            },
            accessControl: {
                readOnly: true,
                requireHSM: true,
                requirePIN: true,
                allowedOperators: ['admin', 'security-officer'],
                auditLogging: true
            },
            integrityChecks: {
                algorithm: 'sha256',
                checkInterval: 1800, // 30 minutes
                hsmVerification: true,
                alertOnTamper: true
            },
            retention: {
                minRetentionDays: 2555, // 7 years
                maxRetentionDays: 3650, // 10 years
                hsmBackup: true,
                keyRotation: true
            }
        });
    }

    /**
     * Store file with tamper-proof protection
     */
    async storeFile(filePath, policyName, options = {}) {
        const policy = this.storagePolicies.get(policyName);
        if (!policy) {
            throw new Error(`Storage policy not found: ${policyName}`);
        }

        try {
            const fileId = options.fileId || this.generateFileId(filePath);
            const fileData = await fs.readFile(filePath);
            
            // Generate integrity hash
            const integrityHash = this.generateIntegrityHash(fileData, policy.integrityChecks.algorithm);
            
            // Create storage record
            const storageRecord = {
                fileId,
                originalPath: filePath,
                policyName,
                storedAt: new Date().toISOString(),
                integrityHash,
                algorithm: policy.integrityChecks.algorithm,
                metadata: options.metadata || {},
                accessCount: 0,
                lastAccessed: null,
                status: 'stored'
            };

            // Store based on policy type
            let storageResult;
            switch (policy.storageType) {
                case 'offline':
                    storageResult = await this.storeOffline(fileData, storageRecord, policy);
                    break;
                case 'cloud-immutable':
                    storageResult = await this.storeCloudImmutable(fileData, storageRecord, policy);
                    break;
                case 'blockchain':
                    storageResult = await this.storeBlockchain(fileData, storageRecord, policy);
                    break;
                case 'hsm':
                    storageResult = await this.storeHSM(fileData, storageRecord, policy);
                    break;
                default:
                    throw new Error(`Unsupported storage type: ${policy.storageType}`);
            }

            // Update storage record with location
            storageRecord.storageLocation = storageResult.location;
            storageRecord.encryptionKey = storageResult.encryptionKey;

            // Save storage record
            await this.saveStorageRecord(storageRecord, policy);

            // Store active storage
            this.activeStorages.set(fileId, {
                policyName,
                storageRecord,
                storedAt: new Date(),
                status: 'active'
            });

            // Log storage
            if (this.auditLogger) {
                await this.auditLogger.logSystemEvent('file_stored_tamper_proof', {
                    fileId,
                    policyName,
                    storageType: policy.storageType,
                    integrityHash,
                    location: storageResult.location
                });
            }

            return {
                success: true,
                fileId,
                policyName,
                storageType: policy.storageType,
                location: storageResult.location,
                integrityHash
            };
        } catch (error) {
            console.error(`Failed to store file with tamper-proof protection:`, error);
            throw error;
        }
    }

    /**
     * Store file offline
     */
    async storeOffline(fileData, storageRecord, policy) {
        const { primaryPath, backupPath, checksumPath, encryptionEnabled, compressionEnabled } = policy.config;
        
        // Create directories
        await fs.mkdir(primaryPath, { recursive: true });
        await fs.mkdir(backupPath, { recursive: true });
        await fs.mkdir(checksumPath, { recursive: true });

        // Compress if enabled
        let processedData = fileData;
        if (compressionEnabled) {
            processedData = await this.compressData(fileData);
        }

        // Encrypt if enabled
        let encryptionKey = null;
        if (encryptionEnabled) {
            const encrypted = await this.encryptData(processedData);
            processedData = encrypted.data;
            encryptionKey = encrypted.key;
        }

        // Store primary copy
        const primaryFile = path.join(primaryPath, `${storageRecord.fileId}.dat`);
        await fs.writeFile(primaryFile, processedData);
        await this.setReadOnly(primaryFile);

        // Store backup copies
        const backupFiles = [];
        for (let i = 0; i < policy.config.redundancyLevel; i++) {
            const backupFile = path.join(backupPath, `${storageRecord.fileId}_backup_${i}.dat`);
            await fs.writeFile(backupFile, processedData);
            await this.setReadOnly(backupFile);
            backupFiles.push(backupFile);
        }

        // Store checksum
        const checksumFile = path.join(checksumPath, `${storageRecord.fileId}.checksum`);
        await fs.writeFile(checksumFile, storageRecord.integrityHash);
        await this.setReadOnly(checksumFile);

        return {
            location: primaryFile,
            backupLocations: backupFiles,
            checksumLocation: checksumFile,
            encryptionKey
        };
    }

    /**
     * Store file in cloud with immutable properties
     */
    async storeCloudImmutable(fileData, storageRecord, policy) {
        const { provider, bucketName, region, encryptionEnabled } = policy.config;
        
        // Encrypt if enabled
        let encryptionKey = null;
        if (encryptionEnabled) {
            const encrypted = await this.encryptData(fileData);
            fileData = encrypted.data;
            encryptionKey = encrypted.key;
        }

        // Upload to cloud storage
        const objectKey = `immutable/${storageRecord.fileId}`;
        const location = await this.uploadToCloud(provider, bucketName, objectKey, fileData, {
            region,
            storageClass: policy.config.storageClass,
            serverSideEncryption: encryptionEnabled ? 'AES256' : undefined,
            metadata: {
                integrityHash: storageRecord.integrityHash,
                algorithm: storageRecord.algorithm,
                storedAt: storageRecord.storedAt
            }
        });

        return {
            location,
            encryptionKey
        };
    }

    /**
     * Store file on blockchain
     */
    async storeBlockchain(fileData, storageRecord, policy) {
        const { blockchain, network, contractAddress } = policy.config;
        
        // Encrypt data
        const encrypted = await this.encryptData(fileData);
        
        // Create Merkle tree if enabled
        let merkleRoot = null;
        if (policy.config.merkleTreeEnabled) {
            merkleRoot = await this.createMerkleTree(encrypted.data);
        }

        // Store on blockchain
        const transactionHash = await this.storeOnBlockchain(blockchain, network, contractAddress, {
            fileId: storageRecord.fileId,
            dataHash: storageRecord.integrityHash,
            encryptedData: encrypted.data,
            merkleRoot,
            metadata: storageRecord.metadata
        });

        return {
            location: transactionHash,
            encryptionKey: encrypted.key,
            merkleRoot
        };
    }

    /**
     * Store file in HSM
     */
    async storeHSM(fileData, storageRecord, policy) {
        const { hsmType, slotId, keyId } = policy.config;
        
        // Encrypt with HSM key
        const encrypted = await this.encryptWithHSM(hsmType, slotId, keyId, fileData);
        
        // Store in HSM
        const hsmLocation = await this.storeInHSM(hsmType, slotId, {
            fileId: storageRecord.fileId,
            encryptedData: encrypted.data,
            integrityHash: storageRecord.integrityHash,
            metadata: storageRecord.metadata
        });

        return {
            location: hsmLocation,
            encryptionKey: encrypted.key
        };
    }

    /**
     * Retrieve file from tamper-proof storage
     */
    async retrieveFile(fileId, outputPath = null) {
        const storage = this.activeStorages.get(fileId);
        if (!storage) {
            throw new Error(`File not found in tamper-proof storage: ${fileId}`);
        }

        try {
            const { policyName, storageRecord } = storage;
            const policy = this.storagePolicies.get(policyName);

            // Check access permissions
            await this.checkAccessPermissions(fileId, policy);

            // Retrieve based on storage type
            let fileData;
            switch (policy.storageType) {
                case 'offline':
                    fileData = await this.retrieveOffline(storageRecord, policy);
                    break;
                case 'cloud-immutable':
                    fileData = await this.retrieveCloudImmutable(storageRecord, policy);
                    break;
                case 'blockchain':
                    fileData = await this.retrieveBlockchain(storageRecord, policy);
                    break;
                case 'hsm':
                    fileData = await this.retrieveHSM(storageRecord, policy);
                    break;
                default:
                    throw new Error(`Unsupported storage type: ${policy.storageType}`);
            }

            // Verify integrity
            const currentHash = this.generateIntegrityHash(fileData, storageRecord.algorithm);
            if (currentHash !== storageRecord.integrityHash) {
                throw new Error('File integrity verification failed - file may have been tampered with');
            }

            // Write to output path
            const finalOutputPath = outputPath || storageRecord.originalPath;
            await fs.writeFile(finalOutputPath, fileData);

            // Update access record
            storageRecord.accessCount++;
            storageRecord.lastAccessed = new Date().toISOString();
            await this.saveStorageRecord(storageRecord, policy);

            // Log access
            if (this.auditLogger) {
                await this.auditLogger.logSystemEvent('file_retrieved_tamper_proof', {
                    fileId,
                    policyName,
                    outputPath: finalOutputPath,
                    accessCount: storageRecord.accessCount
                });
            }

            return {
                success: true,
                fileId,
                outputPath: finalOutputPath,
                integrityVerified: true,
                accessCount: storageRecord.accessCount
            };
        } catch (error) {
            console.error(`Failed to retrieve file from tamper-proof storage:`, error);
            throw error;
        }
    }

    /**
     * Verify file integrity
     */
    async verifyFileIntegrity(fileId) {
        const storage = this.activeStorages.get(fileId);
        if (!storage) {
            throw new Error(`File not found in tamper-proof storage: ${fileId}`);
        }

        try {
            const { policyName, storageRecord } = storage;
            const policy = this.storagePolicies.get(policyName);

            // Retrieve file data
            let fileData;
            switch (policy.storageType) {
                case 'offline':
                    fileData = await this.retrieveOffline(storageRecord, policy);
                    break;
                case 'cloud-immutable':
                    fileData = await this.retrieveCloudImmutable(storageRecord, policy);
                    break;
                case 'blockchain':
                    fileData = await this.retrieveBlockchain(storageRecord, policy);
                    break;
                case 'hsm':
                    fileData = await this.retrieveHSM(storageRecord, policy);
                    break;
                default:
                    throw new Error(`Unsupported storage type: ${policy.storageType}`);
            }

            // Verify integrity
            const currentHash = this.generateIntegrityHash(fileData, storageRecord.algorithm);
            const isValid = currentHash === storageRecord.integrityHash;

            // Log verification
            if (this.auditLogger) {
                await this.auditLogger.logSystemEvent('file_integrity_verified', {
                    fileId,
                    policyName,
                    isValid,
                    expectedHash: storageRecord.integrityHash,
                    actualHash: currentHash
                });
            }

            return {
                fileId,
                isValid,
                expectedHash: storageRecord.integrityHash,
                actualHash: currentHash,
                verifiedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error(`Failed to verify file integrity:`, error);
            throw error;
        }
    }

    /**
     * Generate integrity hash
     */
    generateIntegrityHash(data, algorithm = 'sha256') {
        return crypto.createHash(algorithm).update(data).digest('hex');
    }

    /**
     * Generate unique file ID
     */
    generateFileId(filePath) {
        const timestamp = Date.now().toString();
        const random = crypto.randomBytes(16).toString('hex');
        return crypto.createHash('sha256')
            .update(filePath + timestamp + random)
            .digest('hex');
    }

    /**
     * Set file as read-only
     */
    async setReadOnly(filePath) {
        try {
            await fs.chmod(filePath, 0o444);
        } catch (error) {
            console.warn(`Failed to set read-only for ${filePath}:`, error.message);
        }
    }

    /**
     * Compress data
     */
    async compressData(data) {
        const zlib = require('zlib');
        return new Promise((resolve, reject) => {
            zlib.gzip(data, (err, compressed) => {
                if (err) reject(err);
                else resolve(compressed);
            });
        });
    }

    /**
     * Decompress data
     */
    async decompressData(data) {
        const zlib = require('zlib');
        return new Promise((resolve, reject) => {
            zlib.gunzip(data, (err, decompressed) => {
                if (err) reject(err);
                else resolve(decompressed);
            });
        });
    }

    /**
     * Encrypt data
     */
    async encryptData(data) {
        const key = crypto.randomBytes(32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-gcm', key);
        cipher.setAAD(Buffer.from('tamper-proof-storage'));
        
        let encrypted = cipher.update(data);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const tag = cipher.getAuthTag();
        
        return {
            data: Buffer.concat([iv, tag, encrypted]),
            key: key.toString('hex')
        };
    }

    /**
     * Decrypt data
     */
    async decryptData(encryptedData, keyHex) {
        const key = Buffer.from(keyHex, 'hex');
        const iv = encryptedData.slice(0, 16);
        const tag = encryptedData.slice(16, 32);
        const encrypted = encryptedData.slice(32);
        
        const decipher = crypto.createDecipher('aes-256-gcm', key);
        decipher.setAAD(Buffer.from('tamper-proof-storage'));
        decipher.setAuthTag(tag);
        
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted;
    }

    /**
     * Check access permissions
     */
    async checkAccessPermissions(fileId, policy) {
        // Implement access control checks
        // This would typically integrate with authentication and authorization systems
        console.log(`Checking access permissions for file ${fileId}`);
    }

    /**
     * Save storage record
     */
    async saveStorageRecord(storageRecord, policy) {
        const manifestPath = policy.config.manifestPath;
        let manifest = {};
        
        try {
            const manifestData = await fs.readFile(manifestPath);
            manifest = JSON.parse(manifestData.toString());
        } catch (error) {
            // Manifest doesn't exist yet
        }
        
        manifest[storageRecord.fileId] = storageRecord;
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    }

    /**
     * Get storage status
     */
    getStorageStatus() {
        return {
            activeStorages: this.activeStorages.size,
            policies: this.storagePolicies.size,
            storageTypes: Array.from(this.storagePolicies.values()).map(p => p.storageType)
        };
    }

    /**
     * Get all stored files
     */
    getAllStoredFiles() {
        const files = [];
        for (const [fileId, storage] of this.activeStorages) {
            files.push({
                fileId,
                policyName: storage.policyName,
                storedAt: storage.storedAt,
                status: storage.status,
                accessCount: storage.storageRecord.accessCount,
                lastAccessed: storage.storageRecord.lastAccessed
            });
        }
        return files;
    }
}

module.exports = TamperProofStorageService;

