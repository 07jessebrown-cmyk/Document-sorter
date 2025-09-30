const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * Beta User Management Service
 * 
 * Manages beta testers and their access to new features
 * - User registration and authentication
 * - Feature access control
 * - Feedback collection and management
 * - Beta testing analytics and reporting
 */
class BetaUserService {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.dataDir = options.dataDir || this.getDefaultDataDir();
    this.usersFile = path.join(this.dataDir, 'beta-users.json');
    this.feedbackFile = path.join(this.dataDir, 'beta-feedback.json');
    this.analyticsFile = path.join(this.dataDir, 'beta-analytics.json');
    
    // Beta user data
    this.users = new Map();
    this.feedback = [];
    this.analytics = {
      totalUsers: 0,
      activeUsers: 0,
      features: {},
      feedback: {
        total: 0,
        byFeature: {},
        byRating: {}
      },
      lastUpdated: Date.now()
    };
    
    this.isInitialized = false;
  }

  /**
   * Get the default data directory
   * @returns {string} Default data directory
   */
  getDefaultDataDir() {
    const homeDir = os.homedir();
    const appName = 'document-sorter';
    
    switch (process.platform) {
      case 'win32':
        return path.join(homeDir, 'AppData', 'Roaming', appName, 'beta');
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', appName, 'beta');
      default:
        return path.join(homeDir, '.local', 'share', appName, 'beta');
    }
  }

  /**
   * Initialize the beta user service
   * @returns {Promise<void>}
   */
  async initialize() {
    if (!this.enabled) {
      console.log('🚫 Beta user service disabled');
      return;
    }

    try {
      // Ensure data directory exists
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Load existing data
      await this.loadData();
      
      this.isInitialized = true;
      console.log('👥 Beta user service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize beta user service:', error.message);
      this.enabled = false;
    }
  }

  /**
   * Load data from files
   * @returns {Promise<void>}
   */
  async loadData() {
    try {
      // Load users
      if (await this.fileExists(this.usersFile)) {
        const usersData = await fs.readFile(this.usersFile, 'utf8');
        const usersArray = JSON.parse(usersData);
        this.users = new Map(usersArray.map(user => [user.id, user]));
      }
      
      // Load feedback
      if (await this.fileExists(this.feedbackFile)) {
        const feedbackData = await fs.readFile(this.feedbackFile, 'utf8');
        this.feedback = JSON.parse(feedbackData);
      }
      
      // Load analytics
      if (await this.fileExists(this.analyticsFile)) {
        const analyticsData = await fs.readFile(this.analyticsFile, 'utf8');
        this.analytics = { ...this.analytics, ...JSON.parse(analyticsData) };
      }
    } catch (error) {
      console.warn('⚠️ Error loading beta user data:', error.message);
    }
  }

  /**
   * Save data to files
   * @returns {Promise<void>}
   */
  async saveData() {
    if (!this.enabled) return;

    try {
      // Save users
      const usersArray = Array.from(this.users.values());
      await fs.writeFile(this.usersFile, JSON.stringify(usersArray, null, 2));
      
      // Save feedback
      await fs.writeFile(this.feedbackFile, JSON.stringify(this.feedback, null, 2));
      
      // Save analytics
      await fs.writeFile(this.analyticsFile, JSON.stringify(this.analytics, null, 2));
    } catch (error) {
      console.error('❌ Failed to save beta user data:', error.message);
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
   * Register a new beta user
   * @param {Object} userData - User data
   * @param {string} userData.email - User email
   * @param {string} userData.name - User name
   * @param {string} userData.organization - Organization (optional)
   * @param {Array} userData.interests - Feature interests
   * @returns {Promise<Object>} Registered user object
   */
  async registerUser(userData) {
    if (!this.enabled) {
      throw new Error('Beta user service is disabled');
    }

    const userId = this.generateUserId(userData.email);
    
    // Check if user already exists
    if (this.users.has(userId)) {
      throw new Error('User already registered');
    }

    const user = {
      id: userId,
      email: userData.email,
      name: userData.name,
      organization: userData.organization || '',
      interests: userData.interests || [],
      status: 'active',
      joinedAt: Date.now(),
      lastActive: Date.now(),
      features: {
        aiExtraction: false,
        ocrFallback: false,
        tableExtraction: false,
        handwritingDetection: false,
        watermarkDetection: false
      },
      feedback: [],
      analytics: {
        totalSessions: 0,
        totalFilesProcessed: 0,
        averageSessionTime: 0,
        lastSession: null
      }
    };

    this.users.set(userId, user);
    this.analytics.totalUsers++;
    this.analytics.activeUsers++;

    await this.saveData();
    console.log(`✅ Registered beta user: ${userData.email}`);
    
    return user;
  }

  /**
   * Generate user ID from email
   * @param {string} email - User email
   * @returns {string} User ID
   */
  generateUserId(email) {
    return crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Object|null} User object or null
   */
  getUser(userId) {
    return this.users.get(userId) || null;
  }

  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Object|null} User object or null
   */
  getUserByEmail(email) {
    const userId = this.generateUserId(email);
    return this.getUser(userId);
  }

  /**
   * Update user data
   * @param {string} userId - User ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<boolean>} Success status
   */
  async updateUser(userId, updates) {
    if (!this.enabled) return false;

    const user = this.users.get(userId);
    if (!user) return false;

    // Update user data
    Object.assign(user, updates);
    user.lastActive = Date.now();

    await this.saveData();
    return true;
  }

  /**
   * Enable feature for user
   * @param {string} userId - User ID
   * @param {string} featureName - Feature name
   * @returns {Promise<boolean>} Success status
   */
  async enableFeatureForUser(userId, featureName) {
    if (!this.enabled) return false;

    const user = this.users.get(userId);
    if (!user) return false;

    if (user.features[featureName] !== undefined) {
      user.features[featureName] = true;
      user.lastActive = Date.now();
      
      // Update analytics
      if (!this.analytics.features[featureName]) {
        this.analytics.features[featureName] = {
          totalUsers: 0,
          activeUsers: 0
        };
      }
      this.analytics.features[featureName].totalUsers++;
      this.analytics.features[featureName].activeUsers++;

      await this.saveData();
      console.log(`✅ Enabled ${featureName} for user ${userId}`);
      return true;
    }

    return false;
  }

  /**
   * Disable feature for user
   * @param {string} userId - User ID
   * @param {string} featureName - Feature name
   * @returns {Promise<boolean>} Success status
   */
  async disableFeatureForUser(userId, featureName) {
    if (!this.enabled) return false;

    const user = this.users.get(userId);
    if (!user) return false;

    if (user.features[featureName] !== undefined) {
      user.features[featureName] = false;
      user.lastActive = Date.now();
      
      // Update analytics
      if (this.analytics.features[featureName]) {
        this.analytics.features[featureName].activeUsers = Math.max(0, 
          this.analytics.features[featureName].activeUsers - 1
        );
      }

      await this.saveData();
      console.log(`❌ Disabled ${featureName} for user ${userId}`);
      return true;
    }

    return false;
  }

  /**
   * Submit feedback
   * @param {string} userId - User ID
   * @param {Object} feedbackData - Feedback data
   * @param {string} feedbackData.feature - Feature name
   * @param {number} feedbackData.rating - Rating (1-5)
   * @param {string} feedbackData.comment - Comment
   * @param {string} feedbackData.type - Feedback type
   * @returns {Promise<boolean>} Success status
   */
  async submitFeedback(userId, feedbackData) {
    if (!this.enabled) return false;

    const user = this.users.get(userId);
    if (!user) return false;

    const feedback = {
      id: this.generateFeedbackId(),
      userId,
      feature: feedbackData.feature,
      rating: feedbackData.rating,
      comment: feedbackData.comment,
      type: feedbackData.type || 'general',
      timestamp: Date.now(),
      userAgent: feedbackData.userAgent || '',
      version: feedbackData.version || '1.0.0'
    };

    // Add to global feedback
    this.feedback.push(feedback);
    
    // Add to user's feedback
    user.feedback.push(feedback.id);
    
    // Update analytics
    this.analytics.feedback.total++;
    
    if (!this.analytics.feedback.byFeature[feedbackData.feature]) {
      this.analytics.feedback.byFeature[feedbackData.feature] = 0;
    }
    this.analytics.feedback.byFeature[feedbackData.feature]++;
    
    if (!this.analytics.feedback.byRating[feedbackData.rating]) {
      this.analytics.feedback.byRating[feedbackData.rating] = 0;
    }
    this.analytics.feedback.byRating[feedbackData.rating]++;

    await this.saveData();
    console.log(`📝 Received feedback from user ${userId} for ${feedbackData.feature}`);
    
    return true;
  }

  /**
   * Generate feedback ID
   * @returns {string} Feedback ID
   */
  generateFeedbackId() {
    return `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get feedback for a feature
   * @param {string} featureName - Feature name
   * @returns {Array} Feedback array
   */
  getFeedbackForFeature(featureName) {
    return this.feedback.filter(f => f.feature === featureName);
  }

  /**
   * Get user analytics
   * @param {string} userId - User ID
   * @returns {Object} User analytics
   */
  getUserAnalytics(userId) {
    const user = this.users.get(userId);
    if (!user) return null;

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        joinedAt: user.joinedAt,
        lastActive: user.lastActive
      },
      features: user.features,
      analytics: user.analytics,
      feedback: user.feedback.length
    };
  }

  /**
   * Get overall analytics
   * @returns {Object} Overall analytics
   */
  getOverallAnalytics() {
    return {
      ...this.analytics,
      users: {
        total: this.users.size,
        active: Array.from(this.users.values()).filter(u => u.status === 'active').length,
        inactive: Array.from(this.users.values()).filter(u => u.status === 'inactive').length
      },
      features: this.analytics.features,
      feedback: {
        total: this.feedback.length,
        byFeature: this.analytics.feedback.byFeature,
        byRating: this.analytics.feedback.byRating,
        averageRating: this.calculateAverageRating()
      }
    };
  }

  /**
   * Calculate average rating
   * @returns {number} Average rating
   */
  calculateAverageRating() {
    if (this.feedback.length === 0) return 0;
    
    const totalRating = this.feedback.reduce((sum, f) => sum + f.rating, 0);
    return totalRating / this.feedback.length;
  }

  /**
   * Get beta users for a feature
   * @param {string} featureName - Feature name
   * @returns {Array} User array
   */
  getBetaUsersForFeature(featureName) {
    return Array.from(this.users.values()).filter(user => 
      user.features[featureName] === true && user.status === 'active'
    );
  }

  /**
   * Deactivate user
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async deactivateUser(userId) {
    if (!this.enabled) return false;

    const user = this.users.get(userId);
    if (!user) return false;

    user.status = 'inactive';
    user.lastActive = Date.now();
    
    this.analytics.activeUsers = Math.max(0, this.analytics.activeUsers - 1);

    await this.saveData();
    console.log(`👋 Deactivated user ${userId}`);
    
    return true;
  }

  /**
   * Close the service and clean up resources
   * @returns {Promise<void>}
   */
  async close() {
    await this.saveData();
    this.enabled = false;
    this.isInitialized = false;
    
    // Clear all data structures
    this.users = null;
    this.feedback = null;
    this.analytics = null;
    
    console.log('🔒 Beta user service closed');
  }

  /**
   * Shutdown method for test cleanup
   * @returns {Promise<void>}
   */
  async shutdown() {
    await this.close();
  }
}

module.exports = BetaUserService;
