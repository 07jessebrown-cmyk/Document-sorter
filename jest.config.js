module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/main/main.js',
    '!src/renderer/renderer.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  
  // Memory optimization settings
  maxWorkers: 1,
  workerIdleMemoryLimit: '256MB',
  
  // Force garbage collection between tests
  forceExit: true,
  detectOpenHandles: false,
  detectLeaks: false,
  
  // Test isolation
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Memory leak detection
  verbose: false,
  silent: false,
  
  // Global setup and teardown
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
  
  // Memory leak prevention
  testEnvironmentOptions: {
    NODE_OPTIONS: '--expose-gc --max-old-space-size=512'
  }
};
