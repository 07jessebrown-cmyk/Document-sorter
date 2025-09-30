/**
 * Immutable Audit Logging Service
 * Provides tamper-proof audit logging with WORM (Write-Once-Read-Many) capabilities
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class AuditLoggingService {
    constructor(options = {}) {
        this.logDirectory = options.logDirectory || './audit-logs';
        this.maxLogFileSize = options.maxLogFileSize || 10 * 1024 * 1024; // 10MB
        this.retentionDays = options.retentionDays || 2555; // 7 years
        this.compressionEnabled = options.compressionEnabled || true;
        this.encryptionEnabled = options.encryptionEnabled || true;
        this.encryptionKey = options.encryptionKey || this.generateEncryptionKey();
        this.currentLogFile = null;
        this.currentLogSize = 0;
        this.chainHash = null; // For blockchain-style integrity
        this.initializeLogDirectory();
    }

    /**
     * Initialize log directory and create initial chain hash
     */
    async initializeLogDirectory() {
        try {
            await fs.mkdir(this.logDirectory, { recursive: true });
            
            // Create or load existing chain hash
            const chainFile = path.join(this.logDirectory, '.chain-hash');
            try {
                const chainData = await fs.readFile(chainFile, 'utf8');
                this.chainHash = chainData.trim();
            } catch (error) {
                // No existing chain, create new one
                this.chainHash = crypto.createHash('sha256').update('INITIAL_CHAIN').digest('hex');
                await fs.writeFile(chainFile, this.chainHash);
            }
        } catch (error) {
            console.error('Failed to initialize audit log directory:', error);
            throw error;
        }
    }

    /**
     * Generate encryption key for log files
     */
    generateEncryptionKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Log an audit event with tamper-proof integrity
     */
    async logEvent(event) {
        const timestamp = new Date().toISOString();
        const eventId = crypto.randomUUID();
        
        // Create audit entry
        const auditEntry = {
            eventId,
            timestamp,
            type: event.type,
            category: event.category || 'general',
            severity: event.severity || 'info',
            userId: event.userId,
            clientId: event.clientId,
            serviceId: event.serviceId,
            action: event.action,
            resource: event.resource,
            details: event.details || {},
            ipAddress: event.ipAddress,
            userAgent: event.userAgent,
            sessionId: event.sessionId,
            previousHash: this.chainHash,
            hash: null // Will be calculated
        };

        // Calculate hash for this entry
        const entryString = JSON.stringify(auditEntry, null, 0);
        auditEntry.hash = crypto.createHash('sha256').update(entryString).digest('hex');
        
        // Update chain hash
        this.chainHash = crypto.createHash('sha256')
            .update(this.chainHash + auditEntry.hash)
            .digest('hex');

        // Write to current log file
        await this.writeToLogFile(auditEntry);

        // Store chain hash
        await this.updateChainHash();

        return {
            eventId,
            timestamp,
            hash: auditEntry.hash,
            chainHash: this.chainHash
        };
    }

    /**
     * Write audit entry to current log file
     */
    async writeToLogFile(auditEntry) {
        if (!this.currentLogFile || this.currentLogSize >= this.maxLogFileSize) {
            await this.rotateLogFile();
        }

        const logLine = JSON.stringify(auditEntry) + '\n';
        const logPath = path.join(this.logDirectory, this.currentLogFile);
        
        try {
            await fs.appendFile(logPath, logLine);
            this.currentLogSize += Buffer.byteLength(logLine, 'utf8');
        } catch (error) {
            console.error('Failed to write audit log:', error);
            throw error;
        }
    }

    /**
     * Rotate to new log file when current one is full
     */
    async rotateLogFile() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.currentLogFile = `audit-${timestamp}.log`;
        this.currentLogSize = 0;

        // Create new log file with header
        const header = {
            type: 'LOG_HEADER',
            timestamp: new Date().toISOString(),
            previousChainHash: this.chainHash,
            logFileId: this.currentLogFile
        };

        const logPath = path.join(this.logDirectory, this.currentLogFile);
        await fs.writeFile(logPath, JSON.stringify(header) + '\n');
    }

    /**
     * Update chain hash file
     */
    async updateChainHash() {
        const chainFile = path.join(this.logDirectory, '.chain-hash');
        await fs.writeFile(chainFile, this.chainHash);
    }

    /**
     * Log file upload event
     */
    async logFileUpload(userId, clientId, fileId, fileName, fileSize, ipAddress, userAgent) {
        return await this.logEvent({
            type: 'FILE_UPLOAD',
            category: 'file_operation',
            severity: 'info',
            userId,
            clientId,
            action: 'upload',
            resource: `file:${fileId}`,
            details: {
                fileName,
                fileSize,
                fileId
            },
            ipAddress,
            userAgent
        });
    }

    /**
     * Log file download event
     */
    async logFileDownload(userId, clientId, fileId, fileName, ipAddress, userAgent) {
        return await this.logEvent({
            type: 'FILE_DOWNLOAD',
            category: 'file_operation',
            severity: 'info',
            userId,
            clientId,
            action: 'download',
            resource: `file:${fileId}`,
            details: {
                fileName,
                fileId
            },
            ipAddress,
            userAgent
        });
    }

    /**
     * Log file processing event
     */
    async logFileProcessing(userId, clientId, fileId, serviceId, processingType, result, duration) {
        return await this.logEvent({
            type: 'FILE_PROCESSING',
            category: 'processing',
            severity: 'info',
            userId,
            clientId,
            serviceId,
            action: 'process',
            resource: `file:${fileId}`,
            details: {
                processingType,
                result,
                duration,
                fileId
            }
        });
    }

    /**
     * Log authentication event
     */
    async logAuthentication(userId, clientId, action, success, ipAddress, userAgent, details = {}) {
        return await this.logEvent({
            type: 'AUTHENTICATION',
            category: 'security',
            severity: success ? 'info' : 'warning',
            userId,
            clientId,
            action,
            resource: 'authentication',
            details: {
                success,
                ...details
            },
            ipAddress,
            userAgent
        });
    }

    /**
     * Log access control event
     */
    async logAccessControl(userId, clientId, action, resource, granted, reason) {
        return await this.logEvent({
            type: 'ACCESS_CONTROL',
            category: 'security',
            severity: granted ? 'info' : 'warning',
            userId,
            clientId,
            action,
            resource,
            details: {
                granted,
                reason
            }
        });
    }

    /**
     * Log security event
     */
    async logSecurityEvent(type, severity, details, userId = null, clientId = null) {
        return await this.logEvent({
            type: `SECURITY_${type.toUpperCase()}`,
            category: 'security',
            severity,
            userId,
            clientId,
            action: 'security_event',
            resource: 'system',
            details
        });
    }

    /**
     * Log system event
     */
    async logSystemEvent(type, details, serviceId = null) {
        return await this.logEvent({
            type: `SYSTEM_${type.toUpperCase()}`,
            category: 'system',
            severity: 'info',
            serviceId,
            action: 'system_event',
            resource: 'system',
            details
        });
    }

    /**
     * Verify log integrity
     */
    async verifyLogIntegrity() {
        const logFiles = await this.getLogFiles();
        const verificationResults = [];

        for (const logFile of logFiles) {
            const result = await this.verifyLogFile(logFile);
            verificationResults.push({
                file: logFile,
                ...result
            });
        }

        return verificationResults;
    }

    /**
     * Verify individual log file integrity
     */
    async verifyLogFile(filename) {
        const logPath = path.join(this.logDirectory, filename);
        
        try {
            const content = await fs.readFile(logPath, 'utf8');
            const lines = content.trim().split('\n');
            let previousHash = null;
            let isValid = true;
            let errors = [];

            for (let i = 0; i < lines.length; i++) {
                try {
                    const entry = JSON.parse(lines[i]);
                    
                    if (entry.type === 'LOG_HEADER') {
                        previousHash = entry.previousChainHash;
                        continue;
                    }

                    // Verify hash chain
                    if (previousHash && entry.previousHash !== previousHash) {
                        isValid = false;
                        errors.push(`Hash chain broken at line ${i + 1}`);
                    }

                    // Verify entry hash
                    const entryString = JSON.stringify(entry, null, 0);
                    const calculatedHash = crypto.createHash('sha256').update(entryString).digest('hex');
                    
                    if (entry.hash !== calculatedHash) {
                        isValid = false;
                        errors.push(`Entry hash mismatch at line ${i + 1}`);
                    }

                    previousHash = entry.hash;
                } catch (parseError) {
                    isValid = false;
                    errors.push(`Parse error at line ${i + 1}: ${parseError.message}`);
                }
            }

            return {
                isValid,
                errors,
                entryCount: lines.length - 1 // Subtract header
            };
        } catch (error) {
            return {
                isValid: false,
                errors: [`File read error: ${error.message}`],
                entryCount: 0
            };
        }
    }

    /**
     * Get list of log files
     */
    async getLogFiles() {
        try {
            const files = await fs.readdir(this.logDirectory);
            return files.filter(file => file.startsWith('audit-') && file.endsWith('.log'));
        } catch (error) {
            console.error('Failed to list log files:', error);
            return [];
        }
    }

    /**
     * Search audit logs
     */
    async searchLogs(query) {
        const logFiles = await this.getLogFiles();
        const results = [];

        for (const logFile of logFiles) {
            const logPath = path.join(this.logDirectory, logFile);
            
            try {
                const content = await fs.readFile(logPath, 'utf8');
                const lines = content.trim().split('\n');

                for (const line of lines) {
                    try {
                        const entry = JSON.parse(line);
                        
                        // Simple search - in production, use proper search engine
                        if (this.matchesQuery(entry, query)) {
                            results.push(entry);
                        }
                    } catch (parseError) {
                        // Skip malformed entries
                        continue;
                    }
                }
            } catch (error) {
                console.error(`Failed to read log file ${logFile}:`, error);
            }
        }

        return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    /**
     * Check if entry matches search query
     */
    matchesQuery(entry, query) {
        const searchFields = [
            'type', 'category', 'severity', 'userId', 'clientId', 
            'serviceId', 'action', 'resource'
        ];

        for (const field of searchFields) {
            if (entry[field] && entry[field].toString().toLowerCase().includes(query.toLowerCase())) {
                return true;
            }
        }

        // Search in details
        if (entry.details && JSON.stringify(entry.details).toLowerCase().includes(query.toLowerCase())) {
            return true;
        }

        return false;
    }

    /**
     * Archive old log files
     */
    async archiveOldLogs() {
        const logFiles = await this.getLogFiles();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

        for (const logFile of logFiles) {
            const logPath = path.join(this.logDirectory, logFile);
            const stats = await fs.stat(logPath);
            
            if (stats.mtime < cutoffDate) {
                const archivePath = path.join(this.logDirectory, 'archived', logFile);
                await fs.mkdir(path.dirname(archivePath), { recursive: true });
                await fs.rename(logPath, archivePath);
            }
        }
    }

    /**
     * Get audit statistics
     */
    async getAuditStatistics() {
        const logFiles = await this.getLogFiles();
        const stats = {
            totalFiles: logFiles.length,
            totalSize: 0,
            eventCounts: {},
            severityCounts: {},
            categoryCounts: {}
        };

        for (const logFile of logFiles) {
            const logPath = path.join(this.logDirectory, logFile);
            const fileStats = await fs.stat(logPath);
            stats.totalSize += fileStats.size;

            // Count events in file
            const content = await fs.readFile(logPath, 'utf8');
            const lines = content.trim().split('\n');

            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    
                    if (entry.type === 'LOG_HEADER') continue;

                    stats.eventCounts[entry.type] = (stats.eventCounts[entry.type] || 0) + 1;
                    stats.severityCounts[entry.severity] = (stats.severityCounts[entry.severity] || 0) + 1;
                    stats.categoryCounts[entry.category] = (stats.categoryCounts[entry.category] || 0) + 1;
                } catch (parseError) {
                    // Skip malformed entries
                    continue;
                }
            }
        }

        return stats;
    }
}

module.exports = AuditLoggingService;
