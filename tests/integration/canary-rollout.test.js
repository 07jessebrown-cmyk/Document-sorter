/**
 * Canary Rollout Integration Tests
 * 
 * Tests the complete canary rollout system including:
 * - User registration and feature access
 * - Gradual rollout functionality
 * - Monitoring and alerting
 * - Rollback mechanisms
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const CanaryRolloutService = require('../../src/services/canaryRolloutService');
const BetaUserService = require('../../src/services/betaUserService');
const RolloutMonitoringService = require('../../src/services/rolloutMonitoringService');

describe('Canary Rollout Integration', () => {
  let canaryService;
  let betaUserService;
  let monitoringService;

  beforeEach(async () => {
    // Initialize services with test configuration
    canaryService = new CanaryRolloutService({
      enabled: true,
      configDir: '/tmp/canary-test'
    });
    
    betaUserService = new BetaUserService({
      enabled: true,
      dataDir: '/tmp/canary-test'
    });
    
    monitoringService = new RolloutMonitoringService({
      enabled: true,
      canaryService,
      telemetryService: null,
      logDir: '/tmp/canary-test'
    });

    await Promise.all([
      canaryService.initialize(),
      betaUserService.initialize(),
      monitoringService.initialize()
    ]);
  });

  afterEach(async () => {
    // Clean up services in reverse order
    if (monitoringService) {
      await monitoringService.close();
      monitoringService = null;
    }
    if (betaUserService) {
      await betaUserService.close();
      betaUserService = null;
    }
    if (canaryService) {
      await canaryService.close();
      canaryService = null;
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('User Registration and Feature Access', () => {
    test('should register beta user and enable features', async () => {
      // Register a beta user
      const user = await betaUserService.registerUser({
        email: 'test@example.com',
        name: 'Test User',
        interests: ['aiExtraction', 'ocrFallback']
      });

      expect(user).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');

      // Enable features for the user
      await betaUserService.enableFeatureForUser(user.id, 'aiExtraction');
      await betaUserService.enableFeatureForUser(user.id, 'ocrFallback');
      await canaryService.addBetaUser(user.id, 'aiExtraction');
      await canaryService.addBetaUser(user.id, 'ocrFallback');

      // Check feature access
      expect(canaryService.isFeatureEnabledForUser(user.id, 'aiExtraction')).toBe(true);
      expect(canaryService.isFeatureEnabledForUser(user.id, 'ocrFallback')).toBe(true);
      expect(canaryService.isFeatureEnabledForUser(user.id, 'tableExtraction')).toBe(false);
    });

    test('should handle gradual rollout based on user hash', async () => {
      // Set rollout percentage to 50%
      await canaryService.updateRolloutPercentage('aiExtraction', 50);

      // Test with different user IDs
      const testUsers = [
        'user1@example.com',
        'user2@example.com',
        'user3@example.com',
        'user4@example.com',
        'user5@example.com'
      ];

      let enabledCount = 0;
      for (const email of testUsers) {
        const userId = canaryService.generateUserHash(email);
        if (canaryService.isFeatureEnabledForUser(userId, 'aiExtraction')) {
          enabledCount++;
        }
      }

      // Should have some users enabled (not all, not none)
      expect(enabledCount).toBeGreaterThan(0);
      expect(enabledCount).toBeLessThan(testUsers.length);
    });

    test('should respect blacklisted users', async () => {
      const userId = 'blacklisted@example.com';
      
      // Add user to blacklist
      const feature = canaryService.rolloutConfig.features.aiExtraction;
      feature.blacklistedUsers.push(userId);
      await canaryService.saveConfiguration();

      // User should not have access even if rollout percentage is high
      await canaryService.updateRolloutPercentage('aiExtraction', 100);
      expect(canaryService.isFeatureEnabledForUser(userId, 'aiExtraction')).toBe(false);
    });
  });

  describe('Monitoring and Alerting', () => {
    test('should track feature usage metrics', async () => {
      const userId = 'test@example.com';
      
      // Track feature usage
      await canaryService.trackFeatureUsage(userId, 'aiExtraction', {
        calls: 10,
        successfulCalls: 8,
        failedCalls: 2,
        latency: 1500
      });

      const status = canaryService.getRolloutStatus();
      const featureStatus = status.features.aiExtraction;
      
      expect(featureStatus.metrics.totalCalls).toBe(10);
      expect(featureStatus.metrics.successfulCalls).toBe(8);
      expect(featureStatus.metrics.failedCalls).toBe(2);
      expect(featureStatus.metrics.errorRate).toBe(0.2);
      expect(featureStatus.metrics.successRate).toBe(0.8);
    });

    test('should create alerts for high error rates', async () => {
      const userId = 'test@example.com';
      
      // Simulate high error rate
      await canaryService.trackFeatureUsage(userId, 'aiExtraction', {
        calls: 100,
        successfulCalls: 50,
        failedCalls: 50,
        latency: 1000
      });

      // Check if rollback is recommended
      expect(canaryService.shouldRollbackFeature('aiExtraction')).toBe(true);
    });

    test('should generate health reports', async () => {
      // Perform health check
      await monitoringService.performHealthCheck();
      
      const dashboard = monitoringService.getDashboardData();
      expect(dashboard.enabled).toBe(true);
      expect(dashboard.initialized).toBe(true);
      expect(dashboard.health).toBeDefined();
    });
  });

  describe('Rollback Functionality', () => {
    test('should rollback feature when conditions are met', async () => {
      // Set up feature with high error rate
      await canaryService.updateRolloutPercentage('aiExtraction', 50);
      await canaryService.trackFeatureUsage('user1@example.com', 'aiExtraction', {
        calls: 100,
        successfulCalls: 30,
        failedCalls: 70,
        latency: 2000
      });

      // Check rollback condition
      expect(canaryService.shouldRollbackFeature('aiExtraction')).toBe(true);

      // Perform rollback
      await canaryService.rollbackFeature('aiExtraction');
      
      const status = canaryService.getRolloutStatus();
      expect(status.features.aiExtraction.rolloutPercentage).toBe(0);
    });

    test('should not rollback when conditions are not met', async () => {
      // Set up feature with good performance
      await canaryService.updateRolloutPercentage('aiExtraction', 25);
      await canaryService.trackFeatureUsage('user1@example.com', 'aiExtraction', {
        calls: 100,
        successfulCalls: 95,
        failedCalls: 5,
        latency: 500
      });

      // Check rollback condition
      expect(canaryService.shouldRollbackFeature('aiExtraction')).toBe(false);
    });
  });

  describe('Configuration Management', () => {
    test('should save and load configuration', async () => {
      // Update configuration
      await canaryService.updateRolloutPercentage('aiExtraction', 30);
      await canaryService.addBetaUser('test@example.com', 'aiExtraction');

      // Create new service instance to test loading
      const newCanaryService = new CanaryRolloutService({
        enabled: true,
        configDir: tempDir
      });
      await newCanaryService.initialize();

      // Check if configuration was loaded
      const status = newCanaryService.getRolloutStatus();
      expect(status.features.aiExtraction.rolloutPercentage).toBe(30);
      expect(status.features.aiExtraction.betaUsers).toContain('test@example.com');

      await newCanaryService.close();
    });

    test('should handle invalid configuration gracefully', async () => {
      // Test invalid rollout percentage
      const result = await canaryService.updateRolloutPercentage('aiExtraction', 150);
      expect(result).toBe(false);

      // Test invalid feature name
      const result2 = await canaryService.updateRolloutPercentage('invalidFeature', 50);
      expect(result2).toBe(false);
    });
  });

  describe('Beta User Management', () => {
    test('should collect and analyze feedback', async () => {
      const user = await betaUserService.registerUser({
        email: 'feedback@example.com',
        name: 'Feedback User',
        interests: ['aiExtraction']
      });

      // Submit feedback
      await betaUserService.submitFeedback(user.id, {
        feature: 'aiExtraction',
        rating: 4,
        comment: 'Works well, but could be faster',
        type: 'improvement'
      });

      const analytics = betaUserService.getOverallAnalytics();
      expect(analytics.feedback.total).toBe(1);
      expect(analytics.feedback.byFeature.aiExtraction).toBe(1);
      expect(analytics.feedback.byRating[4]).toBe(1);
    });

    test('should track user analytics', async () => {
      const user = await betaUserService.registerUser({
        email: 'analytics@example.com',
        name: 'Analytics User',
        interests: ['aiExtraction']
      });

      // Update user analytics
      await betaUserService.updateUser(user.id, {
        'analytics.totalSessions': 5,
        'analytics.totalFilesProcessed': 25,
        'analytics.averageSessionTime': 300000
      });

      const userAnalytics = betaUserService.getUserAnalytics(user.id);
      expect(userAnalytics.analytics.totalSessions).toBe(5);
      expect(userAnalytics.analytics.totalFilesProcessed).toBe(25);
    });
  });

  describe('Error Handling', () => {
    test('should handle service initialization failures gracefully', async () => {
      const invalidService = new CanaryRolloutService({
        enabled: true,
        configDir: '/invalid/path/that/does/not/exist'
      });

      // Should not throw error
      await expect(invalidService.initialize()).resolves.not.toThrow();
      expect(invalidService.enabled).toBe(false);
    });

    test('should handle missing user gracefully', async () => {
      const result = await betaUserService.getUser('nonexistent@example.com');
      expect(result).toBeNull();
    });

    test('should handle invalid feature names', async () => {
      const result = canaryService.isFeatureEnabledForUser('user@example.com', 'invalidFeature');
      expect(result).toBe(false);
    });
  });
});
