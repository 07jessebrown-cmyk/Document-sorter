const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Rollout Monitoring Service
 * 
 * Provides real-time monitoring and alerting for canary rollout
 * - Tracks feature usage and performance metrics
 * - Generates alerts for rollback conditions
 * - Creates monitoring reports and dashboards
 * - Integrates with telemetry service for comprehensive monitoring
 */
class RolloutMonitoringService {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.canaryService = options.canaryService;
    this.telemetryService = options.telemetryService;
    this.logDir = options.logDir || this.getDefaultLogDir();
    this.alertThresholds = options.alertThresholds || {
      errorRate: 0.05, // 5%
      latency: 5000, // 5 seconds
      memoryUsage: 512, // 512MB
      cpuUsage: 80 // 80%
    };
    
    // Monitoring data
    this.monitoringData = {
      features: {},
      alerts: [],
      reports: [],
      lastHealthCheck: Date.now()
    };
    
    // Health check interval
    this.healthCheckInterval = null;
    this.healthCheckIntervalMs = 60000; // 1 minute
    
    this.isInitialized = false;
  }

  /**
   * Get the default log directory
   * @returns {string} Default log directory
   */
  getDefaultLogDir() {
    const homeDir = os.homedir();
    const appName = 'document-sorter';
    
    switch (process.platform) {
      case 'win32':
        return path.join(homeDir, 'AppData', 'Roaming', appName, 'logs');
      case 'darwin':
        return path.join(homeDir, 'Library', 'Logs', appName);
      default:
        return path.join(homeDir, '.local', 'share', appName, 'logs');
    }
  }

  /**
   * Initialize the monitoring service
   * @returns {Promise<void>}
   */
  async initialize() {
    if (!this.enabled) {
      console.log('🚫 Rollout monitoring service disabled');
      return;
    }

    try {
      // Ensure log directory exists
      await fs.mkdir(this.logDir, { recursive: true });
      
      // Start health checks
      this.startHealthChecks();
      
      this.isInitialized = true;
      console.log('📊 Rollout monitoring service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize rollout monitoring service:', error.message);
      this.enabled = false;
    }
  }

  /**
   * Start health check monitoring
   * @returns {void}
   */
  startHealthChecks() {
    if (!this.enabled || this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthCheckIntervalMs);

    console.log('💓 Started rollout health checks');
  }

  /**
   * Stop health check monitoring
   * @returns {void}
   */
  stopHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('🛑 Stopped rollout health checks');
    }
  }

  /**
   * Perform comprehensive health check
   * @returns {Promise<void>}
   */
  async performHealthCheck() {
    if (!this.enabled || !this.canaryService) return;

    try {
      const rolloutStatus = this.canaryService.getRolloutStatus();
      const telemetryData = this.telemetryService ? this.telemetryService.getMetrics() : null;
      
      // Check each feature for health issues
      for (const [featureName, featureStatus] of Object.entries(rolloutStatus.features)) {
        await this.checkFeatureHealth(featureName, featureStatus, telemetryData);
      }
      
      // Update last health check time
      this.monitoringData.lastHealthCheck = Date.now();
      
      // Generate health report
      await this.generateHealthReport(rolloutStatus, telemetryData);
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      await this.createAlert('health_check_failed', 'Health check failed', { error: error.message });
    }
  }

  /**
   * Check health of a specific feature
   * @param {string} featureName - Feature name
   * @param {Object} featureStatus - Feature status data
   * @param {Object} telemetryData - Telemetry data
   * @returns {Promise<void>}
   */
  async checkFeatureHealth(featureName, featureStatus, telemetryData) {
    const metrics = featureStatus.metrics;
    
    // Check error rate
    if (metrics.errorRate > this.alertThresholds.errorRate) {
      await this.createAlert(
        'high_error_rate',
        `High error rate detected for ${featureName}`,
        {
          feature: featureName,
          errorRate: metrics.errorRate,
          threshold: this.alertThresholds.errorRate
        }
      );
    }
    
    // Check success rate
    if (metrics.successRate < (1 - this.alertThresholds.errorRate)) {
      await this.createAlert(
        'low_success_rate',
        `Low success rate detected for ${featureName}`,
        {
          feature: featureName,
          successRate: metrics.successRate,
          threshold: 1 - this.alertThresholds.errorRate
        }
      );
    }
    
    // Check latency
    if (metrics.averageLatency > this.alertThresholds.latency) {
      await this.createAlert(
        'high_latency',
        `High latency detected for ${featureName}`,
        {
          feature: featureName,
          latency: metrics.averageLatency,
          threshold: this.alertThresholds.latency
        }
      );
    }
    
    // Check if feature should be rolled back
    if (this.canaryService.shouldRollbackFeature(featureName)) {
      await this.createAlert(
        'rollback_required',
        `Rollback required for ${featureName}`,
        {
          feature: featureName,
          errorRate: metrics.errorRate,
          successRate: metrics.successRate
        }
      );
    }
  }

  /**
   * Create an alert
   * @param {string} type - Alert type
   * @param {string} message - Alert message
   * @param {Object} context - Additional context
   * @returns {Promise<void>}
   */
  async createAlert(type, message, context = {}) {
    const alert = {
      id: this.generateAlertId(),
      type,
      message,
      context,
      timestamp: Date.now(),
      resolved: false
    };
    
    this.monitoringData.alerts.push(alert);
    
    // Keep only last 100 alerts
    if (this.monitoringData.alerts.length > 100) {
      this.monitoringData.alerts = this.monitoringData.alerts.slice(-100);
    }
    
    // Log alert
    console.warn(`🚨 ALERT [${type}]: ${message}`, context);
    
    // Save alert to file
    await this.saveAlertToFile(alert);
  }

  /**
   * Generate unique alert ID
   * @returns {string} Alert ID
   */
  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save alert to file
   * @param {Object} alert - Alert object
   * @returns {Promise<void>}
   */
  async saveAlertToFile(alert) {
    try {
      const alertFile = path.join(this.logDir, 'alerts.jsonl');
      const alertLine = JSON.stringify(alert) + '\n';
      await fs.appendFile(alertFile, alertLine);
    } catch (error) {
      console.error('❌ Failed to save alert:', error.message);
    }
  }

  /**
   * Generate health report
   * @param {Object} rolloutStatus - Rollout status
   * @param {Object} telemetryData - Telemetry data
   * @returns {Promise<void>}
   */
  async generateHealthReport(rolloutStatus, telemetryData) {
    const report = {
      timestamp: Date.now(),
      rolloutStatus: {
        enabled: rolloutStatus.enabled,
        features: Object.keys(rolloutStatus.features).length,
        totalUsers: rolloutStatus.global.totalUsers,
        activeUsers: rolloutStatus.global.activeUsers
      },
      telemetry: telemetryData ? {
        aiCalls: telemetryData.aiCalls,
        cache: telemetryData.cache,
        processing: telemetryData.processing,
        performance: telemetryData.performance,
        errors: telemetryData.errors
      } : null,
      alerts: {
        total: this.monitoringData.alerts.length,
        unresolved: this.monitoringData.alerts.filter(a => !a.resolved).length,
        recent: this.monitoringData.alerts.slice(-10)
      },
      health: {
        status: this.getOverallHealthStatus(),
        lastCheck: this.monitoringData.lastHealthCheck
      }
    };
    
    this.monitoringData.reports.push(report);
    
    // Keep only last 50 reports
    if (this.monitoringData.reports.length > 50) {
      this.monitoringData.reports = this.monitoringData.reports.slice(-50);
    }
    
    // Save report to file
    await this.saveReportToFile(report);
  }

  /**
   * Get overall health status
   * @returns {string} Health status
   */
  getOverallHealthStatus() {
    const unresolvedAlerts = this.monitoringData.alerts.filter(a => !a.resolved);
    const criticalAlerts = unresolvedAlerts.filter(a => 
      a.type === 'rollback_required' || 
      a.type === 'high_error_rate' ||
      a.type === 'health_check_failed'
    );
    
    if (criticalAlerts.length > 0) {
      return 'critical';
    } else if (unresolvedAlerts.length > 5) {
      return 'warning';
    } else if (unresolvedAlerts.length > 0) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  /**
   * Save report to file
   * @param {Object} report - Report object
   * @returns {Promise<void>}
   */
  async saveReportToFile(report) {
    try {
      const reportFile = path.join(this.logDir, 'health-reports.jsonl');
      const reportLine = JSON.stringify(report) + '\n';
      await fs.appendFile(reportFile, reportLine);
    } catch (error) {
      console.error('❌ Failed to save health report:', error.message);
    }
  }

  /**
   * Get monitoring dashboard data
   * @returns {Object} Dashboard data
   */
  getDashboardData() {
    return {
      enabled: this.enabled,
      initialized: this.isInitialized,
      health: {
        status: this.getOverallHealthStatus(),
        lastCheck: this.monitoringData.lastHealthCheck
      },
      alerts: {
        total: this.monitoringData.alerts.length,
        unresolved: this.monitoringData.alerts.filter(a => !a.resolved).length,
        recent: this.monitoringData.alerts.slice(-10)
      },
      features: this.monitoringData.features,
      reports: this.monitoringData.reports.slice(-10)
    };
  }

  /**
   * Resolve an alert
   * @param {string} alertId - Alert ID
   * @returns {Promise<boolean>} Success status
   */
  async resolveAlert(alertId) {
    const alert = this.monitoringData.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      console.log(`✅ Resolved alert: ${alert.message}`);
      return true;
    }
    return false;
  }

  /**
   * Get feature metrics
   * @param {string} featureName - Feature name
   * @returns {Object} Feature metrics
   */
  getFeatureMetrics(featureName) {
    return this.monitoringData.features[featureName] || {};
  }

  /**
   * Update feature metrics
   * @param {string} featureName - Feature name
   * @param {Object} metrics - Metrics data
   * @returns {void}
   */
  updateFeatureMetrics(featureName, metrics) {
    if (!this.monitoringData.features[featureName]) {
      this.monitoringData.features[featureName] = {};
    }
    
    this.monitoringData.features[featureName] = {
      ...this.monitoringData.features[featureName],
      ...metrics,
      lastUpdated: Date.now()
    };
  }

  /**
   * Close the service and clean up resources
   * @returns {Promise<void>}
   */
  async close() {
    this.stopHealthChecks();
    this.enabled = false;
    this.isInitialized = false;
    
    // Clear all timers and intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Clear any pending operations
    await new Promise(resolve => setImmediate(resolve));
    
    // Clear all data structures
    this.monitoringData = null;
    this.alertThresholds = null;
    this.canaryService = null;
    this.telemetryService = null;
    
    console.log('🔒 Rollout monitoring service closed');
  }

  /**
   * Shutdown method for test cleanup
   * @returns {Promise<void>}
   */
  async shutdown() {
    await this.close();
  }
}

module.exports = RolloutMonitoringService;
