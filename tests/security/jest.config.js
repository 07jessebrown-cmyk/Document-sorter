/**
 * Jest Configuration for Security Tests
 * Configures Jest for running security test suites
 */

module.exports = {
  displayName: 'Security Tests',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/tests/security/**/*.test.js',
    '<rootDir>/tests/security/**/*.spec.js'
  ],
  collectCoverageFrom: [
    'src/services/**/*.js',
    '!src/services/**/*.test.js',
    '!src/services/**/*.spec.js'
  ],
  coverageDirectory: 'coverage/security',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/security/setup.js'],
  testTimeout: 30000, // 30 seconds for security tests
  verbose: true,
  maxWorkers: 1, // Run security tests sequentially for better isolation
  globalSetup: '<rootDir>/tests/security/global-setup.js',
  globalTeardown: '<rootDir>/tests/security/global-teardown.js',
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'coverage/security',
      outputName: 'junit.xml'
    }]
  ],
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
