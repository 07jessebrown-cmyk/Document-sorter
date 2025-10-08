/**
 * Security Test Runner
 * Orchestrates all security testing and validation for Phase 8
 */

const SecurityTestSuite = require('./security-test-suite');
const PenetrationTestSuite = require('./penetration-tests');
const IntegrityVerificationTestSuite = require('./integrity-verification-tests');
const fs = require('fs').promises;
const path = require('path');

class SecurityTestRunner {
    constructor() {
        this.results = {
            securityTests: null,
            penetrationTests: null,
            integrityTests: null,
            overallStatus: 'PENDING'
        };
        this.startTime = null;
        this.endTime = null;
    }

    /**
     * Run all security tests and validation
     */
    async runAllTests() {
        console.log('🔒 DOCUMENT SORTER SECURITY TESTING & VALIDATION');
        console.log('=' .repeat(60));
        console.log('Phase 8: Testing & Validation');
        console.log('=' .repeat(60));
        console.log('');

        this.startTime = Date.now();

        try {
            // Run comprehensive security test suite
            console.log('📋 TASK 20: Conducting Security Testing');
            console.log('Performing penetration testing, sandbox escape simulations, and access control validation...\n');
            
            const securitySuite = new SecurityTestSuite();
            await securitySuite.runAllTests();
            this.results.securityTests = securitySuite.testResults;
            await securitySuite.cleanup();

            console.log('\n' + '='.repeat(60));
            console.log('');

            // Run penetration testing suite
            console.log('🎯 TASK 20: Penetration Testing');
            console.log('Simulating various attack vectors and security vulnerabilities...\n');
            
            const penetrationSuite = new PenetrationTestSuite();
            await penetrationSuite.runPenetrationTests();
            this.results.penetrationTests = penetrationSuite.testResults;
            await penetrationSuite.cleanup();

            console.log('\n' + '='.repeat(60));
            console.log('');

            // Run integrity verification tests
            console.log('🔍 TASK 21: Verifying File Integrity and Logging');
            console.log('Testing hash verification, audit log immutability, and alerting mechanisms...\n');
            
            const integritySuite = new IntegrityVerificationTestSuite();
            await integritySuite.runIntegrityTests();
            this.results.integrityTests = integritySuite.testResults;
            await integritySuite.cleanup();

            console.log('\n' + '='.repeat(60));
            console.log('');

            // Generate comprehensive report
            this.endTime = Date.now();
            await this.generateComprehensiveReport();

            // Determine overall status
            this.determineOverallStatus();

            console.log('\n🎉 PHASE 8 TESTING & VALIDATION COMPLETED');
            console.log('=' .repeat(60));
            console.log(`Overall Status: ${this.results.overallStatus}`);
            console.log(`Total Duration: ${((this.endTime - this.startTime) / 1000).toFixed(2)}s`);
            console.log('=' .repeat(60));

        } catch (error) {
            console.error('❌ Security testing failed:', error);
            this.results.overallStatus = 'FAILED';
            throw error;
        }
    }

