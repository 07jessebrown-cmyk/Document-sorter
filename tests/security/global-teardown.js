/**
 * Global Teardown for Security Tests
 * Cleans up test environment after running security tests
 */

const fs = require('fs').promises;
const path = require('path');

module.exports = async () => {
    console.log('🧹 Cleaning up security test environment...');
    
    // Clean up test directories
    const testDirs = [
        'temp',
        'temp-pentest',
        'temp-integrity', 
        'temp-deployment',
        'audit-logs',
        'audit-logs2',
        'audit-logs3',
        'hash-chain-logs',
        'hash-chain-tamper-logs'
    ];
    
    const baseDir = path.join(__dirname, '..', '..');
    
    for (const dir of testDirs) {
        const dirPath = path.join(baseDir, dir);
        try {
            await fs.rm(dirPath, { recursive: true, force: true });
            console.log(`  ✓ Cleaned up directory: ${dir}`);
        } catch (error) {
            // Directory might not exist or already cleaned up
        }
    }
    
    // Clean up environment variables
    delete process.env.SECURITY_TEST_MODE;
    
    console.log('✅ Security test environment cleanup complete');
};
