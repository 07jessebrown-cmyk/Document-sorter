/**
 * Global Setup for Security Tests
 * Initializes test environment before running security tests
 */

const fs = require('fs').promises;
const path = require('path');

module.exports = async () => {
    console.log('🔒 Setting up security test environment...');
    
    // Create necessary directories
    const testDirs = [
        'temp',
        'temp-pentest', 
        'temp-integrity',
        'temp-deployment',
        'audit-logs',
        'coverage/security'
    ];
    
    const baseDir = path.join(__dirname, '..', '..');
    
    for (const dir of testDirs) {
        const dirPath = path.join(baseDir, dir);
        try {
            await fs.mkdir(dirPath, { recursive: true });
            console.log(`  ✓ Created directory: ${dir}`);
        } catch (error) {
            // Directory might already exist
        }
    }
    
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.SECURITY_TEST_MODE = 'true';
    process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
    
    console.log('✅ Security test environment setup complete');
};
