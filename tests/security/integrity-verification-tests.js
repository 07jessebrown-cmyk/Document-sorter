/**
 * Integrity Verification Test Suite
 * Tests file integrity, audit log immutability, and tamper detection
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class IntegrityVerificationTestSuite {
    constructor() {
        this.testResults = [];
        this.tempDir = path.join(__dirname, 'temp-integrity');
        this.testFiles = [];
        this.setupTestEnvironment();
    }

    async setupTestEnvironment() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
            
            // Create test files with different content
            this.testFiles = [
                {
                    name: 'document1.pdf',
                    path: path.join(this.tempDir, 'document1.pdf'),
                    content: Buffer.from('PDF Document 1 - Original Content')
                },
                {
                    name: 'document2.txt',
                    path: path.join(this.tempDir, 'document2.txt'),
                    content: Buffer.from('Text Document 2 - Sensitive Information')
                },
                {
                    name: 'image1.jpg',
                    path: path.join(this.tempDir, 'image1.jpg'),
                    content: Buffer.from('JPEG Image 1 - Binary Data')
                }
            ];

            // Create test files
            for (const file of this.testFiles) {
                await fs.writeFile(file.path, file.content);
            }

            console.log('Integrity verification test environment setup complete');
        } catch (error) {
            console.error('Failed to setup integrity test environment:', error);
            throw error;
        }
    }

    /**
     * Run all integrity verification tests
     */
    async runIntegrityTests() {
        console.log('🔍 Starting Integrity Verification Test Suite...\n');

        const testCategories = [
            { name: 'File Hash Verification', tests: this.fileHashTests },
            { name: 'Multi-Algorithm Hash Testing', tests: this.multiHashTests },
            { name: 'Audit Log Integrity', tests: this.auditLogTests },
            { name: 'Tamper Detection', tests: this.tamperDetectionTests },
            { name: 'Bulk Verification', tests: this.bulkVerificationTests },
            { name: 'Hash Chain Verification', tests: this.hashChainTests },
            { name: 'Performance Testing', tests: this.performanceTests }
        ];

        for (const category of testCategories) {
            console.log(`\n📋 ${category.name}:`);
            console.log('-'.repeat(40));
            
            for (const test of category.tests) {
                await this.runTest(test);
            }
        }

        this.generateIntegrityReport();
    }

    async runTest(test) {
        const startTime = Date.now();
        let result = {
            name: test.name,
            category: test.category,
            status: 'PASSED',
            duration: 0,
            error: null,
            details: {}
        };

        try {
            console.log(`  ✓ ${test.name}`);
            const testResult = await test.function();
            result.duration = Date.now() - startTime;
            result.details = testResult || {};
        } catch (error) {
            result.status = 'FAILED';
            result.error = error.message;
            result.duration = Date.now() - startTime;
            console.log(`  ✗ ${test.name} - ${error.message}`);
        }

        this.testResults.push(result);
    }

    /**
     * File Hash Verification Tests
     */
    get fileHashTests() {
        return [
            {
                name: 'SHA-256 Hash Generation and Verification',
                category: 'File Hash',
                function: async () => {
                    const FileIntegrityService = require('../../src/services/fileIntegrityService');
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    const testFile = this.testFiles[0];
                    const result = await integrityService.storeFileHash('test-file-1', testFile.path, { test: true });
                    
                    // Verify hash was generated
                    if (!result.hashes.sha256) {
                        throw new Error('SHA-256 hash not generated');
                    }
                    
                    // Verify file integrity
                    const verification = await integrityService.verifyFileIntegrity('test-file-1', testFile.path);
                    if (!verification.verified) {
                        throw new Error('File integrity verification failed');
                    }
                    
                    return {
                        hashLength: result.hashes.sha256.length,
                        verificationTime: verification.verificationTime
                    };
                }
            },
            {
                name: 'SHA-512 Hash Generation and Verification',
                category: 'File Hash',
                function: async () => {
                    const FileIntegrityService = require('../../src/services/fileIntegrityService');
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    const testFile = this.testFiles[1];
                    const result = await integrityService.storeFileHash('test-file-2', testFile.path, { test: true });
                    
                    // Verify SHA-512 hash was generated
                    if (!result.hashes.sha512) {
                        throw new Error('SHA-512 hash not generated');
                    }
                    
                    // Verify file integrity
                    const verification = await integrityService.verifyFileIntegrity('test-file-2', testFile.path);
                    if (!verification.verified) {
                        throw new Error('File integrity verification failed');
                    }
                    
                    return {
                        hashLength: result.hashes.sha512.length,
                        verificationTime: verification.verificationTime
                    };
                }
            },
            {
                name: 'BLAKE2B Hash Generation and Verification',
                category: 'File Hash',
                function: async () => {
                    const FileIntegrityService = require('../../src/services/fileIntegrityService');
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    const testFile = this.testFiles[2];
                    const result = await integrityService.storeFileHash('test-file-3', testFile.path, { test: true });
                    
                    // Verify BLAKE2B hash was generated
                    if (!result.hashes.blake2b) {
                        throw new Error('BLAKE2B hash not generated');
                    }
                    
                    // Verify file integrity
                    const verification = await integrityService.verifyFileIntegrity('test-file-3', testFile.path);
                    if (!verification.verified) {
                        throw new Error('File integrity verification failed');
                    }
                    
                    return {
                        hashLength: result.hashes.blake2b.length,
                        verificationTime: verification.verificationTime
                    };
                }
            },
            {
                name: 'MD5 Hash Generation and Verification',
                category: 'File Hash',
                function: async () => {
                    const FileIntegrityService = require('../../src/services/fileIntegrityService');
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    const testFile = this.testFiles[0];
                    const result = await integrityService.storeFileHash('test-file-4', testFile.path, { test: true });
                    
                    // Verify MD5 hash was generated
                    if (!result.hashes.md5) {
                        throw new Error('MD5 hash not generated');
                    }
                    
                    // Verify file integrity
                    const verification = await integrityService.verifyFileIntegrity('test-file-4', testFile.path);
                    if (!verification.verified) {
                        throw new Error('File integrity verification failed');
                    }
                    
                    return {
                        hashLength: result.hashes.md5.length,
                        verificationTime: verification.verificationTime
                    };
                }
            }
        ];
    }

    /**
     * Multi-Algorithm Hash Testing
     */
    get multiHashTests() {
        return [
            {
                name: 'Consistent Hash Generation Across Algorithms',
                category: 'Multi-Hash',
                function: async () => {
                    const FileIntegrityService = require('../../src/services/fileIntegrityService');
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    const testFile = this.testFiles[0];
                    const result1 = await integrityService.storeFileHash('test-consistency-1', testFile.path, { test: true });
                    const result2 = await integrityService.storeFileHash('test-consistency-2', testFile.path, { test: true });
                    
                    // Verify hashes are consistent
                    for (const algorithm of ['sha256', 'sha512', 'blake2b', 'md5']) {
                        if (result1.hashes[algorithm] !== result2.hashes[algorithm]) {
                            throw new Error(`Hash inconsistency detected for ${algorithm}`);
                        }
                    }
                    
                    return {
                        algorithms: Object.keys(result1.hashes),
                        consistencyCheck: true
                    };
                }
            },
            {
                name: 'Hash Uniqueness for Different Files',
                category: 'Multi-Hash',
                function: async () => {
                    const FileIntegrityService = require('../../src/services/fileIntegrityService');
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    const result1 = await integrityService.storeFileHash('test-unique-1', this.testFiles[0].path, { test: true });
                    const result2 = await integrityService.storeFileHash('test-unique-2', this.testFiles[1].path, { test: true });
                    
                    // Verify hashes are different for different files
                    for (const algorithm of ['sha256', 'sha512', 'blake2b', 'md5']) {
                        if (result1.hashes[algorithm] === result2.hashes[algorithm]) {
                            throw new Error(`Hash collision detected for ${algorithm}`);
                        }
                    }
                    
                    return {
                        algorithms: Object.keys(result1.hashes),
                        uniquenessCheck: true
                    };
                }
            },
            {
                name: 'Hash Collision Resistance',
                category: 'Multi-Hash',
                function: async () => {
                    // Test with files that have similar content but different data
                    const similarFile1 = path.join(this.tempDir, 'similar1.txt');
                    const similarFile2 = path.join(this.tempDir, 'similar2.txt');
                    
                    await fs.writeFile(similarFile1, Buffer.from('Similar content 1'));
                    await fs.writeFile(similarFile2, Buffer.from('Similar content 2'));
                    
                    const FileIntegrityService = require('../../src/services/fileIntegrityService');
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    const result1 = await integrityService.storeFileHash('similar-1', similarFile1, { test: true });
                    const result2 = await integrityService.storeFileHash('similar-2', similarFile2, { test: true });
                    
                    // Verify hashes are different even for similar content
                    for (const algorithm of ['sha256', 'sha512', 'blake2b', 'md5']) {
                        if (result1.hashes[algorithm] === result2.hashes[algorithm]) {
                            throw new Error(`Hash collision detected for similar content with ${algorithm}`);
                        }
                    }
                    
                    return {
                        algorithms: Object.keys(result1.hashes),
                        collisionResistance: true
                    };
                }
            }
        ];
    }

    /**
     * Audit Log Integrity Tests
     */
    get auditLogTests() {
        return [
            {
                name: 'Audit Log Immutability Verification',
                category: 'Audit Log',
                function: async () => {
                    const AuditLoggingService = require('../../src/services/auditLoggingService');
                    const auditService = new AuditLoggingService({ 
                        logDirectory: path.join(this.tempDir, 'audit-logs') 
                    });
                    
                    // Log multiple events
                    const events = [];
                    for (let i = 0; i < 10; i++) {
                        const result = await auditService.logFileUpload(
                            `user${i}`, 
                            'client1', 
                            `file${i}`, 
                            'test.pdf', 
                            1024, 
                            '127.0.0.1', 
                            'test-agent'
                        );
                        events.push(result);
                    }
                    
                    // Verify log integrity
                    const integrityResults = await auditService.verifyLogIntegrity();
                    const failedFiles = integrityResults.filter(result => !result.isValid);
                    
                    if (failedFiles.length > 0) {
                        throw new Error(`Audit log integrity verification failed: ${failedFiles.length} files invalid`);
                    }
                    
                    return {
                        eventsLogged: events.length,
                        logFiles: integrityResults.length,
                        integrityPassed: true
                    };
                }
            },
            {
                name: 'Hash Chain Verification',
                category: 'Audit Log',
                function: async () => {
                    const AuditLoggingService = require('../../src/services/auditLoggingService');
                    const auditService = new AuditLoggingService({ 
                        logDirectory: path.join(this.tempDir, 'audit-logs2') 
                    });
                    
                    // Log events to create a chain
                    const events = [];
                    for (let i = 0; i < 5; i++) {
                        const result = await auditService.logAuthentication(
                            `user${i}`, 
                            'client1', 
                            'login', 
                            true, 
                            '127.0.0.1', 
                            'test-agent'
                        );
                        events.push(result);
                    }
                    
                    // Verify hash chain integrity
                    const integrityResults = await auditService.verifyLogIntegrity();
                    for (const result of integrityResults) {
                        if (!result.isValid) {
                            throw new Error(`Hash chain verification failed: ${result.errors.join(', ')}`);
                        }
                    }
                    
                    return {
                        chainLength: events.length,
                        chainIntegrity: true
                    };
                }
            },
            {
                name: 'Tamper Detection in Audit Logs',
                category: 'Audit Log',
                function: async () => {
                    const AuditLoggingService = require('../../src/services/auditLoggingService');
                    const auditService = new AuditLoggingService({ 
                        logDirectory: path.join(this.tempDir, 'audit-logs3') 
                    });
                    
                    // Log some events
                    await auditService.logFileUpload('user1', 'client1', 'file1', 'test.pdf', 1024, '127.0.0.1', 'test-agent');
                    await auditService.logAuthentication('user1', 'client1', 'login', true, '127.0.0.1', 'test-agent');
                    
                    // Tamper with log file
                    const logFiles = await auditService.getLogFiles();
                    if (logFiles.length > 0) {
                        const logPath = path.join(auditService.logDirectory, logFiles[0]);
                        const content = await fs.readFile(logPath, 'utf8');
                        const tamperedContent = content.replace('user1', 'hacker');
                        await fs.writeFile(logPath, tamperedContent);
                        
                        // Verify tamper detection
                        const integrityResults = await auditService.verifyLogIntegrity();
                        const failedFiles = integrityResults.filter(result => !result.isValid);
                        
                        if (failedFiles.length === 0) {
                            throw new Error('Tamper detection failed - modified log not detected');
                        }
                        
                        return {
                            tamperDetected: true,
                            failedFiles: failedFiles.length
                        };
                    }
                    
                    return { tamperDetected: false };
                }
            }
        ];
    }

    /**
     * Tamper Detection Tests
     */
    get tamperDetectionTests() {
        return [
            {
                name: 'File Content Tampering Detection',
                category: 'Tamper Detection',
                function: async () => {
                    const FileIntegrityService = require('../../src/services/fileIntegrityService');
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    const testFile = this.testFiles[0];
                    const result = await integrityService.storeFileHash('tamper-test-1', testFile.path, { test: true });
                    
                    // Tamper with file content
                    await fs.writeFile(testFile.path, Buffer.from('Tampered content'));
                    
                    // Verify tamper detection
                    const verification = await integrityService.verifyFileIntegrity('tamper-test-1', testFile.path);
                    if (verification.verified) {
                        throw new Error('File tampering not detected');
                    }
                    
                    return {
                        tamperDetected: true,
                        originalHash: result.hashes.sha256,
                        tamperedHash: verification.hashes?.sha256
                    };
                }
            },
            {
                name: 'File Size Tampering Detection',
                category: 'Tamper Detection',
                function: async () => {
                    const FileIntegrityService = require('../../src/services/fileIntegrityService');
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    const testFile = this.testFiles[1];
                    const result = await integrityService.storeFileHash('tamper-test-2', testFile.path, { test: true });
                    
                    // Tamper with file size (add content)
                    const originalContent = await fs.readFile(testFile.path);
                    const tamperedContent = Buffer.concat([originalContent, Buffer.from('Additional content')]);
                    await fs.writeFile(testFile.path, tamperedContent);
                    
                    // Verify tamper detection
                    const verification = await integrityService.verifyFileIntegrity('tamper-test-2', testFile.path);
                    if (verification.verified) {
                        throw new Error('File size tampering not detected');
                    }
                    
                    return {
                        tamperDetected: true,
                        originalSize: result.size,
                        tamperedSize: tamperedContent.length
                    };
                }
            },
            {
                name: 'File Metadata Tampering Detection',
                category: 'Tamper Detection',
                function: async () => {
                    const FileIntegrityService = require('../../src/services/fileIntegrityService');
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    const testFile = this.testFiles[2];
                    const result = await integrityService.storeFileHash('tamper-test-3', testFile.path, { test: true });
                    
                    // Tamper with file permissions (simulate)
                    const stats = await fs.stat(testFile.path);
                    const originalMode = stats.mode;
                    
                    // Change file mode
                    await fs.chmod(testFile.path, 0o777);
                    
                    // Verify tamper detection (this might not be detected by hash alone)
                    const verification = await integrityService.verifyFileIntegrity('tamper-test-3', testFile.path);
                    
                    // Restore original permissions
                    await fs.chmod(testFile.path, originalMode);
                    
                    return {
                        tamperDetected: !verification.verified,
                        originalMode: originalMode.toString(8),
                        tamperedMode: '777'
                    };
                }
            }
        ];
    }

    /**
     * Bulk Verification Tests
     */
    get bulkVerificationTests() {
        return [
            {
                name: 'Bulk File Integrity Verification',
                category: 'Bulk Verification',
                function: async () => {
                    const FileIntegrityService = require('../../src/services/fileIntegrityService');
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    // Store multiple file hashes
                    const fileIds = [];
                    for (let i = 0; i < this.testFiles.length; i++) {
                        const fileId = `bulk-test-${i}`;
                        await integrityService.storeFileHash(fileId, this.testFiles[i].path, { test: true });
                        fileIds.push(fileId);
                    }
                    
                    // Verify all files
                    const bulkVerification = await integrityService.verifyAllFilesIntegrity();
                    const failedFiles = bulkVerification.results.filter(result => !result.verified);
                    
                    if (failedFiles.length > 0) {
                        throw new Error(`Bulk verification failed: ${failedFiles.length} files failed`);
                    }
                    
                    return {
                        totalFiles: fileIds.length,
                        verifiedFiles: bulkVerification.results.length,
                        failedFiles: failedFiles.length
                    };
                }
            },
            {
                name: 'Performance Under Load',
                category: 'Bulk Verification',
                function: async () => {
                    const FileIntegrityService = require('../../src/services/fileIntegrityService');
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    // Create multiple test files
                    const testFiles = [];
                    for (let i = 0; i < 20; i++) {
                        const filePath = path.join(this.tempDir, `load-test-${i}.txt`);
                        const content = Buffer.from(`Load test file ${i} - ${'x'.repeat(1000)}`);
                        await fs.writeFile(filePath, content);
                        testFiles.push({ path: filePath, id: `load-test-${i}` });
                    }
                    
                    // Store hashes for all files
                    const startTime = Date.now();
                    for (const file of testFiles) {
                        await integrityService.storeFileHash(file.id, file.path, { test: true });
                    }
                    const storeTime = Date.now() - startTime;
                    
                    // Verify all files
                    const verifyStartTime = Date.now();
                    const bulkVerification = await integrityService.verifyAllFilesIntegrity();
                    const verifyTime = Date.now() - verifyStartTime;
                    
                    const failedFiles = bulkVerification.results.filter(result => !result.verified);
                    if (failedFiles.length > 0) {
                        throw new Error(`Load test verification failed: ${failedFiles.length} files failed`);
                    }
                    
                    return {
                        filesProcessed: testFiles.length,
                        storeTime: storeTime,
                        verifyTime: verifyTime,
                        totalTime: storeTime + verifyTime,
                        avgTimePerFile: (storeTime + verifyTime) / testFiles.length
                    };
                }
            }
        ];
    }

    /**
     * Hash Chain Verification Tests
     */
    get hashChainTests() {
        return [
            {
                name: 'Hash Chain Integrity',
                category: 'Hash Chain',
                function: async () => {
                    const AuditLoggingService = require('../../src/services/auditLoggingService');
                    const auditService = new AuditLoggingService({ 
                        logDirectory: path.join(this.tempDir, 'hash-chain-logs') 
                    });
                    
                    // Create a chain of events
                    const events = [];
                    for (let i = 0; i < 10; i++) {
                        const result = await auditService.logFileUpload(
                            `user${i}`, 
                            'client1', 
                            `file${i}`, 
                            'test.pdf', 
                            1024, 
                            '127.0.0.1', 
                            'test-agent'
                        );
                        events.push(result);
                    }
                    
                    // Verify chain integrity
                    const integrityResults = await auditService.verifyLogIntegrity();
                    let chainBroken = false;
                    let chainErrors = [];
                    
                    for (const result of integrityResults) {
                        if (!result.isValid) {
                            chainBroken = true;
                            chainErrors.push(...result.errors);
                        }
                    }
                    
                    if (chainBroken) {
                        throw new Error(`Hash chain integrity failed: ${chainErrors.join(', ')}`);
                    }
                    
                    return {
                        chainLength: events.length,
                        chainIntegrity: true,
                        logFiles: integrityResults.length
                    };
                }
            },
            {
                name: 'Hash Chain Tamper Detection',
                category: 'Hash Chain',
                function: async () => {
                    const AuditLoggingService = require('../../src/services/auditLoggingService');
                    const auditService = new AuditLoggingService({ 
                        logDirectory: path.join(this.tempDir, 'hash-chain-tamper-logs') 
                    });
                    
                    // Create a chain of events
                    for (let i = 0; i < 5; i++) {
                        await auditService.logAuthentication(
                            `user${i}`, 
                            'client1', 
                            'login', 
                            true, 
                            '127.0.0.1', 
                            'test-agent'
                        );
                    }
                    
                    // Tamper with a log file
                    const logFiles = await auditService.getLogFiles();
                    if (logFiles.length > 0) {
                        const logPath = path.join(auditService.logDirectory, logFiles[0]);
                        const content = await fs.readFile(logPath, 'utf8');
                        const lines = content.trim().split('\n');
                        
                        // Modify a line in the middle of the chain
                        if (lines.length > 2) {
                            const tamperedLine = lines[2].replace('user1', 'hacker');
                            lines[2] = tamperedLine;
                            await fs.writeFile(logPath, lines.join('\n'));
                        }
                        
                        // Verify tamper detection
                        const integrityResults = await auditService.verifyLogIntegrity();
                        const failedFiles = integrityResults.filter(result => !result.isValid);
                        
                        if (failedFiles.length === 0) {
                            throw new Error('Hash chain tamper detection failed');
                        }
                        
                        return {
                            tamperDetected: true,
                            failedFiles: failedFiles.length,
                            chainBroken: true
                        };
                    }
                    
                    return { tamperDetected: false };
                }
            }
        ];
    }

    /**
     * Performance Tests
     */
    get performanceTests() {
        return [
            {
                name: 'Hash Generation Performance',
                category: 'Performance',
                function: async () => {
                    const FileIntegrityService = require('../../src/services/fileIntegrityService');
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    // Test with different file sizes
                    const fileSizes = [1024, 10240, 102400, 1024000]; // 1KB, 10KB, 100KB, 1MB
                    const results = [];
                    
                    for (const size of fileSizes) {
                        const filePath = path.join(this.tempDir, `perf-test-${size}.bin`);
                        const content = Buffer.alloc(size, 'x');
                        await fs.writeFile(filePath, content);
                        
                        const startTime = Date.now();
                        const result = await integrityService.storeFileHash(`perf-${size}`, filePath, { test: true });
                        const duration = Date.now() - startTime;
                        
                        results.push({
                            size: size,
                            duration: duration,
                            throughput: (size / duration) * 1000 // bytes per second
                        });
                    }
                    
                    return {
                        fileSizes: results.map(r => r.size),
                        durations: results.map(r => r.duration),
                        throughputs: results.map(r => r.throughput)
                    };
                }
            },
            {
                name: 'Concurrent Hash Verification',
                category: 'Performance',
                function: async () => {
                    const FileIntegrityService = require('../../src/services/fileIntegrityService');
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    // Create multiple files
                    const files = [];
                    for (let i = 0; i < 10; i++) {
                        const filePath = path.join(this.tempDir, `concurrent-test-${i}.txt`);
                        const content = Buffer.from(`Concurrent test file ${i} - ${'x'.repeat(1000)}`);
                        await fs.writeFile(filePath, content);
                        files.push({ path: filePath, id: `concurrent-${i}` });
                    }
                    
                    // Store hashes
                    for (const file of files) {
                        await integrityService.storeFileHash(file.id, file.path, { test: true });
                    }
                    
                    // Verify all files concurrently
                    const startTime = Date.now();
                    const verificationPromises = files.map(file => 
                        integrityService.verifyFileIntegrity(file.id, file.path)
                    );
                    
                    const results = await Promise.all(verificationPromises);
                    const duration = Date.now() - startTime;
                    
                    const failedVerifications = results.filter(r => !r.verified);
                    if (failedVerifications.length > 0) {
                        throw new Error(`Concurrent verification failed: ${failedVerifications.length} files failed`);
                    }
                    
                    return {
                        filesVerified: results.length,
                        duration: duration,
                        avgTimePerFile: duration / results.length
                    };
                }
            }
        ];
    }

    /**
     * Generate integrity verification report
     */
    generateIntegrityReport() {
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.status === 'PASSED').length;
        const failedTests = this.testResults.filter(r => r.status === 'FAILED').length;
        const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0);

        console.log('\n' + '='.repeat(60));
        console.log('🔍 INTEGRITY VERIFICATION REPORT');
        console.log('='.repeat(60));
        console.log(`Total Tests: ${totalTests}`);
        console.log(`Passed: ${passedTests} ✅`);
        console.log(`Failed: ${failedTests} ❌`);
        console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
        console.log('='.repeat(60));

        if (failedTests > 0) {
            console.log('\n❌ FAILED TESTS:');
            this.testResults
                .filter(r => r.status === 'FAILED')
                .forEach(test => {
                    console.log(`  • ${test.name} (${test.category})`);
                    console.log(`    Error: ${test.error}`);
                });
        }

        // Generate detailed report
        const report = {
            summary: {
                totalTests,
                passedTests,
                failedTests,
                successRate: (passedTests / totalTests) * 100,
                totalDuration
            },
            results: this.testResults,
            timestamp: new Date().toISOString()
        };

        const reportPath = path.join(this.tempDir, 'integrity-verification-report.json');
        fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    }

    async cleanup() {
        try {
            await fs.rm(this.tempDir, { recursive: true, force: true });
            console.log('\n🧹 Integrity verification test environment cleaned up');
        } catch (error) {
            console.error('Failed to cleanup integrity test environment:', error);
        }
    }
}

module.exports = IntegrityVerificationTestSuite;
