/**
 * Log Monitoring and Alerting Service
 * Monitors audit logs for suspicious activities and triggers alerts
 */

class LogMonitoringService {
    constructor(options = {}) {
        this.alertRules = new Map();
        this.alertHistory = [];
        this.monitoringActive = false;
        this.checkInterval = options.checkInterval || 60000; // 1 minute
        this.intervalId = null;
        this.auditLogger = null;
        this.alertCallbacks = [];
        this.rateLimits = new Map(); // For rate limiting alerts
        this.initializeDefaultRules();
    }

    /**
     * Set audit logger reference
     */
    setAuditLogger(auditLogger) {
        this.auditLogger = auditLogger;
    }

    /**
     * Initialize default monitoring rules
     */
    initializeDefaultRules() {
        // Failed authentication attempts
        this.addAlertRule({
            id: 'failed_auth_threshold',
            name: 'Excessive Failed Authentication Attempts',
            description: 'Alert when multiple failed authentication attempts occur',
            severity: 'high',
            conditions: {
                type: 'AUTHENTICATION',
                success: false
            },
            threshold: 5,
            timeWindow: 300000, // 5 minutes
            rateLimit: 300000 // 5 minutes between alerts
        });

        // Unauthorized access attempts
        this.addAlertRule({
            id: 'unauthorized_access',
            name: 'Unauthorized Access Attempts',
            description: 'Alert on unauthorized access attempts',
            severity: 'critical',
            conditions: {
                type: 'ACCESS_CONTROL',
                details: { granted: false }
            },
            threshold: 1,
            timeWindow: 60000, // 1 minute
            rateLimit: 60000 // 1 minute between alerts
        });

        // File integrity issues
        this.addAlertRule({
            id: 'file_tampering',
            name: 'File Tampering Detected',
            description: 'Alert when file integrity violations are detected',
            severity: 'critical',
            conditions: {
                type: 'SECURITY_FILE_TAMPERING_DETECTED'
            },
            threshold: 1,
            timeWindow: 60000,
            rateLimit: 0 // No rate limit for critical security events
        });

        // Suspicious file operations
        this.addAlertRule({
            id: 'suspicious_file_ops',
            name: 'Suspicious File Operations',
            description: 'Alert on unusual file operation patterns',
            severity: 'medium',
            conditions: {
                category: 'file_operation'
            },
            threshold: 10,
            timeWindow: 300000, // 5 minutes
            rateLimit: 600000 // 10 minutes between alerts
        });

        // System errors
        this.addAlertRule({
            id: 'system_errors',
            name: 'System Error Threshold',
            description: 'Alert when system errors exceed threshold',
            severity: 'medium',
            conditions: {
                severity: 'error'
            },
            threshold: 5,
            timeWindow: 300000,
            rateLimit: 300000
        });

        // Service authentication failures
        this.addAlertRule({
            id: 'service_auth_failure',
            name: 'Service Authentication Failures',
            description: 'Alert on service-to-service authentication failures',
            severity: 'high',
            conditions: {
                type: 'SERVICE_AUTHENTICATION',
                success: false
            },
            threshold: 3,
            timeWindow: 180000, // 3 minutes
            rateLimit: 300000
        });
    }

    /**
     * Add custom alert rule
     */
    addAlertRule(rule) {
        const ruleId = rule.id || this.generateRuleId();
        this.alertRules.set(ruleId, {
            ...rule,
            id: ruleId,
            createdAt: new Date(),
            isActive: true,
            triggerCount: 0,
            lastTriggered: null
        });
        return ruleId;
    }

