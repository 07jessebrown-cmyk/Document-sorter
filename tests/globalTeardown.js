/**
 * Global Jest Teardown
 * Cleans up test environment and forces garbage collection
 */

const { globalCleanup } = require('./utils/testCleanup');

module.exports = async () => {
  try {
    // Final cleanup
    await globalCleanup.cleanup();
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
    
    // Clear any remaining timers
    const activeHandles = process._getActiveHandles();
    const activeRequests = process._getActiveRequests();
    
    if (activeHandles.length > 0 || activeRequests.length > 0) {
      console.warn(`⚠️  Active handles: ${activeHandles.length}, Active requests: ${activeRequests.length}`);
    }
    
    console.log('🧹 Global test teardown completed');
  } catch (error) {
    console.error('Error in global teardown:', error);
  }
};
