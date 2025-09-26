# Canary Rollout Guide
**Document Sorter — AI Features Gradual Rollout**  
**Version:** 1.0  
**Last Updated:** 2025-01-27

---

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Getting Started](#getting-started)
4. [User Management](#user-management)
5. [Feature Rollout](#feature-rollout)
6. [Monitoring & Alerts](#monitoring--alerts)
7. [Rollback Procedures](#rollback-procedures)
8. [CLI Reference](#cli-reference)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The Canary Rollout system provides controlled, gradual deployment of AI features to users, enabling safe testing and validation before full release. This system includes:

- **Gradual Rollout**: Percentage-based feature activation
- **Beta User Management**: Dedicated testing groups
- **Real-time Monitoring**: Performance and error tracking
- **Automatic Rollback**: Safety mechanisms for problematic features
- **A/B Testing**: Feature validation capabilities

### Key Benefits
- **Risk Mitigation**: Test features with limited user base
- **Performance Monitoring**: Track feature health in real-time
- **User Feedback**: Collect and analyze beta user input
- **Quick Recovery**: Automatic rollback on issues
- **Data-Driven Decisions**: Metrics-based rollout decisions

---

## Architecture

### Core Services

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  CanaryRolloutService│    │   BetaUserService   │    │RolloutMonitoringService│
│                     │    │                     │    │                     │
│ • Feature flags     │    │ • User registration │    │ • Health monitoring │
│ • Rollout control   │    │ • Access management │    │ • Alert generation  │
│ • User hash logic   │    │ • Feedback collection│    │ • Performance tracking│
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
           │                           │                           │
           └───────────────────────────┼───────────────────────────┘
                                       │
                           ┌─────────────────────┐
                           │ EnhancedParsingService│
                           │                     │
                           │ • Feature integration│
                           │ • User context      │
                           │ • Service orchestration│
                           └─────────────────────┘
```

### Data Flow

1. **User Request** → Enhanced Parsing Service
2. **Feature Check** → Canary Rollout Service
3. **User Validation** → Beta User Service
4. **Feature Execution** → AI Services
5. **Metrics Collection** → Monitoring Service
6. **Alert Generation** → Rollout Monitoring Service

---

## Getting Started

### 1. Enable Canary Rollout

Update your configuration in `config/canary-rollout.json`:

```json
{
  "canaryRollout": {
    "enabled": true,
    "features": {
      "aiExtraction": {
        "enabled": false,
        "rolloutPercentage": 0,
        "rolloutStrategy": "gradual"
      }
    }
  }
}
```

### 2. Initialize Services

The canary rollout system is automatically initialized when the Enhanced Parsing Service starts. No manual setup required.

### 3. Verify Installation

Check if services are running:

```bash
node scripts/rollout-manager.js status
```

---

## User Management

### Beta User Registration

#### Via CLI
```bash
# Register a new beta user
node scripts/rollout-manager.js add-user john@example.com "John Doe" aiExtraction ocrFallback

# List all beta users
node scripts/rollout-manager.js list-users
```

#### Via API
```javascript
const betaUserService = new BetaUserService();

// Register user
const user = await betaUserService.registerUser({
  email: 'john@example.com',
  name: 'John Doe',
  interests: ['aiExtraction', 'ocrFallback']
});

// Enable features
await betaUserService.enableFeatureForUser(user.id, 'aiExtraction');
```

### User Groups

- **Beta Users**: Early access to new features
- **Stable Users**: Access to validated features
- **Blacklisted Users**: Excluded from all rollouts

### Feature Access Control

```javascript
// Check if user has access to feature
const hasAccess = canaryService.isFeatureEnabledForUser(userId, 'aiExtraction');

// Add user to beta group
await canaryService.addBetaUser(userId, 'aiExtraction');

// Remove user from beta group
await canaryService.removeBetaUser(userId, 'aiExtraction');
```

---

## Feature Rollout

### Rollout Strategies

#### 1. Gradual Rollout
- Percentage-based activation
- User hash-based selection
- Incremental percentage increases

```bash
# Set 25% rollout
node scripts/rollout-manager.js update-rollout aiExtraction 25
```

#### 2. Beta-Only Rollout
- Limited to beta users only
- No percentage-based activation
- Full control over user access

#### 3. Stable Rollout
- All users have access
- No restrictions
- Production-ready features

### Rollout Configuration

```json
{
  "aiExtraction": {
    "enabled": true,
    "rolloutPercentage": 25,
    "rolloutStrategy": "gradual",
    "minStableTime": 604800000,
    "maxErrorRate": 0.05,
    "minSuccessRate": 0.95
  }
}
```

### Rollout Process

1. **Start with 0%** - No users have access
2. **Add Beta Users** - Enable for specific testers
3. **Monitor Performance** - Track metrics and feedback
4. **Gradual Increase** - Incrementally increase percentage
5. **Full Rollout** - Enable for all users
6. **Monitor & Maintain** - Continue monitoring

---

## Monitoring & Alerts

### Real-time Monitoring

The system continuously monitors:
- **Error Rates**: Failed requests per total requests
- **Success Rates**: Successful requests per total requests
- **Latency**: Average response times
- **Memory Usage**: System resource consumption
- **User Activity**: Active user counts

### Alert Types

#### Critical Alerts
- **High Error Rate**: > 5% error rate
- **Low Success Rate**: < 95% success rate
- **Rollback Required**: Automatic rollback conditions met

#### Warning Alerts
- **High Latency**: > 5 second response times
- **Memory Issues**: > 512MB memory usage
- **Performance Degradation**: Declining metrics

### Monitoring Dashboard

```bash
# View current status
node scripts/rollout-manager.js status

# Output includes:
# - Feature rollout percentages
# - User counts and activity
# - Error and success rates
# - Active alerts
# - Health status
```

### Metrics Collection

```javascript
// Track feature usage
await canaryService.trackFeatureUsage(userId, 'aiExtraction', {
  calls: 10,
  successfulCalls: 8,
  failedCalls: 2,
  latency: 1500
});

// Get rollout status
const status = canaryService.getRolloutStatus();
console.log(status.features.aiExtraction.metrics);
```

---

## Rollback Procedures

### Automatic Rollback

The system automatically rolls back features when:
- Error rate exceeds threshold (default: 5%)
- Success rate falls below threshold (default: 95%)
- Global error rate exceeds threshold (default: 10%)

### Manual Rollback

```bash
# Rollback specific feature
node scripts/rollout-manager.js rollback aiExtraction

# This will:
# - Set rollout percentage to 0%
# - Move all users back to stable
# - Clear beta user list
# - Generate rollback alert
```

### Rollback Recovery

After rollback:
1. **Investigate Issues** - Analyze error logs and metrics
2. **Fix Problems** - Address root causes
3. **Test Fixes** - Validate with beta users
4. **Gradual Re-rollout** - Start with small percentage
5. **Monitor Closely** - Watch for recurring issues

---

## CLI Reference

### Commands

#### User Management
```bash
# Add beta user
node scripts/rollout-manager.js add-user <email> <name> [features...]

# Remove user from feature
node scripts/rollout-manager.js remove-user <email> <feature>

# List beta users
node scripts/rollout-manager.js list-users
```

#### Rollout Control
```bash
# Update rollout percentage
node scripts/rollout-manager.js update-rollout <feature> <percentage>

# Rollback feature
node scripts/rollout-manager.js rollback <feature>

# Show status
node scripts/rollout-manager.js status
```

### Examples

```bash
# Add beta user with multiple features
node scripts/rollout-manager.js add-user jane@company.com "Jane Smith" aiExtraction ocrFallback tableExtraction

# Set 50% rollout for AI extraction
node scripts/rollout-manager.js update-rollout aiExtraction 50

# Check current status
node scripts/rollout-manager.js status

# Rollback problematic feature
node scripts/rollout-manager.js rollback aiExtraction
```

---

## Troubleshooting

### Common Issues

#### 1. Service Not Initializing
**Problem**: Canary rollout services fail to start
**Solution**: 
- Check configuration file exists
- Verify directory permissions
- Review error logs

#### 2. Users Not Getting Access
**Problem**: Beta users can't access features
**Solution**:
- Verify user is in beta group
- Check rollout percentage
- Confirm feature is enabled

#### 3. High Error Rates
**Problem**: Feature showing high error rates
**Solution**:
- Check AI service configuration
- Review error logs
- Consider rollback

#### 4. Monitoring Not Working
**Problem**: No metrics or alerts
**Solution**:
- Verify monitoring service is enabled
- Check log directory permissions
- Review telemetry configuration

### Debug Commands

```bash
# Check service status
node scripts/rollout-manager.js status

# View configuration
cat config/canary-rollout.json

# Check logs
tail -f ~/.config/document-sorter/logs/alerts.jsonl
```

### Log Files

- **Alerts**: `~/.config/document-sorter/logs/alerts.jsonl`
- **Health Reports**: `~/.config/document-sorter/logs/health-reports.jsonl`
- **User Data**: `~/.config/document-sorter/beta/beta-users.json`
- **Rollout Config**: `~/.config/document-sorter/rollout-config.json`

### Support

For issues not covered in this guide:
1. Check the logs for error messages
2. Review the configuration files
3. Test with a minimal setup
4. Contact the development team

---

## Best Practices

### Rollout Strategy
1. **Start Small**: Begin with 0-5% rollout
2. **Monitor Closely**: Watch metrics for 24-48 hours
3. **Increment Gradually**: Increase by 10-25% increments
4. **Maintain Beta Group**: Keep dedicated testers
5. **Have Rollback Plan**: Always be ready to rollback

### User Management
1. **Curate Beta Users**: Select engaged, technical users
2. **Collect Feedback**: Regular feedback collection
3. **Monitor Usage**: Track user behavior and patterns
4. **Communicate Changes**: Keep users informed

### Monitoring
1. **Set Appropriate Thresholds**: Not too sensitive, not too lenient
2. **Regular Health Checks**: Automated monitoring
3. **Alert Response**: Quick response to alerts
4. **Data Analysis**: Regular review of metrics

### Safety
1. **Test in Staging**: Always test before production
2. **Gradual Rollout**: Never jump to 100% immediately
3. **Rollback Ready**: Always have rollback plan
4. **Monitor Continuously**: Don't set and forget

---

This guide provides comprehensive coverage of the canary rollout system. For additional support or questions, refer to the main AI Extraction Guide or contact the development team.
