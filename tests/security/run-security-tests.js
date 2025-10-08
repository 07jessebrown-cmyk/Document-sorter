#!/usr/bin/env node

/**
 * Security Test Runner Script
 * Executes all security tests and generates comprehensive reports
 */

const SecurityTestRunner = require('./security-test-runner');
const DeploymentValidationTestSuite = require('./deployment-validation-tests');
const fs = require('fs').promises;
const path = require('path');

class SecurityTestExecutor {
    constructor() {
        this.results = {
            securityTests: null,
            deploymentTests: null,
            overallStatus: 'PENDING'
        };
        this.startTime = null;
        this.endTime = null;
    }

    /**
     * Execute all security tests
     */
    async executeAllTests() {
        console.log('🔒 DOCUMENT SORTER SECURITY TESTING & VALIDATION');
        console.log('=' .repeat(60));
        console.log('Phase 8: Testing & Validation - Complete Implementation');
        console.log('=' .repeat(60));
        console.log('');

        this.startTime = Date.now();

        try {
            // Run comprehensive security test suite
            console.log('📋 TASK 20: Conducting Security Testing');
            console.log('Performing penetration testing, sandbox escape simulations, and access control validation...\n');
            
            const securityRunner = new SecurityTestRunner();
            await securityRunner.runAllTests();
            this.results.securityTests = securityRunner.results;

            console.log('\n' + '='.repeat(60));
            console.log('');

            // Run deployment validation tests
            console.log('🚀 TASK 22: Deploy Phased Rollout');
            console.log('Testing phased rollout deployment, monitoring, and client feedback collection...\n');
            
            const deploymentSuite = new DeploymentValidationTestSuite();
            await deploymentSuite.runDeploymentTests();
            this.results.deploymentTests = deploymentSuite.testResults;
            await deploymentSuite.cleanup();

            console.log('\n' + '='.repeat(60));
            console.log('');

            // Generate final comprehensive report
            this.endTime = Date.now();
            await this.generateFinalReport();

            // Determine overall status
            this.determineOverallStatus();

            console.log('\n🎉 PHASE 8 TESTING & VALIDATION COMPLETED');
            console.log('=' .repeat(60));
            console.log(`Overall Status: ${this.results.overallStatus}`);
            console.log(`Total Duration: ${((this.endTime - this.startTime) / 1000).toFixed(2)}s`);
            console.log('=' .repeat(60));

            // Exit with appropriate code
            if (this.results.overallStatus === 'PASSED') {
                console.log('\n✅ All security tests passed - System ready for production deployment');
                process.exit(0);
            } else {
                console.log('\n❌ Security tests failed - Review and fix issues before deployment');
                process.exit(1);
            }

        } catch (error) {
            console.error('❌ Security testing execution failed:', error);
            this.results.overallStatus = 'FAILED';
            process.exit(1);
        }
    }

    /**
     * Determine overall test status
     */
    determineOverallStatus() {
        const securityResults = this.results.securityTests?.securityTests || [];
        const penetrationResults = this.results.securityTests?.penetrationTests || [];
        const integrityResults = this.results.securityTests?.integrityTests || [];
        const deploymentResults = this.results.deploymentTests || [];

        const allResults = [
            ...securityResults,
            ...penetrationResults,
            ...integrityResults,
            ...deploymentResults
        ];

        const totalTests = allResults.length;
        const failedTests = allResults.filter(r => r.status === 'FAILED').length;
        const criticalVulns = allResults.filter(r => r.status === 'FAILED' && r.severity === 'critical').length;
        const highVulns = allResults.filter(r => r.status === 'FAILED' && r.severity === 'high').length;

        if (criticalVulns > 0) {
            this.results.overallStatus = 'CRITICAL_VULNERABILITIES';
        } else if (highVulns > 0) {
            this.results.overallStatus = 'HIGH_VULNERABILITIES';
        } else if (failedTests > 0) {
            this.results.overallStatus = 'SOME_ISSUES';
        } else {
            this.results.overallStatus = 'PASSED';
        }
    }

