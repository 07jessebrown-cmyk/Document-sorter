#!/usr/bin/env node

/**
 * Canary Rollout Manager CLI
 * 
 * Command-line tool for managing canary rollout of AI features
 * Usage: node scripts/rollout-manager.js <command> [options]
 */

const fs = require('fs').promises;
const path = require('path');
const CanaryRolloutService = require('../src/services/canaryRolloutService');
const BetaUserService = require('../src/services/betaUserService');
const RolloutMonitoringService = require('../src/services/rolloutMonitoringService');

class RolloutManager {
  constructor() {
    this.canaryService = null;
    this.betaUserService = null;
    this.monitoringService = null;
  }

  async initialize() {
    try {
      this.canaryService = new CanaryRolloutService({ enabled: true });
      this.betaUserService = new BetaUserService({ enabled: true });
      this.monitoringService = new RolloutMonitoringService({ 
        enabled: true,
        canaryService: this.canaryService,
        telemetryService: null
      });

      await Promise.all([
        this.canaryService.initialize(),
        this.betaUserService.initialize(),
        this.monitoringService.initialize()
      ]);

      console.log('✅ Rollout manager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize rollout manager:', error.message);
      process.exit(1);
    }
  }

  async addBetaUser(email, name, features = []) {
    try {
      const user = await this.betaUserService.registerUser({
        email,
        name,
        interests: features
      });

      // Enable requested features
      for (const feature of features) {
        await this.betaUserService.enableFeatureForUser(user.id, feature);
        await this.canaryService.addBetaUser(user.id, feature);
      }

      console.log(`✅ Added beta user: ${email}`);
      console.log(`   User ID: ${user.id}`);
      console.log(`   Features: ${features.join(', ')}`);
    } catch (error) {
      console.error(`❌ Failed to add beta user: ${error.message}`);
    }
  }

  async removeBetaUser(email, feature) {
    try {
      const user = this.betaUserService.getUserByEmail(email);
      if (!user) {
        console.error(`❌ User not found: ${email}`);
        return;
      }

      await this.betaUserService.disableFeatureForUser(user.id, feature);
      await this.canaryService.removeBetaUser(user.id, feature);

      console.log(`✅ Removed beta user ${email} from ${feature}`);
    } catch (error) {
      console.error(`❌ Failed to remove beta user: ${error.message}`);
    }
  }

  async updateRolloutPercentage(feature, percentage) {
    try {
      await this.canaryService.updateRolloutPercentage(feature, percentage);
      console.log(`✅ Updated ${feature} rollout to ${percentage}%`);
    } catch (error) {
      console.error(`❌ Failed to update rollout percentage: ${error.message}`);
    }
  }

  async getStatus() {
    try {
      const rolloutStatus = this.canaryService.getRolloutStatus();
      const analytics = this.betaUserService.getOverallAnalytics();
      const dashboard = this.monitoringService.getDashboardData();

      console.log('\n📊 CANARY ROLLOUT STATUS');
      console.log('========================');
      console.log(`Enabled: ${rolloutStatus.enabled}`);
      console.log(`Initialized: ${rolloutStatus.initialized}`);
      console.log(`Total Users: ${analytics.users.total}`);
      console.log(`Active Users: ${analytics.users.active}`);
      console.log(`Health Status: ${dashboard.health.status}`);

      console.log('\n🎯 FEATURES');
      console.log('===========');
      for (const [featureName, feature] of Object.entries(rolloutStatus.features)) {
        console.log(`\n${featureName}:`);
        console.log(`  Enabled: ${feature.enabled}`);
        console.log(`  Rollout: ${feature.rolloutPercentage}%`);
        console.log(`  Beta Users: ${feature.betaUsers}`);
        console.log(`  Stable Users: ${feature.stableUsers}`);
        console.log(`  Error Rate: ${(feature.metrics.errorRate * 100).toFixed(2)}%`);
        console.log(`  Success Rate: ${(feature.metrics.successRate * 100).toFixed(2)}%`);
      }

      console.log('\n🚨 ALERTS');
      console.log('=========');
      if (dashboard.alerts.unresolved > 0) {
        console.log(`Unresolved Alerts: ${dashboard.alerts.unresolved}`);
        dashboard.alerts.recent.forEach(alert => {
          console.log(`  - ${alert.type}: ${alert.message}`);
        });
      } else {
        console.log('No unresolved alerts');
      }

    } catch (error) {
      console.error(`❌ Failed to get status: ${error.message}`);
    }
  }

  async rollbackFeature(feature) {
    try {
      await this.canaryService.rollbackFeature(feature);
      console.log(`✅ Rolled back feature: ${feature}`);
    } catch (error) {
      console.error(`❌ Failed to rollback feature: ${error.message}`);
    }
  }

  async listBetaUsers() {
    try {
      const analytics = this.betaUserService.getOverallAnalytics();
      console.log('\n👥 BETA USERS');
      console.log('=============');
      console.log(`Total: ${analytics.users.total}`);
      console.log(`Active: ${analytics.users.active}`);
      console.log(`Inactive: ${analytics.users.inactive}`);
    } catch (error) {
      console.error(`❌ Failed to list beta users: ${error.message}`);
    }
  }

  async close() {
    if (this.canaryService) await this.canaryService.close();
    if (this.betaUserService) await this.betaUserService.close();
    if (this.monitoringService) await this.monitoringService.close();
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
🎯 Canary Rollout Manager

Usage: node scripts/rollout-manager.js <command> [options]

Commands:
  add-user <email> <name> [features...]  Add beta user
  remove-user <email> <feature>          Remove user from feature
  update-rollout <feature> <percentage>  Update rollout percentage
  status                                 Show rollout status
  rollback <feature>                     Rollback feature
  list-users                             List beta users

Examples:
  node scripts/rollout-manager.js add-user john@example.com "John Doe" aiExtraction ocrFallback
  node scripts/rollout-manager.js update-rollout aiExtraction 25
  node scripts/rollout-manager.js status
  node scripts/rollout-manager.js rollback aiExtraction
`);
    process.exit(0);
  }

  const manager = new RolloutManager();
  await manager.initialize();

  try {
    switch (command) {
      case 'add-user':
        const [email, name, ...features] = args.slice(1);
        if (!email || !name) {
          console.error('❌ Usage: add-user <email> <name> [features...]');
          process.exit(1);
        }
        await manager.addBetaUser(email, name, features);
        break;

      case 'remove-user':
        const [email2, feature] = args.slice(1);
        if (!email2 || !feature) {
          console.error('❌ Usage: remove-user <email> <feature>');
          process.exit(1);
        }
        await manager.removeBetaUser(email2, feature);
        break;

      case 'update-rollout':
        const [feature2, percentage] = args.slice(1);
        if (!feature2 || !percentage) {
          console.error('❌ Usage: update-rollout <feature> <percentage>');
          process.exit(1);
        }
        await manager.updateRolloutPercentage(feature2, parseInt(percentage));
        break;

      case 'status':
        await manager.getStatus();
        break;

      case 'rollback':
        const [feature3] = args.slice(1);
        if (!feature3) {
          console.error('❌ Usage: rollback <feature>');
          process.exit(1);
        }
        await manager.rollbackFeature(feature3);
        break;

      case 'list-users':
        await manager.listBetaUsers();
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        process.exit(1);
    }
  } finally {
    await manager.close();
  }
}

// Run CLI
if (require.main === module) {
  main().catch(error => {
    console.error('❌ CLI Error:', error.message);
    process.exit(1);
  });
}

module.exports = RolloutManager;