    /**
     * Generate unique rule ID
     */
    generateRuleId() {
        return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Start log monitoring
     */
    async startMonitoring() {
        if (this.monitoringActive) {
            console.log('Log monitoring is already active');
            return;
        }

        this.monitoringActive = true;
        console.log('Starting log monitoring...');

        // Run initial check
        await this.runMonitoringCheck();

        // Set up periodic checks
        this.intervalId = setInterval(async () => {
            try {
                await this.runMonitoringCheck();
            } catch (error) {
                console.error('Error during log monitoring:', error);
            }
        }, this.checkInterval);

        if (this.auditLogger) {
            await this.auditLogger.logSystemEvent('log_monitoring_started', {
                checkInterval: this.checkInterval,
                activeRules: Array.from(this.alertRules.values()).filter(rule => rule.isActive).length
            });
        }
    }

    /**
     * Stop log monitoring
     */
    async stopMonitoring() {
        if (!this.monitoringActive) {
            return;
        }

        this.monitoringActive = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        if (this.auditLogger) {
            await this.auditLogger.logSystemEvent('log_monitoring_stopped', {
                totalAlerts: this.alertHistory.length
            });
        }

        console.log('Log monitoring stopped');
    }

    /**
     * Run monitoring check
     */
    async runMonitoringCheck() {
        if (!this.auditLogger) {
            console.warn('No audit logger available for monitoring');
            return;
        }

        const activeRules = Array.from(this.alertRules.values()).filter(rule => rule.isActive);
        
        for (const rule of activeRules) {
            try {
                await this.checkRule(rule);
            } catch (error) {
                console.error(`Error checking rule ${rule.id}:`, error);
            }
        }
    }

    /**
     * Check individual alert rule
     */
    async checkRule(rule) {
        const now = new Date();
        const timeWindowStart = new Date(now.getTime() - rule.timeWindow);
        
        // Check rate limit
        if (this.isRateLimited(rule)) {
            return;
        }

        // Search for matching events
        const matchingEvents = await this.searchMatchingEvents(rule.conditions, timeWindowStart, now);
        
        if (matchingEvents.length >= rule.threshold) {
            await this.triggerAlert(rule, matchingEvents);
        }
    }

    /**
     * Search for events matching rule conditions
     */
    async searchMatchingEvents(conditions, startTime, endTime) {
        // In a real implementation, this would query the audit log database
        // For now, we'll simulate by searching recent logs
        const searchQuery = this.buildSearchQuery(conditions);
        const events = await this.auditLogger.searchLogs(searchQuery);
        
        // Filter by time range
        return events.filter(event => {
            const eventTime = new Date(event.timestamp);
            return eventTime >= startTime && eventTime <= endTime;
        });
    }

    /**
     * Build search query from rule conditions
     */
    buildSearchQuery(conditions) {
        const queryParts = [];
        
        for (const [field, value] of Object.entries(conditions)) {
            if (typeof value === 'object' && value !== null) {
                // Handle nested conditions
                for (const [subField, subValue] of Object.entries(value)) {
                    queryParts.push(`${field}.${subField}:${subValue}`);
                }
            } else {
                queryParts.push(`${field}:${value}`);
            }
        }
        
        return queryParts.join(' ');
    }

    /**
     * Check if rule is rate limited
     */
    isRateLimited(rule) {
        if (!rule.rateLimit || rule.rateLimit === 0) {
            return false;
        }

        const lastTriggered = rule.lastTriggered;
        if (!lastTriggered) {
            return false;
        }

        const timeSinceLastTrigger = Date.now() - lastTriggered.getTime();
        return timeSinceLastTrigger < rule.rateLimit;
    }

    /**
     * Trigger alert for rule
     */
    async triggerAlert(rule, matchingEvents) {
        const now = new Date();
        
        // Update rule statistics
        rule.triggerCount++;
        rule.lastTriggered = now;
        
        // Create alert
        const alert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            timestamp: now,
            eventCount: matchingEvents.length,
            threshold: rule.threshold,
            timeWindow: rule.timeWindow,
            matchingEvents: matchingEvents.slice(0, 10), // Limit to first 10 events
            details: {
                description: rule.description,
                conditions: rule.conditions
            }
        };

        // Store alert history
        this.alertHistory.push(alert);
        
        // Keep only last 1000 alerts
        if (this.alertHistory.length > 1000) {
            this.alertHistory = this.alertHistory.slice(-1000);
        }

        // Log alert
        console.log(`ALERT TRIGGERED: ${rule.name} (${rule.severity}) - ${matchingEvents.length} events`);
        
        if (this.auditLogger) {
            await this.auditLogger.logSecurityEvent('alert_triggered', rule.severity, {
                alertId: alert.id,
                ruleId: rule.id,
                ruleName: rule.name,
                eventCount: matchingEvents.length,
                threshold: rule.threshold
            });
        }

        // Trigger alert callbacks
        await this.notifyAlertCallbacks(alert);
    }

    /**
     * Notify registered alert callbacks
     */
    async notifyAlertCallbacks(alert) {
        for (const callback of this.alertCallbacks) {
            try {
                await callback(alert);
            } catch (error) {
                console.error('Error in alert callback:', error);
            }
        }
    }