    /**
     * Generate final comprehensive report
     */
    async generateFinalReport() {
        const securityResults = this.results.securityTests?.securityTests || [];
        const penetrationResults = this.results.securityTests?.penetrationTests || [];
        const integrityResults = this.results.securityTests?.integrityTests || [];
        const deploymentResults = this.results.deploymentTests || [];

        const allResults = [
            ...securityResults,
            ...penetrationResults,
            ...integrityResults,
            ...deploymentResults
        ];

        const totalTests = allResults.length;
        const passedTests = allResults.filter(r => r.status === 'PASSED').length;
        const failedTests = allResults.filter(r => r.status === 'FAILED').length;
        const totalDuration = allResults.reduce((sum, r) => sum + r.duration, 0);

        // Count vulnerabilities by severity
        const vulnerabilities = {
            critical: allResults.filter(r => r.status === 'FAILED' && r.severity === 'critical').length,
            high: allResults.filter(r => r.status === 'FAILED' && r.severity === 'high').length,
            medium: allResults.filter(r => r.status === 'FAILED' && r.severity === 'medium').length,
            low: allResults.filter(r => r.status === 'FAILED' && r.severity === 'low').length
        };

        const report = {
            metadata: {
                title: 'Document Sorter Security Testing & Validation - Final Report',
                phase: 'Phase 8: Testing & Validation',
                timestamp: new Date().toISOString(),
                duration: this.endTime - this.startTime,
                version: '1.0.0',
                status: this.results.overallStatus
            },
            summary: {
                overallStatus: this.results.overallStatus,
                totalTests,
                passedTests,
                failedTests,
                successRate: (passedTests / totalTests) * 100,
                totalDuration,
                vulnerabilities
            },
            taskResults: {
                task20: {
                    name: 'Conduct Security Testing',
                    description: 'Perform penetration testing, sandbox escape simulations, and access control validation',
                    status: securityResults.filter(r => r.status === 'FAILED').length === 0 ? 'PASSED' : 'FAILED',
                    failedTests: securityResults.filter(r => r.status === 'FAILED').length,
                    penetrationTests: penetrationResults.filter(r => r.status === 'FAILED').length,
                    integrityTests: integrityResults.filter(r => r.status === 'FAILED').length
                },
                task21: {
                    name: 'Verify File Integrity and Logging',
                    description: 'Test hash verification, audit log immutability, and alerting mechanisms',
                    status: integrityResults.filter(r => r.status === 'FAILED').length === 0 ? 'PASSED' : 'FAILED',
                    failedTests: integrityResults.filter(r => r.status === 'FAILED').length
                },
                task22: {
                    name: 'Deploy Phased Rollout',
                    description: 'Deploy new secure system incrementally, monitor, and collect client feedback',
                    status: deploymentResults.filter(r => r.status === 'FAILED').length === 0 ? 'PASSED' : 'FAILED',
                    failedTests: deploymentResults.filter(r => r.status === 'FAILED').length
                }
            },
            testSuites: {
                securityTests: {
                    name: 'Comprehensive Security Test Suite',
                    totalTests: securityResults.length,
                    passedTests: securityResults.filter(r => r.status === 'PASSED').length,
                    failedTests: securityResults.filter(r => r.status === 'FAILED').length
                },
                penetrationTests: {
                    name: 'Penetration Testing Suite',
                    totalTests: penetrationResults.length,
                    passedTests: penetrationResults.filter(r => r.status === 'PASSED').length,
                    failedTests: penetrationResults.filter(r => r.status === 'FAILED').length
                },
                integrityTests: {
                    name: 'Integrity Verification Test Suite',
                    totalTests: integrityResults.length,
                    passedTests: integrityResults.filter(r => r.status === 'PASSED').length,
                    failedTests: integrityResults.filter(r => r.status === 'FAILED').length
                },
                deploymentTests: {
                    name: 'Deployment Validation Test Suite',
                    totalTests: deploymentResults.length,
                    passedTests: deploymentResults.filter(r => r.status === 'PASSED').length,
                    failedTests: deploymentResults.filter(r => r.status === 'FAILED').length
                }
            },
            recommendations: this.generateRecommendations(vulnerabilities, allResults),
            nextSteps: this.generateNextSteps(this.results.overallStatus),
            allResults
        };

        // Save detailed report
        const reportPath = path.join(__dirname, 'phase8-security-validation-final-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        // Generate human-readable summary
        await this.generateHumanReadableReport(report);

        console.log(`\n📄 Final comprehensive security report saved to: ${reportPath}`);
    }

    /**
     * Generate security recommendations
     */
    generateRecommendations(vulnerabilities, allResults) {
        const recommendations = [];

        if (vulnerabilities.critical > 0) {
            recommendations.push({
                priority: 'CRITICAL',
                category: 'Security',
                recommendation: 'Address critical vulnerabilities immediately before production deployment',
                details: 'Critical vulnerabilities pose immediate security risks and must be resolved',
                count: vulnerabilities.critical
            });
        }

        if (vulnerabilities.high > 0) {
            recommendations.push({
                priority: 'HIGH',
                category: 'Security',
                recommendation: 'Address high-severity vulnerabilities before production deployment',
                details: 'High-severity vulnerabilities should be resolved to maintain security posture',
                count: vulnerabilities.high
            });
        }

        // Check for specific vulnerability patterns
        const authFailures = allResults.filter(r => r.status === 'FAILED' && r.category === 'Authentication').length;
        if (authFailures > 0) {
            recommendations.push({
                priority: 'HIGH',
                category: 'Authentication',
                recommendation: 'Review and strengthen authentication mechanisms',
                details: `${authFailures} authentication-related tests failed`,
                count: authFailures
            });
        }

        const fileSystemFailures = allResults.filter(r => r.status === 'FAILED' && r.category === 'File System').length;
        if (fileSystemFailures > 0) {
            recommendations.push({
                priority: 'HIGH',
                category: 'File System',
                recommendation: 'Review file system security and access controls',
                details: `${fileSystemFailures} file system security tests failed`,
                count: fileSystemFailures
            });
        }

        const injectionFailures = allResults.filter(r => r.status === 'FAILED' && r.category === 'Injection').length;
        if (injectionFailures > 0) {
            recommendations.push({
                priority: 'CRITICAL',
                category: 'Injection',
                recommendation: 'Implement proper input validation and sanitization',
                details: `${injectionFailures} injection attack tests failed - immediate attention required`,
                count: injectionFailures
            });
        }

        const deploymentFailures = allResults.filter(r => r.status === 'FAILED' && r.category === 'Phased Rollout').length;
        if (deploymentFailures > 0) {
            recommendations.push({
                priority: 'MEDIUM',
                category: 'Deployment',
                recommendation: 'Review and improve deployment procedures',
                details: `${deploymentFailures} deployment validation tests failed`,
                count: deploymentFailures
            });
        }

        return recommendations;
    }

    /**
     * Generate next steps based on test results
     */
    generateNextSteps(overallStatus) {
        const nextSteps = [];

        switch (overallStatus) {
            case 'PASSED':
                nextSteps.push({
                    step: 1,
                    action: 'Proceed with phased rollout deployment',
                    description: 'All security tests passed - system ready for production deployment'
                });
                nextSteps.push({
                    step: 2,
                    action: 'Set up monitoring and alerting systems',
                    description: 'Implement real-time security monitoring and alerting'
                });
                nextSteps.push({
                    step: 3,
                    action: 'Conduct security review and audit',
                    description: 'Schedule regular security reviews and audits'
                });
                nextSteps.push({
                    step: 4,
                    action: 'Collect client feedback',
                    description: 'Implement client feedback collection and analysis'
                });
                break;

            case 'SOME_ISSUES':
                nextSteps.push({
                    step: 1,
                    action: 'Address identified issues',
                    description: 'Fix failed tests before proceeding with deployment'
                });
                nextSteps.push({
                    step: 2,
                    action: 'Re-run security tests',
                    description: 'Verify all issues have been resolved'
                });
                nextSteps.push({
                    step: 3,
                    action: 'Proceed with cautious deployment',
                    description: 'Deploy with additional monitoring and safeguards'
                });
                break;

            case 'HIGH_VULNERABILITIES':
                nextSteps.push({
                    step: 1,
                    action: 'Immediate security review required',
                    description: 'High-severity vulnerabilities must be addressed before deployment'
                });
                nextSteps.push({
                    step: 2,
                    action: 'Implement additional security measures',
                    description: 'Add extra security controls and monitoring'
                });
                nextSteps.push({
                    step: 3,
                    action: 'Re-test after fixes',
                    description: 'Comprehensive re-testing required after security fixes'
                });
                break;

            case 'CRITICAL_VULNERABILITIES':
                nextSteps.push({
                    step: 1,
                    action: 'STOP - Do not deploy',
                    description: 'Critical vulnerabilities must be resolved before any deployment'
                });
                nextSteps.push({
                    step: 2,
                    action: 'Emergency security response',
                    description: 'Immediate security team involvement required'
                });
                nextSteps.push({
                    step: 3,
                    action: 'Complete security overhaul',
                    description: 'Comprehensive security review and fixes required'
                });
                break;

            default:
                nextSteps.push({
                    step: 1,
                    action: 'Review test results',
                    description: 'Analyze test results and determine appropriate next steps'
                });
        }

        return nextSteps;
    }

    /**
     * Generate human-readable report
     */
    async generateHumanReadableReport(report) {
        const reportPath = path.join(__dirname, 'phase8-security-validation-summary.md');
        
        let markdown = `# Document Sorter Security Testing & Validation - Final Report\n\n`;
        markdown += `**Phase 8: Testing & Validation**\n`;
        markdown += `**Generated:** ${new Date().toISOString()}\n`;
        markdown += `**Overall Status:** ${report.summary.overallStatus}\n`;
        markdown += `**Duration:** ${(report.summary.totalDuration / 1000).toFixed(2)}s\n\n`;

        markdown += `## Executive Summary\n\n`;
        markdown += `- **Total Tests:** ${report.summary.totalTests}\n`;
        markdown += `- **Passed:** ${report.summary.passedTests} (${report.summary.successRate.toFixed(1)}%)\n`;
        markdown += `- **Failed:** ${report.summary.failedTests}\n`;
        markdown += `- **Duration:** ${(report.summary.totalDuration / 1000).toFixed(2)}s\n\n`;

        if (report.summary.vulnerabilities.critical > 0 || report.summary.vulnerabilities.high > 0) {
            markdown += `## 🚨 Security Vulnerabilities\n\n`;
            if (report.summary.vulnerabilities.critical > 0) {
                markdown += `- **Critical:** ${report.summary.vulnerabilities.critical}\n`;
            }
            if (report.summary.vulnerabilities.high > 0) {
                markdown += `- **High:** ${report.summary.vulnerabilities.high}\n`;
            }
            if (report.summary.vulnerabilities.medium > 0) {
                markdown += `- **Medium:** ${report.summary.vulnerabilities.medium}\n`;
            }
            if (report.summary.vulnerabilities.low > 0) {
                markdown += `- **Low:** ${report.summary.vulnerabilities.low}\n`;
            }
            markdown += `\n`;
        }

        markdown += `## Task Results\n\n`;
        Object.entries(report.taskResults).forEach(([taskId, task]) => {
            const status = task.status === 'PASSED' ? '✅' : task.status === 'FAILED' ? '❌' : '⏳';
            markdown += `### ${status} ${task.name}\n`;
            markdown += `**Description:** ${task.description}\n`;
            markdown += `**Status:** ${task.status}\n`;
            if (task.failedTests > 0) {
                markdown += `**Failed Tests:** ${task.failedTests}\n`;
            }
            markdown += `\n`;
        });

        markdown += `## Test Suite Results\n\n`;
        Object.entries(report.testSuites).forEach(([suiteId, suite]) => {
            const status = suite.failedTests === 0 ? '✅' : '❌';
            markdown += `### ${status} ${suite.name}\n`;
            markdown += `- **Total Tests:** ${suite.totalTests}\n`;
            markdown += `- **Passed:** ${suite.passedTests}\n`;
            markdown += `- **Failed:** ${suite.failedTests}\n\n`;
        });

        if (report.recommendations.length > 0) {
            markdown += `## Recommendations\n\n`;
            report.recommendations.forEach((rec, index) => {
                markdown += `${index + 1}. **${rec.priority}** - ${rec.recommendation}\n`;
                markdown += `   ${rec.details} (${rec.count} issues)\n\n`;
            });
        }

        if (report.nextSteps.length > 0) {
            markdown += `## Next Steps\n\n`;
            report.nextSteps.forEach(step => {
                markdown += `${step.step}. **${step.action}**\n`;
                markdown += `   ${step.description}\n\n`;
            });
        }

        await fs.writeFile(reportPath, markdown);
        console.log(`📄 Human-readable summary saved to: ${reportPath}`);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const executor = new SecurityTestExecutor();
    executor.executeAllTests();
}

module.exports = SecurityTestExecutor;
