/**
 * Security Test Setup
 * Configures test environment for security testing
 */

const fs = require('fs').promises;
const path = require('path');

// Create test directories
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

async function setupTestEnvironment() {
    const baseDir = path.join(__dirname);
    
    for (const dir of testDirs) {
        const dirPath = path.join(baseDir, dir);
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    }
}

// Setup test environment
setupTestEnvironment().catch(console.error);

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise during tests
const originalConsole = { ...console };
global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
};

// Restore console after tests
afterAll(() => {
    global.console = originalConsole;
});
