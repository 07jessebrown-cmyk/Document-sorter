/**
 * File Integrity Monitoring Service
 * Periodically verifies stored file hashes against originals to detect tampering
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class FileIntegrityMonitoringService {
    constructor(options = {}) {
        this.checkInterval = options.checkInterval || 24 * 60 * 60 * 1000; // 24 hours
        this.alertThreshold = options.alertThreshold || 1; // Alert on any mismatch
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 5000; // 5 seconds
        this.monitoringActive = false;
        this.intervalId = null;
        this.fileRegistry = new Map(); // fileId -> file info
        this.integrityChecks = new Map(); // fileId -> check results
        this.alertCallbacks = [];
        this.auditLogger = null; // Will be injected
    }

    /**
     * Set audit logger for integrity events
     */
    setAuditLogger(auditLogger) {
        this.auditLogger = auditLogger;
    }

    /**
     * Register a file for integrity monitoring
     */
    async registerFile(fileId, filePath, originalHashes, clientId, metadata = {}) {
        const fileInfo = {
            fileId,
            filePath,
            originalHashes,
            clientId,
            metadata,
            registeredAt: new Date(),
            lastChecked: null,
            checkCount: 0,
            isActive: true
        };

        this.fileRegistry.set(fileId, fileInfo);
        
        // Log registration
        if (this.auditLogger) {
            await this.auditLogger.logSystemEvent('file_integrity_registered', {
                fileId,
                clientId,
                filePath: path.basename(filePath),
                hashCount: Object.keys(originalHashes).length
            });
        }

        return { success: true, fileId };
    }

    /**
     * Unregister a file from monitoring
     */
    async unregisterFile(fileId) {
        const fileInfo = this.fileRegistry.get(fileId);
        if (!fileInfo) {
            throw new Error(`File ${fileId} not found in registry`);
        }

        fileInfo.isActive = false;
        this.fileRegistry.delete(fileId);
        this.integrityChecks.delete(fileId);

        // Log unregistration
        if (this.auditLogger) {
            await this.auditLogger.logSystemEvent('file_integrity_unregistered', {
                fileId,
                clientId: fileInfo.clientId
            });
        }

        return { success: true, fileId };
    }

    /**
     * Start integrity monitoring
     */
    async startMonitoring() {
        if (this.monitoringActive) {
            console.log('File integrity monitoring is already active');
            return;
        }

        this.monitoringActive = true;
        console.log('Starting file integrity monitoring...');

        // Run initial check
        await this.runIntegrityCheck();

        // Set up periodic checks
        this.intervalId = setInterval(async () => {
            try {
                await this.runIntegrityCheck();
            } catch (error) {
                console.error('Error during integrity check:', error);
            }
        }, this.checkInterval);

        if (this.auditLogger) {
            await this.auditLogger.logSystemEvent('integrity_monitoring_started', {
                checkInterval: this.checkInterval,
                registeredFiles: this.fileRegistry.size
            });
        }
    }

    /**
     * Stop integrity monitoring
     */
    async stopMonitoring() {
        if (!this.monitoringActive) {
            return;
        }

        this.monitoringActive = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        if (this.auditLogger) {
            await this.auditLogger.logSystemEvent('integrity_monitoring_stopped', {
                registeredFiles: this.fileRegistry.size
            });
        }

        console.log('File integrity monitoring stopped');
    }

    /**
     * Run integrity check on all registered files
     */
    async runIntegrityCheck() {
        const activeFiles = Array.from(this.fileRegistry.values()).filter(file => file.isActive);
        const results = {
            totalFiles: activeFiles.length,
            checkedFiles: 0,
            mismatches: 0,
            errors: 0,
            startTime: new Date(),
            endTime: null
        };

        console.log(`Running integrity check on ${activeFiles.length} files...`);

        for (const fileInfo of activeFiles) {
            try {
                const checkResult = await this.checkFileIntegrity(fileInfo);
                results.checkedFiles++;
                
                if (checkResult.hasMismatch) {
                    results.mismatches++;
                    await this.handleIntegrityMismatch(fileInfo, checkResult);
                }
            } catch (error) {
                results.errors++;
                console.error(`Error checking file ${fileInfo.fileId}:`, error);
                
                if (this.auditLogger) {
                    await this.auditLogger.logSecurityEvent('integrity_check_error', 'error', {
                        fileId: fileInfo.fileId,
                        error: error.message
                    });
                }
            }
        }

        results.endTime = new Date();
        results.duration = results.endTime - results.startTime;

        console.log(`Integrity check completed: ${results.checkedFiles} files checked, ${results.mismatches} mismatches, ${results.errors} errors`);

        // Log summary
        if (this.auditLogger) {
            await this.auditLogger.logSystemEvent('integrity_check_completed', results);
        }

        return results;
    }

    /**
     * Check integrity of a single file
     */
    async checkFileIntegrity(fileInfo) {
        const { fileId, filePath, originalHashes } = fileInfo;
        
        try {
            // Check if file exists
            await fs.access(filePath);
            
            // Read file content
            const fileContent = await fs.readFile(filePath);
            
            // Calculate current hashes
            const currentHashes = this.calculateHashes(fileContent);
            
            // Compare hashes
            const comparison = this.compareHashes(originalHashes, currentHashes);
            
            // Update file info
            fileInfo.lastChecked = new Date();
            fileInfo.checkCount++;
            
            // Store check result
            const checkResult = {
                fileId,
                timestamp: new Date(),
                hasMismatch: comparison.hasMismatch,
                mismatchedHashes: comparison.mismatchedHashes,
                originalHashes,
                currentHashes,
                fileSize: fileContent.length,
                checkDuration: 0 // Could be calculated if needed
            };
            
            this.integrityChecks.set(fileId, checkResult);
            
            return checkResult;
        } catch (error) {
            throw new Error(`Failed to check file integrity: ${error.message}`);
        }
    }

    /**
     * Calculate multiple hashes for file content
     */
    calculateHashes(fileContent) {
        return {
            sha256: crypto.createHash('sha256').update(fileContent).digest('hex'),
            sha512: crypto.createHash('sha512').update(fileContent).digest('hex'),
            blake2b: crypto.createHash('blake2b512').update(fileContent).digest('hex'),
            md5: crypto.createHash('md5').update(fileContent).digest('hex')
        };
    }

    /**
     * Compare original and current hashes
     */
    compareHashes(originalHashes, currentHashes) {
        const mismatchedHashes = [];
        let hasMismatch = false;

        for (const [algorithm, originalHash] of Object.entries(originalHashes)) {
            const currentHash = currentHashes[algorithm];
            
            if (currentHash && originalHash !== currentHash) {
                hasMismatch = true;
                mismatchedHashes.push({
                    algorithm,
                    original: originalHash,
                    current: currentHash
                });
            }
        }

        return {
            hasMismatch,
            mismatchedHashes
        };
    }

    /**
     * Handle integrity mismatch
     */
    async handleIntegrityMismatch(fileInfo, checkResult) {
        const { fileId, clientId } = fileInfo;
        const { mismatchedHashes } = checkResult;
        
        console.error(`INTEGRITY MISMATCH detected for file ${fileId}:`, mismatchedHashes);
        
        // Log security event
        if (this.auditLogger) {
            await this.auditLogger.logSecurityEvent('file_tampering_detected', 'critical', {
                fileId,
                clientId,
                mismatchedHashes,
                filePath: fileInfo.filePath
            });
        }
        
        // Trigger alerts
        await this.triggerIntegrityAlert(fileInfo, checkResult);
        
        // Take protective action (e.g., quarantine file)
        await this.quarantineFile(fileInfo, checkResult);
    }

    /**
     * Trigger integrity alert
     */
    async triggerIntegrityAlert(fileInfo, checkResult) {
        const alert = {
            type: 'FILE_INTEGRITY_MISMATCH',
            severity: 'critical',
            timestamp: new Date(),
            fileId: fileInfo.fileId,
            clientId: fileInfo.clientId,
            filePath: fileInfo.filePath,
            mismatchedHashes: checkResult.mismatchedHashes,
            details: {
                originalHashes: checkResult.originalHashes,
                currentHashes: checkResult.currentHashes,
                fileSize: checkResult.fileSize
            }
        };

        // Call registered alert callbacks
        for (const callback of this.alertCallbacks) {
            try {
                await callback(alert);
            } catch (error) {
                console.error('Error in alert callback:', error);
            }
        }
    }

    /**
     * Quarantine file with integrity issues
     */
    async quarantineFile(fileInfo, checkResult) {
        const quarantineDir = path.join(path.dirname(fileInfo.filePath), '.quarantine');
        const quarantinePath = path.join(quarantineDir, `${fileInfo.fileId}-${Date.now()}.quarantined`);
        
        try {
            // Create quarantine directory
            await fs.mkdir(quarantineDir, { recursive: true });
            
            // Move file to quarantine
            await fs.rename(fileInfo.filePath, quarantinePath);
            
            // Update file info
            fileInfo.quarantinedAt = new Date();
            fileInfo.quarantinePath = quarantinePath;
            fileInfo.isActive = false; // Stop monitoring quarantined file
            
            console.log(`File ${fileInfo.fileId} quarantined to ${quarantinePath}`);
            
            // Log quarantine action
            if (this.auditLogger) {
                await this.auditLogger.logSecurityEvent('file_quarantined', 'warning', {
                    fileId: fileInfo.fileId,
                    clientId: fileInfo.clientId,
                    quarantinePath,
                    reason: 'integrity_mismatch'
                });
            }
        } catch (error) {
            console.error(`Failed to quarantine file ${fileInfo.fileId}:`, error);
            throw error;
        }
    }

    /**
     * Register alert callback
     */
    registerAlertCallback(callback) {
        this.alertCallbacks.push(callback);
    }

    /**
     * Get integrity status for a file
     */
    getFileIntegrityStatus(fileId) {
        const fileInfo = this.fileRegistry.get(fileId);
        const checkResult = this.integrityChecks.get(fileId);
        
        if (!fileInfo) {
            return { error: 'File not found in registry' };
        }
        
        return {
            fileId,
            isActive: fileInfo.isActive,
            lastChecked: fileInfo.lastChecked,
            checkCount: fileInfo.checkCount,
            lastResult: checkResult,
            quarantined: !!fileInfo.quarantinedAt,
            quarantinePath: fileInfo.quarantinePath
        };
    }

    /**
     * Get integrity statistics
     */
    getIntegrityStatistics() {
        const activeFiles = Array.from(this.fileRegistry.values()).filter(file => file.isActive);
        const quarantinedFiles = Array.from(this.fileRegistry.values()).filter(file => file.quarantinedAt);
        const recentChecks = Array.from(this.integrityChecks.values())
            .filter(check => check.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000));
        
        return {
            totalRegisteredFiles: this.fileRegistry.size,
            activeFiles: activeFiles.length,
            quarantinedFiles: quarantinedFiles.length,
            recentChecks: recentChecks.length,
            mismatchesInLast24h: recentChecks.filter(check => check.hasMismatch).length,
            monitoringActive: this.monitoringActive,
            nextCheckScheduled: this.intervalId ? new Date(Date.now() + this.checkInterval) : null
        };
    }

    /**
     * Restore file from quarantine
     */
    async restoreFromQuarantine(fileId, newPath = null) {
        const fileInfo = this.fileRegistry.get(fileId);
        
        if (!fileInfo || !fileInfo.quarantinedAt) {
            throw new Error('File not found in quarantine');
        }
        
        const restorePath = newPath || fileInfo.filePath;
        
        try {
            // Move file back from quarantine
            await fs.rename(fileInfo.quarantinePath, restorePath);
            
            // Update file info
            fileInfo.filePath = restorePath;
            fileInfo.quarantinedAt = null;
            fileInfo.quarantinePath = null;
            fileInfo.isActive = true;
            
            // Log restoration
            if (this.auditLogger) {
                await this.auditLogger.logSystemEvent('file_restored_from_quarantine', {
                    fileId,
                    clientId: fileInfo.clientId,
                    restorePath
                });
            }
            
            return { success: true, fileId, restorePath };
        } catch (error) {
            throw new Error(`Failed to restore file from quarantine: ${error.message}`);
        }
    }

    /**
     * Get all integrity check results
     */
    getAllCheckResults() {
        return Array.from(this.integrityChecks.values())
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    /**
     * Clean up old check results
     */
    async cleanupOldResults(retentionDays = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        
        let cleanedCount = 0;
        
        for (const [fileId, checkResult] of this.integrityChecks.entries()) {
            if (checkResult.timestamp < cutoffDate) {
                this.integrityChecks.delete(fileId);
                cleanedCount++;
            }
        }
        
        console.log(`Cleaned up ${cleanedCount} old integrity check results`);
        return cleanedCount;
    }
}

module.exports = FileIntegrityMonitoringService;
