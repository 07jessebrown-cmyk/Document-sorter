/**
 * Test Cleanup Utilities
 * Comprehensive memory leak prevention and resource cleanup
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class TestCleanup {
  constructor() {
    this.cleanupTasks = [];
    this.timers = new Set();
    this.workers = new Set();
    this.intervals = new Set();
    this.tempDirs = new Set();
  }

  /**
   * Add a cleanup task to be executed
   * @param {Function} task - Async cleanup function
   */
  addCleanupTask(task) {
    this.cleanupTasks.push(task);
  }

  /**
   * Track a timer for cleanup
   * @param {number} timerId - Timer ID
   */
  trackTimer(timerId) {
    this.timers.add(timerId);
  }

  /**
   * Track a worker for cleanup
   * @param {Object} worker - Worker instance
   */
  trackWorker(worker) {
    this.workers.add(worker);
  }

  /**
   * Track an interval for cleanup
   * @param {number} intervalId - Interval ID
   */
  trackInterval(intervalId) {
    this.intervals.add(intervalId);
  }

  /**
   * Track a temporary directory for cleanup
   * @param {string} dirPath - Directory path
   */
  trackTempDir(dirPath) {
    this.tempDirs.add(dirPath);
  }

  /**
   * Create a tracked temporary directory
   * @param {string} prefix - Directory prefix
   * @returns {Promise<string>} Directory path
   */
  async createTempDir(prefix = 'test') {
    const tempDir = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(tempDir, { recursive: true });
    this.trackTempDir(tempDir);
    return tempDir;
  }

  /**
   * Execute all cleanup tasks
   * @returns {Promise<void>}
   */
  async cleanup() {
    const errors = [];

    // Clear all timers
    for (const timerId of this.timers) {
      try {
        clearTimeout(timerId);
      } catch (error) {
        errors.push(`Timer cleanup error: ${error.message}`);
      }
    }
    this.timers.clear();

    // Clear all intervals
    for (const intervalId of this.intervals) {
      try {
        clearInterval(intervalId);
      } catch (error) {
        errors.push(`Interval cleanup error: ${error.message}`);
      }
    }
    this.intervals.clear();

    // Terminate all workers
    for (const worker of this.workers) {
      try {
        if (worker && typeof worker.terminate === 'function') {
          await worker.terminate();
        }
      } catch (error) {
        errors.push(`Worker cleanup error: ${error.message}`);
      }
    }
    this.workers.clear();

    // Execute cleanup tasks
    for (const task of this.cleanupTasks) {
      try {
        if (typeof task === 'function') {
          await task();
        }
      } catch (error) {
        errors.push(`Cleanup task error: ${error.message}`);
      }
    }
    this.cleanupTasks = [];

    // Remove temporary directories
    for (const dirPath of this.tempDirs) {
      try {
        await fs.rm(dirPath, { recursive: true, force: true });
      } catch (error) {
        errors.push(`Directory cleanup error: ${error.message}`);
      }
    }
    this.tempDirs.clear();

    // Clear global timers and intervals that might not be tracked
    this.clearGlobalTimers();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Log errors if any
    if (errors.length > 0) {
      console.warn('Test cleanup warnings:', errors);
    }
  }

  /**
   * Clear global timers and intervals that might not be tracked
   * @private
   */
  clearGlobalTimers() {
    // Clear any remaining timers
    const highestTimeoutId = setTimeout(() => {}, 0);
    for (let i = 0; i < highestTimeoutId; i++) {
      clearTimeout(i);
    }
    clearTimeout(highestTimeoutId);

    // Clear any remaining intervals
    const highestIntervalId = setInterval(() => {}, 0);
    for (let i = 0; i < highestIntervalId; i++) {
      clearInterval(i);
    }
    clearInterval(highestIntervalId);
  }

  /**
   * Reset all tracking without cleanup
   */
  reset() {
    this.cleanupTasks = [];
    this.timers.clear();
    this.workers.clear();
    this.intervals.clear();
    this.tempDirs.clear();
  }
}

// Global cleanup instance
const globalCleanup = new TestCleanup();

// Enhanced Jest setup with memory leak prevention
const setupJestWithCleanup = () => {
  // Track all timers globally
  const originalSetTimeout = global.setTimeout;
  const originalSetInterval = global.setInterval;

  global.setTimeout = (...args) => {
    const timerId = originalSetTimeout(...args);
    globalCleanup.trackTimer(timerId);
    return timerId;
  };

  global.setInterval = (...args) => {
    const intervalId = originalSetInterval(...args);
    globalCleanup.trackInterval(intervalId);
    return intervalId;
  };

  // Global cleanup on process exit
  process.on('exit', () => {
    globalCleanup.cleanup().catch(console.error);
  });

  process.on('SIGINT', async () => {
    await globalCleanup.cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await globalCleanup.cleanup();
    process.exit(0);
  });
};

module.exports = {
  TestCleanup,
  globalCleanup,
  setupJestWithCleanup
};
