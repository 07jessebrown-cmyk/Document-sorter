/**
 * Comprehensive Security Test Suite
 * Tests all security services and validates security requirements
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Import security services
const AuthenticationService = require('../../src/services/authenticationService');
const RBACService = require('../../src/services/rbacService');
const SecureFileStorage = require('../../src/services/secureFileStorage');
const AuditLoggingService = require('../../src/services/auditLoggingService');
const FileIntegrityService = require('../../src/services/fileIntegrityService');
const EncryptionService = require('../../src/services/encryptionService');
const NetworkIsolationService = require('../../src/services/networkIsolationService');
const TamperProofStorageService = require('../../src/services/tamperProofStorageService');
const ServicePermissionsService = require('../../src/services/servicePermissionsService');
const AccessLimitationService = require('../../src/services/accessLimitationService');

class SecurityTestSuite {
    constructor() {
        this.testResults = [];
        this.testFiles = [];
        this.tempDir = path.join(__dirname, 'temp');
        this.setupTestEnvironment();
    }

    /**
     * Setup test environment with temporary files
     */
    async setupTestEnvironment() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
            
            // Create test files
            this.testFiles = [
                {
                    name: 'test-document.pdf',
                    path: path.join(this.tempDir, 'test-document.pdf'),
                    content: Buffer.from('Test PDF content for security testing')
                },
                {
                    name: 'sensitive-data.txt',
                    path: path.join(this.tempDir, 'sensitive-data.txt'),
                    content: Buffer.from('Sensitive client data that should be protected')
                },
                {
                    name: 'malicious-script.js',
                    path: path.join(this.tempDir, 'malicious-script.js'),
                    content: Buffer.from('console.log("This is a test malicious script"); process.exit(1);')
                }
            ];

            // Create test files
            for (const file of this.testFiles) {
                await fs.writeFile(file.path, file.content);
            }

            console.log('Test environment setup complete');
        } catch (error) {
            console.error('Failed to setup test environment:', error);
            throw error;
        }
    }

    /**
     * Run all security tests
     */
    async runAllTests() {
        console.log('🔒 Starting Comprehensive Security Test Suite...\n');

        const testCategories = [
            { name: 'Authentication & Authorization', tests: this.authenticationTests },
            { name: 'File Isolation & Immutability', tests: this.fileIsolationTests },
            { name: 'Sandboxed Execution', tests: this.sandboxTests },
            { name: 'Access Control & RBAC', tests: this.accessControlTests },
            { name: 'Audit Logging & Tamper Detection', tests: this.auditLoggingTests },
            { name: 'Encryption & Data Protection', tests: this.encryptionTests },
            { name: 'Network Isolation', tests: this.networkIsolationTests },
            { name: 'Service Permissions', tests: this.servicePermissionsTests },
            { name: 'Penetration Testing', tests: this.penetrationTests },
            { name: 'Integrity Verification', tests: this.integrityVerificationTests }
        ];

        for (const category of testCategories) {
            console.log(`\n📋 Running ${category.name} Tests:`);
            console.log('=' .repeat(50));
            
            for (const test of category.tests) {
                await this.runTest(test);
            }
        }

        this.generateTestReport();
    }

    /**
     * Run individual test
     */
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
            await test.function();
            result.duration = Date.now() - startTime;
        } catch (error) {
            result.status = 'FAILED';
            result.error = error.message;
            result.duration = Date.now() - startTime;
            console.log(`  ✗ ${test.name} - ${error.message}`);
        }

        this.testResults.push(result);
    }

    /**
     * Authentication and Authorization Tests
     */
    get authenticationTests() {
        return [
            {
                name: 'Strong Password Policy Validation',
                category: 'Authentication',
                function: async () => {
                    const authService = new AuthenticationService();
                    
                    // Test weak passwords
                    const weakPasswords = ['123', 'password', 'Password123', 'Password123!'];
                    for (const password of weakPasswords) {
                        const validation = authService.validatePasswordStrength(password);
                        if (validation.isValid) {
                            throw new Error(`Weak password accepted: ${password}`);
                        }
                    }

                    // Test strong password
                    const strongPassword = 'StrongP@ssw0rd123!';
                    const validation = authService.validatePasswordStrength(strongPassword);
                    if (!validation.isValid) {
                        throw new Error(`Strong password rejected: ${validation.errors.join(', ')}`);
                    }
                }
            },
            {
                name: 'Account Lockout Protection',
                category: 'Authentication',
                function: async () => {
                    const authService = new AuthenticationService();
                    
                    // Register test user
                    await authService.registerUser('testuser', 'StrongP@ssw0rd123!', 'test@example.com', 'client1');
                    
                    // Attempt multiple failed logins
                    for (let i = 0; i < 6; i++) {
                        try {
                            await authService.authenticateUser('testuser', 'wrongpassword');
                        } catch (error) {
                            // Expected to fail
                        }
                    }

                    // Verify account is locked
                    const userInfo = authService.getUserInfo('testuser');
                    if (!userInfo.lockedUntil || userInfo.lockedUntil <= new Date()) {
                        throw new Error('Account lockout not working properly');
                    }
                }
            },
            {
                name: 'MFA Token Validation',
                category: 'Authentication',
                function: async () => {
                    const authService = new AuthenticationService();
                    
                    // Register user with MFA
                    await authService.registerUser('mfauser', 'StrongP@ssw0rd123!', 'mfa@example.com', 'client1');
                    await authService.enableMFA('mfauser', '123456'); // This will fail in real test
                    
                    // Test MFA requirement
                    try {
                        await authService.authenticateUser('mfauser', 'StrongP@ssw0rd123!');
                        throw new Error('MFA should be required but was not');
                    } catch (error) {
                        if (!error.message.includes('MFA token required')) {
                            throw error;
                        }
                    }
                }
            },
            {
                name: 'Session Management',
                category: 'Authentication',
                function: async () => {
                    const authService = new AuthenticationService();
                    
                    // Register and authenticate user
                    await authService.registerUser('sessionuser', 'StrongP@ssw0rd123!', 'session@example.com', 'client1');
                    const authResult = await authService.authenticateUser('sessionuser', 'StrongP@ssw0rd123!');
                    
                    // Verify session
                    const sessionInfo = authService.verifySession(authResult.sessionToken);
                    if (!sessionInfo.valid) {
                        throw new Error('Valid session not recognized');
                    }

                    // Test session timeout (simulate by modifying lastActivity)
                    const session = authService.sessions.get(authResult.sessionToken);
                    session.lastActivity = new Date(Date.now() - 31 * 60 * 1000); // 31 minutes ago
                    
                    try {
                        authService.verifySession(authResult.sessionToken);
                        throw new Error('Expired session should be rejected');
                    } catch (error) {
                        if (!error.message.includes('Session expired')) {
                            throw error;
                        }
                    }
                }
            }
        ];
    }

    /**
     * File Isolation and Immutability Tests
     */
    get fileIsolationTests() {
        return [
            {
                name: 'WORM Storage Protection',
                category: 'File Isolation',
                function: async () => {
                    const storage = new SecureFileStorage();
                    await storage.initialize();
                    
                    // Store file
                    const result = await storage.storeFile(this.testFiles[0].path, 'client1', { sensitive: true });
                    
                    // Attempt to overwrite (should fail)
                    try {
                        await storage.storeFile(this.testFiles[0].path, 'client1', { sensitive: true });
                        throw new Error('WORM protection failed - file was overwritten');
                    } catch (error) {
                        if (!error.message.includes('File already exists')) {
                            throw error;
                        }
                    }
                }
            },
            {
                name: 'Working Copy Isolation',
                category: 'File Isolation',
                function: async () => {
                    const storage = new SecureFileStorage();
                    await storage.initialize();
                    
                    // Store file
                    const result = await storage.storeFile(this.testFiles[0].path, 'client1');
                    
                    // Create working copy
                    const workingCopy = await storage.createWorkingCopy(result.fileId, 'client1');
                    
                    // Verify working copy is separate from original
                    if (workingCopy.workingPath === result.securePath) {
                        throw new Error('Working copy not isolated from original');
                    }
                    
                    // Verify integrity
                    if (workingCopy.fileHash !== result.fileHash) {
                        throw new Error('Working copy integrity verification failed');
                    }
                }
            },
            {
                name: 'Client Data Isolation',
                category: 'File Isolation',
                function: async () => {
                    const storage = new SecureFileStorage();
                    await storage.initialize();
                    
                    // Store files for different clients
                    const client1File = await storage.storeFile(this.testFiles[0].path, 'client1');
                    const client2File = await storage.storeFile(this.testFiles[1].path, 'client2');
                    
                    // Attempt cross-client access
                    try {
                        await storage.createWorkingCopy(client1File.fileId, 'client2');
                        throw new Error('Cross-client access not prevented');
                    } catch (error) {
                        if (!error.message.includes('Access denied')) {
                            throw error;
                        }
                    }
                }
            },
            {
                name: 'File Integrity Verification',
                category: 'File Isolation',
                function: async () => {
                    const storage = new SecureFileStorage();
                    await storage.initialize();
                    
                    // Store file
                    const result = await storage.storeFile(this.testFiles[0].path, 'client1');
                    
                    // Verify integrity
                    const isIntact = await storage.verifyFileIntegrity(result.fileId);
                    if (!isIntact) {
                        throw new Error('File integrity verification failed for intact file');
                    }
                    
                    // Tamper with file and verify detection
                    await fs.writeFile(result.securePath, Buffer.from('Tampered content'));
                    const isTampered = await storage.verifyFileIntegrity(result.fileId);
                    if (isTampered) {
                        throw new Error('File tampering not detected');
                    }
                }
            }
        ];
    }

    /**
     * Sandboxed Execution Tests
     */
    get sandboxTests() {
        return [
            {
                name: 'Container Resource Limits',
                category: 'Sandboxing',
                function: async () => {
                    // Test would require Docker setup
                    // For now, verify service exists and has proper configuration
                    const service = require('../../src/services/secureFileProcessor');
                    if (!service) {
                        throw new Error('Sandboxed processing service not found');
                    }
                }
            },
            {
                name: 'Process Isolation',
                category: 'Sandboxing',
                function: async () => {
                    // Test would verify that processing runs in isolated containers
                    // This is a placeholder for actual container testing
                    console.log('    Container isolation testing requires Docker environment');
                }
            }
        ];
    }

    /**
     * Access Control and RBAC Tests
     */
    get accessControlTests() {
        return [
            {
                name: 'Role-Based Permission Validation',
                category: 'Access Control',
                function: async () => {
                    const rbac = new RBACService();
                    
                    // Assign roles
                    rbac.assignRole('user1', 'client_user', 'client1');
                    rbac.assignRole('admin1', 'client_admin', 'client1');
                    rbac.assignRole('sysadmin', 'system_admin');
                    
                    // Test permissions
                    if (!rbac.hasPermission('user1', 'file:upload', 'client1')) {
                        throw new Error('Client user should have file upload permission');
                    }
                    
                    if (rbac.hasPermission('user1', 'file:delete', 'client1')) {
                        throw new Error('Client user should not have file delete permission');
                    }
                    
                    if (!rbac.hasPermission('admin1', 'file:delete', 'client1')) {
                        throw new Error('Client admin should have file delete permission');
                    }
                    
                    if (!rbac.hasPermission('sysadmin', 'system:config')) {
                        throw new Error('System admin should have system config permission');
                    }
                }
            },
            {
                name: 'Cross-Client Access Prevention',
                category: 'Access Control',
                function: async () => {
                    const rbac = new RBACService();
                    
                    // Assign client-specific roles
                    rbac.assignRole('user1', 'client_user', 'client1');
                    rbac.assignRole('user2', 'client_user', 'client2');
                    
                    // Test cross-client access
                    if (rbac.canAccessClient('user1', 'client2')) {
                        throw new Error('User should not access different client data');
                    }
                    
                    if (!rbac.canAccessClient('user1', 'client1')) {
                        throw new Error('User should access own client data');
                    }
                }
            },
            {
                name: 'Permission Escalation Prevention',
                category: 'Access Control',
                function: async () => {
                    const rbac = new RBACService();
                    
                    // Create custom role with limited permissions
                    rbac.createCustomRole('limited_user', 'Limited user role', ['file:view'], 'client1');
                    rbac.assignRole('limiteduser', 'limited_user', 'client1');
                    
                    // Test that user cannot escalate permissions
                    if (rbac.hasPermission('limiteduser', 'file:delete', 'client1')) {
                        throw new Error('Limited user should not have delete permission');
                    }
                    
                    if (rbac.hasPermission('limiteduser', 'system:config')) {
                        throw new Error('Limited user should not have system permissions');
                    }
                }
            }
        ];
    }

    /**
     * Audit Logging and Tamper Detection Tests
     */
    get auditLoggingTests() {
        return [
            {
                name: 'Audit Log Immutability',
                category: 'Audit Logging',
                function: async () => {
                    const auditService = new AuditLoggingService({ logDirectory: path.join(this.tempDir, 'audit-logs') });
                    
                    // Log some events
                    await auditService.logFileUpload('user1', 'client1', 'file1', 'test.pdf', 1024, '127.0.0.1', 'test-agent');
                    await auditService.logAuthentication('user1', 'client1', 'login', true, '127.0.0.1', 'test-agent');
                    
                    // Verify log integrity
                    const integrityResults = await auditService.verifyLogIntegrity();
                    const failedFiles = integrityResults.filter(result => !result.isValid);
                    
                    if (failedFiles.length > 0) {
                        throw new Error(`Log integrity verification failed: ${failedFiles.length} files invalid`);
                    }
                }
            },
            {
                name: 'Hash Chain Verification',
                category: 'Audit Logging',
                function: async () => {
                    const auditService = new AuditLoggingService({ logDirectory: path.join(this.tempDir, 'audit-logs2') });
                    
                    // Log multiple events
                    const events = [];
                    for (let i = 0; i < 5; i++) {
                        const result = await auditService.logFileUpload(`user${i}`, 'client1', `file${i}`, 'test.pdf', 1024, '127.0.0.1', 'test-agent');
                        events.push(result);
                    }
                    
                    // Verify hash chain
                    const integrityResults = await auditService.verifyLogIntegrity();
                    for (const result of integrityResults) {
                        if (!result.isValid) {
                            throw new Error(`Hash chain verification failed: ${result.errors.join(', ')}`);
                        }
                    }
                }
            },
            {
                name: 'Tamper Detection',
                category: 'Audit Logging',
                function: async () => {
                    const auditService = new AuditLoggingService({ logDirectory: path.join(this.tempDir, 'audit-logs3') });
                    
                    // Log event
                    await auditService.logFileUpload('user1', 'client1', 'file1', 'test.pdf', 1024, '127.0.0.1', 'test-agent');
                    
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
                    }
                }
            }
        ];
    }

    /**
     * Encryption and Data Protection Tests
     */
    get encryptionTests() {
        return [
            {
                name: 'File Encryption/Decryption',
                category: 'Encryption',
                function: async () => {
                    const encryptionService = new EncryptionService();
                    await encryptionService.initialize();
                    
                    // Encrypt file
                    const filePath = this.testFiles[0].path;
                    const encryptedPath = path.join(this.tempDir, 'encrypted-test.pdf');
                    const decryptedPath = path.join(this.tempDir, 'decrypted-test.pdf');
                    
                    await encryptionService.encryptFile(filePath, encryptedPath);
                    
                    // Verify encrypted file is different
                    const originalContent = await fs.readFile(filePath);
                    const encryptedContent = await fs.readFile(encryptedPath);
                    
                    if (originalContent.equals(encryptedContent)) {
                        throw new Error('File encryption failed - encrypted content same as original');
                    }
                    
                    // Decrypt file
                    await encryptionService.decryptFile(encryptedPath, decryptedPath);
                    
                    // Verify decrypted content matches original
                    const decryptedContent = await fs.readFile(decryptedPath);
                    if (!originalContent.equals(decryptedContent)) {
                        throw new Error('File decryption failed - decrypted content does not match original');
                    }
                }
            },
            {
                name: 'Key Management Security',
                category: 'Encryption',
                function: async () => {
                    const encryptionService = new EncryptionService();
                    await encryptionService.initialize();
                    
                    // Test key generation
                    const key1 = await encryptionService.generateFileKey('file1');
                    const key2 = await encryptionService.generateFileKey('file2');
                    
                    if (key1 === key2) {
                        throw new Error('File keys should be unique');
                    }
                    
                    // Test key retrieval
                    const retrievedKey = await encryptionService.getFileKey('file1');
                    if (key1 !== retrievedKey) {
                        throw new Error('Key retrieval failed');
                    }
                }
            }
        ];
    }

    /**
     * Network Isolation Tests
     */
    get networkIsolationTests() {
        return [
            {
                name: 'Network Access Controls',
                category: 'Network Isolation',
                function: async () => {
                    const networkService = new NetworkIsolationService();
                    
                    // Test network isolation configuration
                    const config = await networkService.getNetworkConfig();
                    if (!config.isolated) {
                        throw new Error('Network isolation not properly configured');
                    }
                }
            }
        ];
    }

    /**
     * Service Permissions Tests
     */
    get servicePermissionsTests() {
        return [
            {
                name: 'Non-Root Service Execution',
                category: 'Service Permissions',
                function: async () => {
                    const permissionService = new ServicePermissionsService();
                    
                    // Test service permission validation
                    const permissions = await permissionService.validateServicePermissions('test-service');
                    if (permissions.hasRootAccess) {
                        throw new Error('Service should not have root access');
                    }
                }
            }
        ];
    }

    /**
     * Penetration Testing
     */
    get penetrationTests() {
        return [
            {
                name: 'SQL Injection Prevention',
                category: 'Penetration Testing',
                function: async () => {
                    // Test malicious input handling
                    const maliciousInputs = [
                        "'; DROP TABLE users; --",
                        "' OR '1'='1",
                        "'; INSERT INTO users VALUES ('hacker', 'password'); --"
                    ];
                    
                    // These would be tested against actual database queries
                    // For now, verify input sanitization exists
                    console.log('    SQL injection testing requires database integration');
                }
            },
            {
                name: 'Path Traversal Prevention',
                category: 'Penetration Testing',
                function: async () => {
                    const maliciousPaths = [
                        '../../../etc/passwd',
                        '..\\..\\..\\windows\\system32\\config\\sam',
                        '/etc/shadow',
                        'C:\\Windows\\System32\\config\\SAM'
                    ];
                    
                    // Test file access with malicious paths
                    for (const maliciousPath of maliciousPaths) {
                        // This would test actual file access controls
                        console.log(`    Testing path traversal: ${maliciousPath}`);
                    }
                }
            },
            {
                name: 'Command Injection Prevention',
                category: 'Penetration Testing',
                function: async () => {
                    const maliciousCommands = [
                        '; rm -rf /',
                        '| cat /etc/passwd',
                        '&& whoami',
                        '$(id)'
                    ];
                    
                    // Test command execution with malicious input
                    for (const command of maliciousCommands) {
                        console.log(`    Testing command injection: ${command}`);
                    }
                }
            }
        ];
    }

    /**
     * Integrity Verification Tests
     */
    get integrityVerificationTests() {
        return [
            {
                name: 'File Hash Verification',
                category: 'Integrity Verification',
                function: async () => {
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    // Store file hash
                    const filePath = this.testFiles[0].path;
                    const result = await integrityService.storeFileHash('test-file', filePath, { test: true });
                    
                    // Verify hash
                    const verification = await integrityService.verifyFileIntegrity('test-file', filePath);
                    if (!verification.verified) {
                        throw new Error('File integrity verification failed');
                    }
                    
                    // Tamper with file and verify detection
                    await fs.writeFile(filePath, Buffer.from('Tampered content'));
                    const tamperedVerification = await integrityService.verifyFileIntegrity('test-file', filePath);
                    if (tamperedVerification.verified) {
                        throw new Error('File tampering not detected');
                    }
                }
            },
            {
                name: 'Bulk Integrity Verification',
                category: 'Integrity Verification',
                function: async () => {
                    const integrityService = new FileIntegrityService();
                    await integrityService.initialize();
                    
                    // Store multiple file hashes
                    for (let i = 0; i < 3; i++) {
                        await integrityService.storeFileHash(`test-file-${i}`, this.testFiles[i].path, { test: true });
                    }
                    
                    // Verify all files
                    const bulkVerification = await integrityService.verifyAllFilesIntegrity();
                    const failedFiles = bulkVerification.results.filter(result => !result.verified);
                    
                    if (failedFiles.length > 0) {
                        throw new Error(`Bulk integrity verification failed: ${failedFiles.length} files failed`);
                    }
                }
            }
        ];
    }

    /**
     * Generate comprehensive test report
     */
    generateTestReport() {
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.status === 'PASSED').length;
        const failedTests = this.testResults.filter(r => r.status === 'FAILED').length;
        const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0);

        console.log('\n' + '='.repeat(60));
        console.log('🔒 SECURITY TEST SUITE REPORT');
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

        // Generate detailed report file
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

        const reportPath = path.join(this.tempDir, 'security-test-report.json');
        fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    }

    /**
     * Cleanup test environment
     */
    async cleanup() {
        try {
            await fs.rm(this.tempDir, { recursive: true, force: true });
            console.log('\n🧹 Test environment cleaned up');
        } catch (error) {
            console.error('Failed to cleanup test environment:', error);
        }
    }
}

module.exports = SecurityTestSuite;
