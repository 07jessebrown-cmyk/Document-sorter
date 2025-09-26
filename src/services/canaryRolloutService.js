const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * Canary Rollout Service
 * 
 * Manages gradual rollout of AI features to different user groups
 * - Beta testers get early access to new features
 * - Gradual rollout based on user ID hash
 * - Monitoring and rollback capabilities
 * - A/B testing support for feature validation
 */
class CanaryRolloutService {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.configDir = options.configDir || this.getDefaultConfigDir();
    this.rolloutConfigFile = path.join(this.configDir, 'rollout-config.json');
    this.userGroupsFile = path.join(this.configDir, 'user-groups.json');
    this.metricsFile = path.join(this.configDir, 'rollout-metrics.json');
    
    // Rollout configuration
    this.rolloutConfig = {
      version: '1.0.0',
      features: {
        aiExtraction: {
          enabled: false,
          rolloutPercentage: 0, // 0-100
          betaUsers: [],
          stableUsers: [],
          blacklistedUsers: [],
          rolloutStrategy: 'gradual', // 'gradual', 'beta-only', 'stable'
          minStableTime: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
          maxErrorRate: 0.05, // 5% error rate threshold
          minSuccessRate: 0.95 // 95% success rate threshold
        },
        ocrFallback: {
          enabled: false,
          rolloutPercentage: 0,
          betaUsers: [],
          stableUsers: [],
          blacklistedUsers: [],
          rolloutStrategy: 'gradual',
          minStableTime: 3 * 24 * 60 * 60 * 1000, // 3 days
          maxErrorRate: 0.03,
          minSuccessRate: 0.97
        },
        tableExtraction: {
          enabled: false,
          rolloutPercentage: 0,
          betaUsers: [],
          stableUsers: [],
          blacklistedUsers: [],
          rolloutStrategy: 'gradual',
          minStableTime: 5 * 24 * 60 * 60 * 1000, // 5 days
          maxErrorRate: 0.04,
          minSuccessRate: 0.96
        },
        handwritingDetection: {
          enabled: false,
          rolloutPercentage: 0,
          betaUsers: [],
          stableUsers: [],
          blacklistedUsers: [],
          rolloutStrategy: 'gradual',
          minStableTime: 4 * 24 * 60 * 60 * 1000, // 4 days
          maxErrorRate: 0.06,
          minSuccessRate: 0.94
        },
        watermarkDetection: {
          enabled: false,
          rolloutPercentage: 0,
          betaUsers: [],
          stableUsers: [],
          blacklistedUsers: [],
          rolloutStrategy: 'gradual',
          minStableTime: 2 * 24 * 60 * 60 * 1000, // 2 days
          maxErrorRate: 0.02,
          minSuccessRate: 0.98
        }
      },
      globalSettings: {
        enableTelemetry: true,
        enableErrorReporting: true,
        enablePerformanceMonitoring: true,
        autoRollback: true,
        rollbackThreshold: 0.1, // 10% error rate triggers rollback
        monitoringInterval: 5 * 60 * 1000, // 5 minutes
        maxRolloutPercentage: 50 // Maximum percentage for gradual rollout
      }
    };
    
    // User groups and metrics
    this.userGroups = {
      beta: [],
      stable: [],
      blacklisted: []
    };
    
    this.metrics = {
      features: {},
      global: {
        totalUsers: 0,
        activeUsers: 0,
        errorRate: 0,
        successRate: 0,
        lastUpdated: Date.now()
      }
    };
    
