/**
 * Canary Rollout Service Unit Tests
 * 
 * Tests the core functionality of the canary rollout service
 */

const CanaryRolloutService = require('../../src/services/canaryRolloutService');

describe('CanaryRolloutService', () => {
  let canaryService;

  beforeEach(() => {
    canaryService = new CanaryRolloutService({
      enabled: true,
      configDir: '/tmp/canary-test'
    });
  });

  afterEach(async () => {
    if (canaryService) {
      await canaryService.close();
      canaryService = null;
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('User Hash Generation', () => {
    test('should generate consistent user hash', () => {
      const userId = 'test@example.com';
      const hash1 = canaryService.generateUserHash(userId);
      const hash2 = canaryService.generateUserHash(userId);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(32); // MD5 hash length
    });

    test('should generate different hashes for different users', () => {
      const hash1 = canaryService.generateUserHash('user1@example.com');
      const hash2 = canaryService.generateUserHash('user2@example.com');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Feature Access Control', () => {
    test('should return false for disabled features', () => {
      const hasAccess = canaryService.isFeatureEnabledForUser('user@example.com', 'aiExtraction');
      expect(hasAccess).toBe(false);
    });

    test('should return false for invalid feature names', () => {
      const hasAccess = canaryService.isFeatureEnabledForUser('user@example.com', 'invalidFeature');
      expect(hasAccess).toBe(false);
    });

    test('should respect blacklisted users', async () => {
      // Add user to blacklist
      const feature = canaryService.rolloutConfig.features.aiExtraction;
      feature.blacklistedUsers.push('blacklisted@example.com');
      
      const hasAccess = canaryService.isFeatureEnabledForUser('blacklisted@example.com', 'aiExtraction');
      expect(hasAccess).toBe(false);
    });

    test('should allow beta users', async () => {
      // Add user to beta group
      const feature = canaryService.rolloutConfig.features.aiExtraction;
      feature.betaUsers.push('beta@example.com');
      
      const hasAccess = canaryService.isFeatureEnabledForUser('beta@example.com', 'aiExtraction');
      expect(hasAccess).toBe(true);
    });
  });

  describe('Rollout Percentage', () => {
    test('should update rollout percentage', async () => {
      const result = await canaryService.updateRolloutPercentage('aiExtraction', 25);
      expect(result).toBe(true);
      
      const feature = canaryService.rolloutConfig.features.aiExtraction;
      expect(feature.rolloutPercentage).toBe(25);
    });

    test('should reject invalid percentages', async () => {
      const result1 = await canaryService.updateRolloutPercentage('aiExtraction', -10);
      expect(result1).toBe(false);
      
      const result2 = await canaryService.updateRolloutPercentage('aiExtraction', 150);
      expect(result2).toBe(false);
    });

    test('should reject invalid feature names', async () => {
      const result = await canaryService.updateRolloutPercentage('invalidFeature', 25);
      expect(result).toBe(false);
    });
  });

  describe('Feature Usage Tracking', () => {
    test('should track feature usage metrics', async () => {
      await canaryService.trackFeatureUsage('user@example.com', 'aiExtraction', {
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
  });

  describe('Rollback Conditions', () => {
    test('should detect rollback conditions for high error rate', async () => {
      // Simulate high error rate
      await canaryService.trackFeatureUsage('user@example.com', 'aiExtraction', {
        calls: 100,
        successfulCalls: 50,
        failedCalls: 50,
        latency: 1000
      });

      const shouldRollback = canaryService.shouldRollbackFeature('aiExtraction');
      expect(shouldRollback).toBe(true);
    });

    test('should not rollback for good performance', async () => {
      // Simulate good performance
      await canaryService.trackFeatureUsage('user@example.com', 'aiExtraction', {
        calls: 100,
        successfulCalls: 95,
        failedCalls: 5,
        latency: 500
      });

      const shouldRollback = canaryService.shouldRollbackFeature('aiExtraction');
      expect(shouldRollback).toBe(false);
    });
  });

  describe('Rollback Functionality', () => {
    test('should rollback feature', async () => {
      // Set up feature with high error rate
      await canaryService.updateRolloutPercentage('aiExtraction', 50);
      await canaryService.trackFeatureUsage('user@example.com', 'aiExtraction', {
        calls: 100,
        successfulCalls: 30,
        failedCalls: 70,
        latency: 2000
      });

      // Perform rollback
      await canaryService.rollbackFeature('aiExtraction');
      
      const status = canaryService.getRolloutStatus();
      expect(status.features.aiExtraction.rolloutPercentage).toBe(0);
    });
  });

  describe('Status Reporting', () => {
    test('should return rollout status', () => {
      const status = canaryService.getRolloutStatus();
      
      expect(status).toBeDefined();
      expect(status.enabled).toBe(true);
      expect(status.initialized).toBe(false); // Not initialized yet
      expect(status.features).toBeDefined();
      expect(status.features.aiExtraction).toBeDefined();
    });
  });
});
