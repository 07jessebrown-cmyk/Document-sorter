/**
 * Global Jest Setup
 * Initializes test environment and enables garbage collection
 */

// Enable garbage collection for memory leak testing
if (process.env.NODE_ENV === 'test') {
  // Try to enable garbage collection
  try {
    const v8 = require('v8');
    if (v8.setFlagsFromString) {
      v8.setFlagsFromString('--expose-gc');
    }
  } catch (error) {
    console.warn('Could not enable garbage collection:', error.message);
  }
}

// Set memory limits
process.setMaxListeners(20);

// Global error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

module.exports = async () => {
  console.log('🧪 Global test setup completed');
};