    this.isInitialized = false;
    this.monitoringInterval = null;
  }

  /**
   * Get the default config directory based on OS
   * @returns {string} Default config directory
   */
  getDefaultConfigDir() {
    const homeDir = os.homedir();
    const appName = 'document-sorter';
    
    switch (process.platform) {
      case 'win32':
        return path.join(homeDir, 'AppData', 'Roaming', appName);
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', appName);
      default:
        return path.join(homeDir, '.config', appName);
    }
  }

  /**
   * Initialize the canary rollout service
   * @returns {Promise<void>}
   */
  async initialize() {
    if (!this.enabled) {
      console.log('🚫 Canary rollout service disabled');
      return;
    }

    try {
      // Ensure config directory exists
      await fs.mkdir(this.configDir, { recursive: true });
      
      // Load existing configuration
      await this.loadConfiguration();
      
      // Start monitoring
      this.startMonitoring();
      
      this.isInitialized = true;
      console.log('🎯 Canary rollout service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize canary rollout service:', error.message);
      this.enabled = false;
    }
  }

  /**
   * Load configuration from files
   * @returns {Promise<void>}
   */
  async loadConfiguration() {
    try {
      // Load rollout config
      if (await this.fileExists(this.rolloutConfigFile)) {
        const configData = await fs.readFile(this.rolloutConfigFile, 'utf8');
        this.rolloutConfig = { ...this.rolloutConfig, ...JSON.parse(configData) };
      }
      
      // Load user groups
      if (await this.fileExists(this.userGroupsFile)) {
        const groupsData = await fs.readFile(this.userGroupsFile, 'utf8');
        this.userGroups = { ...this.userGroups, ...JSON.parse(groupsData) };
      }
      
      // Load metrics
      if (await this.fileExists(this.metricsFile)) {
        const metricsData = await fs.readFile(this.metricsFile, 'utf8');
        this.metrics = { ...this.metrics, ...JSON.parse(metricsData) };
      }
    } catch (error) {
      console.warn('⚠️ Error loading canary rollout configuration:', error.message);
    }
  }

  /**
   * Save configuration to files
   * @returns {Promise<void>}
   */
  async saveConfiguration() {
    if (!this.enabled) return;

    try {
      await fs.writeFile(
        this.rolloutConfigFile, 
        JSON.stringify(this.rolloutConfig, null, 2)
      );
      
      await fs.writeFile(
        this.userGroupsFile, 
        JSON.stringify(this.userGroups, null, 2)
      );
      
      await fs.writeFile(
        this.metricsFile, 
        JSON.stringify(this.metrics, null, 2)
      );
    } catch (error) {
      console.error('❌ Failed to save canary rollout configuration:', error.message);
    }
  }

  /**
   * Check if a file exists
   * @param {string} filePath - File path to check
   * @returns {Promise<boolean>} True if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a consistent user ID hash
   * @param {string} userId - User identifier
   * @returns {string} Hash of user ID
   */
  generateUserHash(userId) {
    return crypto.createHash('md5').update(userId).digest('hex');
  }

  /**
   * Check if a user should have access to a feature
   * @param {string} userId - User identifier
   * @param {string} featureName - Feature name
   * @returns {boolean} True if user should have access
   */
  isFeatureEnabledForUser(userId, featureName) {
    if (!this.enabled || !this.isInitialized) {
      return false;
    }

    const feature = this.rolloutConfig.features[featureName];
    if (!feature) {
      return false;
    }

    const userHash = this.generateUserHash(userId);
    const userHashNum = parseInt(userHash.substring(0, 8), 16);
    const userPercentage = (userHashNum % 100) + 1;

    // Check blacklist first
    if (feature.blacklistedUsers.includes(userId)) {
      return false;
    }

    // Check beta users
    if (feature.betaUsers.includes(userId)) {
      return true;
    }

    // Check stable users
    if (feature.stableUsers.includes(userId)) {
      return true;
    }

    // Check gradual rollout percentage
    if (feature.rolloutStrategy === 'gradual' && userPercentage <= feature.rolloutPercentage) {
      return true;
    }

    return false;
  }

  /**
   * Add user to beta group
   * @param {string} userId - User identifier
   * @param {string} featureName - Feature name
   * @returns {Promise<boolean>} Success status
   */
  async addBetaUser(userId, featureName) {
    if (!this.enabled) return false;

    const feature = this.rolloutConfig.features[featureName];
    if (!feature) return false;

    if (!feature.betaUsers.includes(userId)) {
      feature.betaUsers.push(userId);
      await this.saveConfiguration();
      console.log(`✅ Added user ${userId} to beta group for ${featureName}`);
      return true;
    }

    return false;
  }

  /**
   * Remove user from beta group
   * @param {string} userId - User identifier
   * @param {string} featureName - Feature name
   * @returns {Promise<boolean>} Success status
   */
  async removeBetaUser(userId, featureName) {
    if (!this.enabled) return false;

    const feature = this.rolloutConfig.features[featureName];
    if (!feature) return false;

    const index = feature.betaUsers.indexOf(userId);
    if (index > -1) {
      feature.betaUsers.splice(index, 1);
      await this.saveConfiguration();
      console.log(`❌ Removed user ${userId} from beta group for ${featureName}`);
      return true;
    }

    return false;
  }

  /**
   * Update feature rollout percentage
   * @param {string} featureName - Feature name
   * @param {number} percentage - Rollout percentage (0-100)
   * @returns {Promise<boolean>} Success status
   */
  async updateRolloutPercentage(featureName, percentage) {
    if (!this.enabled) return false;

    const feature = this.rolloutConfig.features[featureName];
    if (!feature) return false;

    if (percentage < 0 || percentage > this.rolloutConfig.globalSettings.maxRolloutPercentage) {
      console.warn(`⚠️ Invalid rollout percentage: ${percentage}`);
      return false;
    }

    feature.rolloutPercentage = percentage;
    await this.saveConfiguration();
    console.log(`📊 Updated ${featureName} rollout to ${percentage}%`);
    return true;
  }

  /**
   * Track feature usage metrics
   * @param {string} userId - User identifier
   * @param {string} featureName - Feature name
   * @param {Object} metrics - Usage metrics
   * @returns {Promise<void>}
   */
  async trackFeatureUsage(userId, featureName, metrics) {
    if (!this.enabled) return;

    if (!this.metrics.features[featureName]) {
      this.metrics.features[featureName] = {
        totalUsers: 0,
        activeUsers: new Set(),
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        averageLatency: 0,
        totalLatency: 0,
        lastUpdated: Date.now()
      };
    }

    const featureMetrics = this.metrics.features[featureName];
    featureMetrics.activeUsers.add(userId);
    featureMetrics.totalCalls += metrics.calls || 1;
    featureMetrics.successfulCalls += metrics.successfulCalls || 0;
    featureMetrics.failedCalls += metrics.failedCalls || 0;
    featureMetrics.totalLatency += metrics.latency || 0;
    featureMetrics.averageLatency = featureMetrics.totalLatency / featureMetrics.totalCalls;
    featureMetrics.lastUpdated = Date.now();

    // Update global metrics
    this.metrics.global.totalUsers = Math.max(
      this.metrics.global.totalUsers,
      featureMetrics.activeUsers.size
    );
    this.metrics.global.lastUpdated = Date.now();

    await this.saveConfiguration();
  }

  /**
   * Check if feature should be rolled back
   * @param {string} featureName - Feature name
   * @returns {boolean} True if rollback needed
   */
  shouldRollbackFeature(featureName) {
    if (!this.enabled) return false;

    const feature = this.rolloutConfig.features[featureName];
    const featureMetrics = this.metrics.features[featureName];
    
    if (!feature || !featureMetrics) return false;

    const errorRate = featureMetrics.failedCalls / featureMetrics.totalCalls;
    const successRate = featureMetrics.successfulCalls / featureMetrics.totalCalls;

    return (
      errorRate > feature.maxErrorRate ||
      successRate < feature.minSuccessRate ||
      errorRate > this.rolloutConfig.globalSettings.rollbackThreshold
    );
  }

  /**
   * Rollback feature to previous state
   * @param {string} featureName - Feature name
   * @returns {Promise<boolean>} Success status
   */
  async rollbackFeature(featureName) {
    if (!this.enabled) return false;

    const feature = this.rolloutConfig.features[featureName];
    if (!feature) return false;

    // Reset rollout percentage to 0
    feature.rolloutPercentage = 0;
    
    // Move all users back to stable
    feature.stableUsers = [...feature.betaUsers, ...feature.stableUsers];
    feature.betaUsers = [];

    await this.saveConfiguration();
    console.log(`🔄 Rolled back feature ${featureName}`);
    return true;
  }

  /**
   * Start monitoring for rollback conditions
   * @returns {void}
   */
  startMonitoring() {
    if (!this.enabled || this.monitoringInterval) return;

    this.monitoringInterval = setInterval(async () => {
      await this.checkRollbackConditions();
    }, this.rolloutConfig.globalSettings.monitoringInterval);

    console.log('👁️ Started canary rollout monitoring');
  }

  /**
   * Stop monitoring
   * @returns {void}
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('🛑 Stopped canary rollout monitoring');
    }
  }

  /**
   * Check all features for rollback conditions
   * @returns {Promise<void>}
   */
  async checkRollbackConditions() {
    if (!this.enabled) return;

    for (const [featureName, feature] of Object.entries(this.rolloutConfig.features)) {
      if (this.shouldRollbackFeature(featureName)) {
        console.warn(`⚠️ Rollback condition detected for ${featureName}`);
        
        if (this.rolloutConfig.globalSettings.autoRollback) {
          await this.rollbackFeature(featureName);
        }
      }
    }
  }

  /**
   * Get rollout status for all features
   * @returns {Object} Rollout status
   */
  getRolloutStatus() {
    const status = {
      enabled: this.enabled,
      initialized: this.isInitialized,
      features: {},
      global: this.metrics.global
    };

    for (const [featureName, feature] of Object.entries(this.rolloutConfig.features)) {
      const featureMetrics = this.metrics.features[featureName] || {};
      
      status.features[featureName] = {
        enabled: feature.enabled,
        rolloutPercentage: feature.rolloutPercentage,
        betaUsers: feature.betaUsers.length,
        stableUsers: feature.stableUsers.length,
        blacklistedUsers: feature.blacklistedUsers.length,
        rolloutStrategy: feature.rolloutStrategy,
        metrics: {
          totalCalls: featureMetrics.totalCalls || 0,
          successfulCalls: featureMetrics.successfulCalls || 0,
          failedCalls: featureMetrics.failedCalls || 0,
          errorRate: featureMetrics.totalCalls > 0 
            ? (featureMetrics.failedCalls / featureMetrics.totalCalls) 
            : 0,
          successRate: featureMetrics.totalCalls > 0 
            ? (featureMetrics.successfulCalls / featureMetrics.totalCalls) 
            : 0,
          averageLatency: featureMetrics.averageLatency || 0
        }
      };
    }

    return status;
  }

  /**
   * Close the service and clean up resources
   * @returns {Promise<void>}
   */
  async close() {
    this.stopMonitoring();
    await this.saveConfiguration();
    this.enabled = false;
    this.isInitialized = false;
    
    // Clear all timers and intervals
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    // Clear all data structures
    this.rolloutConfig = null;
    this.userGroups = null;
    this.metrics = null;
    
    console.log('🔒 Canary rollout service closed');
  }
}

module.exports = CanaryRolloutService;