    /**
     * Determine overall test status
     */
    determineOverallStatus() {
        const allResults = [
            ...this.results.securityTests,
            ...this.results.penetrationTests,
            ...this.results.integrityTests
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
     * Generate comprehensive security test report
     */
    async generateComprehensiveReport() {
        const allResults = [
            ...this.results.securityTests,
            ...this.results.penetrationTests,
            ...this.results.integrityTests
        ];

        const totalTests = allResults.length;
        const passedTests = allResults.filter(r => r.status === 'PASSED').length;
        const failedTests = allResults.filter(r => r.status === 'FAILED').length;
        const totalDuration = allResults.reduce((sum, r) => sum + r.duration, 0);

        // Categorize results
        const securityResults = this.results.securityTests.filter(r => r.status === 'FAILED');
        const penetrationResults = this.results.penetrationTests.filter(r => r.status === 'FAILED');
        const integrityResults = this.results.integrityTests.filter(r => r.status === 'FAILED');

        // Count vulnerabilities by severity
        const vulnerabilities = {
            critical: allResults.filter(r => r.status === 'FAILED' && r.severity === 'critical').length,
            high: allResults.filter(r => r.status === 'FAILED' && r.severity === 'high').length,
            medium: allResults.filter(r => r.status === 'FAILED' && r.severity === 'medium').length,
            low: allResults.filter(r => r.status === 'FAILED' && r.severity === 'low').length
        };

        const report = {
            metadata: {
                title: 'Document Sorter Security Testing & Validation Report',
                phase: 'Phase 8: Testing & Validation',
                timestamp: new Date().toISOString(),
                duration: this.endTime - this.startTime,
                version: '1.0.0'
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
                    status: securityResults.length === 0 ? 'PASSED' : 'FAILED',
                    failedTests: securityResults.length,
                    details: securityResults
                },
                task21: {
                    name: 'Verify File Integrity and Logging',
                    description: 'Test hash verification, audit log immutability, and alerting mechanisms',
                    status: integrityResults.length === 0 ? 'PASSED' : 'FAILED',
                    failedTests: integrityResults.length,
                    details: integrityResults
                },
                task22: {
                    name: 'Deploy Phased Rollout',
                    description: 'Deploy new secure system incrementally, monitor, and collect client feedback',
                    status: 'PENDING',
                    note: 'This task requires production deployment and monitoring setup'
                }
            },
            testSuites: {
                securityTests: {
                    name: 'Comprehensive Security Test Suite',
                    totalTests: this.results.securityTests.length,
                    passedTests: this.results.securityTests.filter(r => r.status === 'PASSED').length,
                    failedTests: this.results.securityTests.filter(r => r.status === 'FAILED').length,
                    categories: this.groupByCategory(this.results.securityTests)
                },
                penetrationTests: {
                    name: 'Penetration Testing Suite',
                    totalTests: this.results.penetrationTests.length,
                    passedTests: this.results.penetrationTests.filter(r => r.status === 'PASSED').length,
                    failedTests: this.results.penetrationTests.filter(r => r.status === 'FAILED').length,
                    categories: this.groupByCategory(this.results.penetrationTests)
                },
                integrityTests: {
                    name: 'Integrity Verification Test Suite',
                    totalTests: this.results.integrityTests.length,
                    passedTests: this.results.integrityTests.filter(r => r.status === 'PASSED').length,
                    failedTests: this.results.integrityTests.filter(r => r.status === 'FAILED').length,
                    categories: this.groupByCategory(this.results.integrityTests)
                }
            },
            recommendations: this.generateRecommendations(vulnerabilities, allResults),
            nextSteps: this.generateNextSteps(this.results.overallStatus),
            allResults
        };

        // Save detailed report
        const reportPath = path.join(__dirname, 'security-validation-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        // Generate human-readable summary
        await this.generateHumanReadableReport(report);

        console.log(`\n📄 Comprehensive security report saved to: ${reportPath}`);
    }

    /**
     * Group test results by category
     */
    groupByCategory(results) {
        const categories = {};
        results.forEach(result => {
            if (!categories[result.category]) {
                categories[result.category] = {
                    total: 0,
                    passed: 0,
                    failed: 0
                };
            }
            categories[result.category].total++;
            if (result.status === 'PASSED') {
                categories[result.category].passed++;
            } else {
                categories[result.category].failed++;
            }
        });
        return categories;
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
                details: 'Critical vulnerabilities pose immediate security risks and must be resolved'
            });
        }

        if (vulnerabilities.high > 0) {
            recommendations.push({
                priority: 'HIGH',
                category: 'Security',
                recommendation: 'Address high-severity vulnerabilities before production deployment',
                details: 'High-severity vulnerabilities should be resolved to maintain security posture'
            });
        }

        // Check for specific vulnerability patterns
        const authFailures = allResults.filter(r => r.status === 'FAILED' && r.category === 'Authentication').length;
        if (authFailures > 0) {
            recommendations.push({
                priority: 'HIGH',
                category: 'Authentication',
                recommendation: 'Review and strengthen authentication mechanisms',
                details: `${authFailures} authentication-related tests failed`
            });
        }

        const fileSystemFailures = allResults.filter(r => r.status === 'FAILED' && r.category === 'File System').length;
        if (fileSystemFailures > 0) {
            recommendations.push({
                priority: 'HIGH',
                category: 'File System',
                recommendation: 'Review file system security and access controls',
                details: `${fileSystemFailures} file system security tests failed`
            });
        }

        const injectionFailures = allResults.filter(r => r.status === 'FAILED' && r.category === 'Injection').length;
        if (injectionFailures > 0) {
            recommendations.push({
                priority: 'CRITICAL',
                category: 'Injection',
                recommendation: 'Implement proper input validation and sanitization',
                details: `${injectionFailures} injection attack tests failed - immediate attention required`
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
        const reportPath = path.join(__dirname, 'security-validation-summary.md');
        
        let markdown = `# Document Sorter Security Testing & Validation Report\n\n`;
        markdown += `**Phase 8: Testing & Validation**\n`;
        markdown += `**Generated:** ${new Date().toISOString()}\n`;
        markdown += `**Overall Status:** ${report.summary.overallStatus}\n\n`;

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

        if (report.recommendations.length > 0) {
            markdown += `## Recommendations\n\n`;
            report.recommendations.forEach((rec, index) => {
                markdown += `${index + 1}. **${rec.priority}** - ${rec.recommendation}\n`;
                markdown += `   ${rec.details}\n\n`;
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
    const runner = new SecurityTestRunner();
    runner.runAllTests()
        .then(() => {
            console.log('\n✅ Security testing completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Security testing failed:', error);
            process.exit(1);
        });
}

module.exports = SecurityTestRunner;