    /**
     * Register alert callback
     */
    registerAlertCallback(callback) {
        this.alertCallbacks.push(callback);
    }

    /**
     * Get alert statistics
     */
    getAlertStatistics() {
        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const recentAlerts = this.alertHistory.filter(alert => alert.timestamp >= last24h);
        const weeklyAlerts = this.alertHistory.filter(alert => alert.timestamp >= last7d);
        
        const severityCounts = {};
        const ruleCounts = {};
        
        for (const alert of this.alertHistory) {
            severityCounts[alert.severity] = (severityCounts[alert.severity] || 0) + 1;
            ruleCounts[alert.ruleId] = (ruleCounts[alert.ruleId] || 0) + 1;
        }
        
        return {
            totalAlerts: this.alertHistory.length,
            alertsLast24h: recentAlerts.length,
            alertsLast7d: weeklyAlerts.length,
            severityCounts,
            ruleCounts,
            activeRules: Array.from(this.alertRules.values()).filter(rule => rule.isActive).length,
            monitoringActive: this.monitoringActive
        };
    }

    /**
     * Get recent alerts
     */
    getRecentAlerts(limit = 50) {
        return this.alertHistory
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    /**
     * Get alerts by severity
     */
    getAlertsBySeverity(severity) {
        return this.alertHistory.filter(alert => alert.severity === severity);
    }

    /**
     * Get alerts by rule
     */
    getAlertsByRule(ruleId) {
        return this.alertHistory.filter(alert => alert.ruleId === ruleId);
    }

    /**
     * Disable alert rule
     */
    disableRule(ruleId) {
        const rule = this.alertRules.get(ruleId);
        if (rule) {
            rule.isActive = false;
            return { success: true, ruleId };
        }
        return { success: false, error: 'Rule not found' };
    }

    /**
     * Enable alert rule
     */
    enableRule(ruleId) {
        const rule = this.alertRules.get(ruleId);
        if (rule) {
            rule.isActive = true;
            return { success: true, ruleId };
        }
        return { success: false, error: 'Rule not found' };
    }

    /**
     * Update alert rule
     */
    updateRule(ruleId, updates) {
        const rule = this.alertRules.get(ruleId);
        if (!rule) {
            return { success: false, error: 'Rule not found' };
        }

        // Update rule properties
        Object.assign(rule, updates);
        rule.updatedAt = new Date();

        return { success: true, rule };
    }

    /**
     * Delete alert rule
     */
    deleteRule(ruleId) {
        if (this.alertRules.has(ruleId)) {
            this.alertRules.delete(ruleId);
            return { success: true, ruleId };
        }
        return { success: false, error: 'Rule not found' };
    }

    /**
     * Get all alert rules
     */
    getAllRules() {
        return Array.from(this.alertRules.values());
    }

    /**
     * Clear alert history
     */
    clearAlertHistory() {
        const count = this.alertHistory.length;
        this.alertHistory = [];
        return { success: true, clearedCount: count };
    }

    /**
     * Export alert data
     */
    exportAlertData(format = 'json') {
        const data = {
            alerts: this.alertHistory,
            rules: Array.from(this.alertRules.values()),
            statistics: this.getAlertStatistics(),
            exportedAt: new Date()
        };

        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        } else if (format === 'csv') {
            return this.convertToCSV(data.alerts);
        }

        throw new Error('Unsupported export format');
    }

    /**
     * Convert alerts to CSV format
     */
    convertToCSV(alerts) {
        if (alerts.length === 0) return '';

        const headers = ['id', 'ruleId', 'ruleName', 'severity', 'timestamp', 'eventCount', 'threshold'];
        const rows = alerts.map(alert => [
            alert.id,
            alert.ruleId,
            alert.ruleName,
            alert.severity,
            alert.timestamp,
            alert.eventCount,
            alert.threshold
        ]);

        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    /**
     * Test alert rule with sample data
     */
    async testRule(ruleId, sampleEvents) {
        const rule = this.alertRules.get(ruleId);
        if (!rule) {
            throw new Error('Rule not found');
        }

        // Temporarily override the search function for testing
        const originalSearch = this.searchMatchingEvents;
        this.searchMatchingEvents = async () => sampleEvents;

        try {
            await this.checkRule(rule);
            return { success: true, triggered: rule.lastTriggered !== null };
        } finally {
            this.searchMatchingEvents = originalSearch;
        }
    }
}

module.exports = LogMonitoringService;
