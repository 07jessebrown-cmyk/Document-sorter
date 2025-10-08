/**
 * Network Isolation Service
 * Implements private networks, firewalls, and security groups for sandbox communication
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const net = require('net');

const execAsync = promisify(exec);

class NetworkIsolationService {
    constructor(options = {}) {
        this.isolationPolicies = new Map();
        this.activeIsolations = new Map();
        this.auditLogger = null;
        this.isWindows = process.platform === 'win32';
        this.isLinux = process.platform === 'linux';
        this.isMacOS = process.platform === 'darwin';
        this.initializeDefaultPolicies();
    }

    /**
     * Set audit logger reference
     */
    setAuditLogger(auditLogger) {
        this.auditLogger = auditLogger;
    }

    /**
     * Initialize default network isolation policies
     */
    initializeDefaultPolicies() {
        // Document processing network isolation
        this.isolationPolicies.set('documentProcessingNetwork', {
            policyName: 'documentProcessingNetwork',
            description: 'Isolated network for document processing sandboxes',
            networkConfig: {
                networkName: 'document-processing-net',
                subnet: '172.20.0.0/24',
                gateway: '172.20.0.1',
                dnsServers: ['8.8.8.8', '8.8.4.4'],
                mtu: 1500
            },
            allowedServices: [
                {
                    serviceName: 'document-processor',
                    containerName: 'doc-processor-1',
                    ipAddress: '172.20.0.10',
                    ports: [3000, 3001],
                    allowedConnections: ['172.20.0.20', '172.20.0.30']
                },
                {
                    serviceName: 'file-storage',
                    containerName: 'file-storage-1',
                    ipAddress: '172.20.0.20',
                    ports: [3002],
                    allowedConnections: ['172.20.0.10', '172.20.0.30']
                },
                {
                    serviceName: 'audit-logger',
                    containerName: 'audit-logger-1',
                    ipAddress: '172.20.0.30',
                    ports: [3004],
                    allowedConnections: ['172.20.0.10', '172.20.0.20']
                }
            ],
            firewallRules: [
                {
                    action: 'ACCEPT',
                    source: '172.20.0.0/24',
                    destination: '172.20.0.0/24',
                    protocol: 'tcp',
                    ports: [3000, 3001, 3002, 3004]
                },
                {
                    action: 'DROP',
                    source: '0.0.0.0/0',
                    destination: '172.20.0.0/24',
                    protocol: 'any'
                },
                {
                    action: 'DROP',
                    source: '172.20.0.0/24',
                    destination: '0.0.0.0/0',
                    protocol: 'any'
                }
            ],
            securityGroups: [
                {
                    groupName: 'document-processing-sg',
                    description: 'Security group for document processing services',
                    inboundRules: [
                        {
                            protocol: 'tcp',
                            ports: [3000, 3001],
                            source: '172.20.0.0/24',
                            description: 'Allow internal document processing'
                        }
                    ],
                    outboundRules: [
                        {
                            protocol: 'tcp',
                            ports: [3002, 3004],
                            destination: '172.20.0.0/24',
                            description: 'Allow internal service communication'
                        }
                    ]
                }
            ]
        });

        // Authentication service network isolation
        this.isolationPolicies.set('authenticationNetwork', {
            policyName: 'authenticationNetwork',
            description: 'Isolated network for authentication services',
            networkConfig: {
                networkName: 'auth-services-net',
                subnet: '172.21.0.0/24',
                gateway: '172.21.0.1',
                dnsServers: ['8.8.8.8', '8.8.4.4'],
                mtu: 1500
            },
            allowedServices: [
                {
                    serviceName: 'authentication',
                    containerName: 'auth-service-1',
                    ipAddress: '172.21.0.10',
                    ports: [3003],
                    allowedConnections: ['172.21.0.20']
                },
                {
                    serviceName: 'rbac',
                    containerName: 'rbac-service-1',
                    ipAddress: '172.21.0.20',
                    ports: [3005],
                    allowedConnections: ['172.21.0.10']
                }
            ],
            firewallRules: [
                {
                    action: 'ACCEPT',
                    source: '172.21.0.0/24',
                    destination: '172.21.0.0/24',
                    protocol: 'tcp',
                    ports: [3003, 3005]
                },
                {
                    action: 'DROP',
                    source: '0.0.0.0/0',
                    destination: '172.21.0.0/24',
                    protocol: 'any'
                }
            ],
            securityGroups: [
                {
                    groupName: 'auth-services-sg',
                    description: 'Security group for authentication services',
                    inboundRules: [
                        {
                            protocol: 'tcp',
                            ports: [3003, 3005],
                            source: '172.21.0.0/24',
                            description: 'Allow internal auth communication'
                        }
                    ],
                    outboundRules: [
                        {
                            protocol: 'tcp',
                            ports: [3003, 3005],
                            destination: '172.21.0.0/24',
                            description: 'Allow internal auth communication'
                        }
                    ]
                }
            ]
        });

        // Management network isolation
        this.isolationPolicies.set('managementNetwork', {
            policyName: 'managementNetwork',
            description: 'Isolated network for management and monitoring services',
            networkConfig: {
                networkName: 'management-net',
                subnet: '172.22.0.0/24',
                gateway: '172.22.0.1',
                dnsServers: ['8.8.8.8', '8.8.4.4'],
                mtu: 1500
            },
            allowedServices: [
                {
                    serviceName: 'monitoring',
                    containerName: 'monitoring-1',
                    ipAddress: '172.22.0.10',
                    ports: [9090, 3000],
                    allowedConnections: ['172.22.0.20', '172.22.0.30']
                },
                {
                    serviceName: 'logging',
                    containerName: 'logging-1',
                    ipAddress: '172.22.0.20',
                    ports: [9200, 5601],
                    allowedConnections: ['172.22.0.10', '172.22.0.30']
                },
                {
                    serviceName: 'alerting',
                    containerName: 'alerting-1',
                    ipAddress: '172.22.0.30',
                    ports: [9093],
                    allowedConnections: ['172.22.0.10', '172.22.0.20']
                }
            ],
            firewallRules: [
                {
                    action: 'ACCEPT',
                    source: '172.22.0.0/24',
                    destination: '172.22.0.0/24',
                    protocol: 'tcp',
                    ports: [9090, 3000, 9200, 5601, 9093]
                },
                {
                    action: 'ACCEPT',
                    source: '172.20.0.0/24',
                    destination: '172.22.0.0/24',
                    protocol: 'tcp',
                    ports: [9200, 5601]
                },
                {
                    action: 'DROP',
                    source: '0.0.0.0/0',
                    destination: '172.22.0.0/24',
                    protocol: 'any'
                }
            ],
            securityGroups: [
                {
                    groupName: 'management-sg',
                    description: 'Security group for management services',
                    inboundRules: [
                        {
                            protocol: 'tcp',
                            ports: [9090, 3000, 9200, 5601, 9093],
                            source: '172.22.0.0/24',
                            description: 'Allow internal management communication'
                        },
                        {
                            protocol: 'tcp',
                            ports: [9200, 5601],
                            source: '172.20.0.0/24',
                            description: 'Allow logging from processing network'
                        }
                    ],
                    outboundRules: [
                        {
                            protocol: 'tcp',
                            ports: [9090, 3000, 9200, 5601, 9093],
                            destination: '172.22.0.0/24',
                            description: 'Allow internal management communication'
                        }
                    ]
                }
            ]
        });
    }

    /**
     * Apply network isolation policy
     */
    async applyNetworkIsolation(policyName) {
        const policy = this.isolationPolicies.get(policyName);
        if (!policy) {
            throw new Error(`Network isolation policy not found: ${policyName}`);
        }

        try {
            // Create isolated network
            await this.createIsolatedNetwork(policy.networkConfig);

            // Configure firewall rules
            await this.configureFirewallRules(policy.firewallRules, policyName);

            // Create security groups
            await this.createSecurityGroups(policy.securityGroups, policyName);

            // Configure service containers
            await this.configureServiceContainers(policy.allowedServices, policyName);

            // Store active isolation
            this.activeIsolations.set(policyName, {
                policy,
                appliedAt: new Date(),
                status: 'active'
            });

            // Log isolation application
            if (this.auditLogger) {
                await this.auditLogger.logSystemEvent('network_isolation_applied', {
                    policyName,
                    networkName: policy.networkConfig.networkName,
                    subnet: policy.networkConfig.subnet,
                    services: policy.allowedServices.length,
                    firewallRules: policy.firewallRules.length
                });
            }

            return { success: true, policyName, networkName: policy.networkConfig.networkName };
        } catch (error) {
            console.error(`Failed to apply network isolation for ${policyName}:`, error);
            throw error;
        }
    }

    /**
     * Create isolated network
     */
    async createIsolatedNetwork(networkConfig) {
        const { networkName, subnet, gateway, dnsServers, mtu } = networkConfig;

        try {
            if (this.isLinux) {
                // Create Docker network
                const dnsArgs = dnsServers.map(dns => `--dns=${dns}`).join(' ');
                const command = `docker network create --driver bridge --subnet=${subnet} --gateway=${gateway} ${dnsArgs} --opt com.docker.network.driver.mtu=${mtu} ${networkName}`;
                await execAsync(command);
            } else if (this.isWindows) {
                // Create Windows network using Hyper-V
                await execAsync(`New-VMSwitch -Name "${networkName}" -SwitchType Internal`);
                await execAsync(`New-NetIPAddress -IPAddress ${gateway} -PrefixLength 24 -InterfaceAlias "vEthernet (${networkName})"`);
            } else if (this.isMacOS) {
                // Create macOS network using Docker Desktop
                const dnsArgs = dnsServers.map(dns => `--dns=${dns}`).join(' ');
                const command = `docker network create --driver bridge --subnet=${subnet} --gateway=${gateway} ${dnsArgs} ${networkName}`;
                await execAsync(command);
            }

            console.log(`Created isolated network: ${networkName}`);
        } catch (error) {
            console.warn(`Failed to create network ${networkName}:`, error.message);
        }
    }

    /**
     * Configure firewall rules
     */
    async configureFirewallRules(firewallRules, policyName) {
        for (const rule of firewallRules) {
            try {
                await this.createFirewallRule(rule, policyName);
            } catch (error) {
                console.warn(`Failed to create firewall rule:`, error.message);
            }
        }
    }

    /**
     * Create individual firewall rule
     */
    async createFirewallRule(rule, policyName) {
        const { action, source, destination, protocol, ports } = rule;

        try {
            if (this.isLinux) {
                // Use iptables for Linux
                for (const port of ports) {
                    const command = `iptables -A FORWARD -s ${source} -d ${destination} -p ${protocol} --dport ${port} -j ${action}`;
                    await execAsync(command);
                }
            } else if (this.isWindows) {
                // Use Windows Firewall
                const ruleName = `${policyName}_${action}_${source}_${destination}_${protocol}`;
                const portList = ports.join(',');
                const command = `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=${action.toLowerCase()} protocol=${protocol} localport=${portList} remoteip=${source}`;
                await execAsync(command);
            } else if (this.isMacOS) {
                // Use pfctl for macOS
                const portList = ports.join(',');
                const command = `echo "pass ${action.toLowerCase()} from ${source} to ${destination} proto ${protocol} port {${portList}}" | pfctl -f -`;
                await execAsync(command);
            }
        } catch (error) {
            console.warn(`Failed to create firewall rule:`, error.message);
        }
    }

    /**
     * Create security groups
     */
    async createSecurityGroups(securityGroups, policyName) {
        for (const group of securityGroups) {
            try {
                await this.createSecurityGroup(group, policyName);
            } catch (error) {
                console.warn(`Failed to create security group ${group.groupName}:`, error.message);
            }
        }
    }

    /**
     * Create individual security group
     */
    async createSecurityGroup(group, policyName) {
        const { groupName, description, inboundRules, outboundRules } = group;

        try {
            // Create security group configuration file
            const configDir = `/etc/network-security/${policyName}`;
            await fs.mkdir(configDir, { recursive: true });

            const configFile = path.join(configDir, `${groupName}.conf`);
            let config = `# Security Group: ${groupName}\n`;
            config += `# Description: ${description}\n\n`;

            // Add inbound rules
            config += `[INBOUND_RULES]\n`;
            for (const rule of inboundRules) {
                config += `protocol=${rule.protocol}\n`;
                config += `ports=${rule.ports.join(',')}\n`;
                config += `source=${rule.source}\n`;
                config += `description=${rule.description}\n\n`;
            }

            // Add outbound rules
            config += `[OUTBOUND_RULES]\n`;
            for (const rule of outboundRules) {
                config += `protocol=${rule.protocol}\n`;
                config += `ports=${rule.ports.join(',')}\n`;
                config += `destination=${rule.destination}\n`;
                config += `description=${rule.description}\n\n`;
            }

            await fs.writeFile(configFile, config);
            await fs.chmod(configFile, 644);

        } catch (error) {
            console.warn(`Failed to create security group configuration:`, error.message);
        }
    }

    /**
     * Configure service containers
     */
    async configureServiceContainers(services, policyName) {
        for (const service of services) {
            try {
                await this.configureServiceContainer(service, policyName);
            } catch (error) {
                console.warn(`Failed to configure container ${service.containerName}:`, error.message);
            }
        }
    }

    /**
     * Configure individual service container
     */
    async configureServiceContainer(service, policyName) {
        const { serviceName, containerName, ipAddress, ports, allowedConnections } = service;
        const policy = this.isolationPolicies.get(policyName);
        const networkName = policy.networkConfig.networkName;

        try {
            // Create container with network isolation
            const portMappings = ports.map(port => `-p ${port}:${port}`).join(' ');
            const command = `docker run -d --name ${containerName} --network ${networkName} --ip ${ipAddress} ${portMappings} ${serviceName}`;
            await execAsync(command);

            // Configure container-specific firewall rules
            await this.configureContainerFirewall(service, policyName);

            console.log(`Configured container: ${containerName} on network: ${networkName}`);
        } catch (error) {
            console.warn(`Failed to configure container ${containerName}:`, error.message);
        }
    }

    /**
     * Configure container-specific firewall rules
     */
    async configureContainerFirewall(service, policyName) {
        const { containerName, ipAddress, allowedConnections } = service;

        try {
            if (this.isLinux) {
                // Create container-specific iptables rules
                for (const allowedIP of allowedConnections) {
                    const command = `iptables -A FORWARD -s ${ipAddress} -d ${allowedIP} -j ACCEPT`;
                    await execAsync(command);
                }
            }
        } catch (error) {
            console.warn(`Failed to configure container firewall for ${containerName}:`, error.message);
        }
    }

    /**
     * Validate network isolation
     */
    async validateNetworkIsolation(policyName) {
        const isolation = this.activeIsolations.get(policyName);
        if (!isolation) {
            return { error: 'No active isolation found for policy' };
        }

        const validation = {
            policyName,
            isValid: true,
            errors: [],
            warnings: [],
            checks: {}
        };

        try {
            const policy = isolation.policy;

            // Check network exists
            validation.checks.networkExists = await this.checkNetworkExists(policy.networkConfig.networkName);
            if (!validation.checks.networkExists) {
                validation.errors.push(`Network ${policy.networkConfig.networkName} does not exist`);
                validation.isValid = false;
            }

            // Check containers are running
            validation.checks.containersRunning = await this.checkContainersRunning(policy.allowedServices);
            if (!validation.checks.containersRunning.valid) {
                validation.errors.push(...validation.checks.containersRunning.errors);
                validation.isValid = false;
            }

            // Check firewall rules
            validation.checks.firewallRules = await this.checkFirewallRules(policy.firewallRules);
            if (!validation.checks.firewallRules.valid) {
                validation.warnings.push(...validation.checks.firewallRules.warnings);
            }

            // Test network connectivity
            validation.checks.connectivity = await this.testNetworkConnectivity(policy.allowedServices);
            if (!validation.checks.connectivity.valid) {
                validation.errors.push(...validation.checks.connectivity.errors);
                validation.isValid = false;
            }

        } catch (error) {
            validation.errors.push(`Validation error: ${error.message}`);
            validation.isValid = false;
        }

        return validation;
    }

    /**
     * Check if network exists
     */
    async checkNetworkExists(networkName) {
        try {
            if (this.isLinux || this.isMacOS) {
                await execAsync(`docker network inspect ${networkName}`);
                return true;
            } else if (this.isWindows) {
                await execAsync(`Get-VMSwitch -Name "${networkName}"`);
                return true;
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if containers are running
     */
    async checkContainersRunning(services) {
        const result = { valid: true, errors: [] };

        for (const service of services) {
            try {
                if (this.isLinux || this.isMacOS) {
                    const { stdout } = await execAsync(`docker ps --filter name=${service.containerName} --format "{{.Status}}"`);
                    if (!stdout.includes('Up')) {
                        result.errors.push(`Container ${service.containerName} is not running`);
                        result.valid = false;
                    }
                }
            } catch (error) {
                result.errors.push(`Failed to check container ${service.containerName}: ${error.message}`);
                result.valid = false;
            }
        }

        return result;
    }

    /**
     * Check firewall rules
     */
    async checkFirewallRules(firewallRules) {
        const result = { valid: true, warnings: [] };

        try {
            if (this.isLinux) {
                const { stdout } = await execAsync('iptables -L FORWARD -n');
                // Parse iptables output and check for rules
                // This is a simplified check
                if (!stdout.includes('ACCEPT') && !stdout.includes('DROP')) {
                    result.warnings.push('No firewall rules found');
                }
            }
        } catch (error) {
            result.warnings.push(`Could not check firewall rules: ${error.message}`);
        }

        return result;
    }

    /**
     * Test network connectivity
     */
    async testNetworkConnectivity(services) {
        const result = { valid: true, errors: [] };

        for (const service of services) {
            for (const port of service.ports) {
                try {
                    const isReachable = await this.testConnection(service.ipAddress, port);
                    if (!isReachable) {
                        result.errors.push(`Cannot reach ${service.ipAddress}:${port}`);
                        result.valid = false;
                    }
                } catch (error) {
                    result.errors.push(`Error testing ${service.ipAddress}:${port}: ${error.message}`);
                    result.valid = false;
                }
            }
        }

        return result;
    }

    /**
     * Test network connection
     */
    async testConnection(host, port) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            const timeout = 5000;

            socket.setTimeout(timeout);
            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            socket.on('error', () => {
                resolve(false);
            });

            socket.connect(port, host);
        });
    }

    /**
     * Remove network isolation
     */
    async removeNetworkIsolation(policyName) {
        const isolation = this.activeIsolations.get(policyName);
        if (!isolation) {
            return { success: false, error: 'No active isolation found' };
        }

        try {
            const policy = isolation.policy;

            // Stop and remove containers
            for (const service of policy.allowedServices) {
                try {
                    await execAsync(`docker stop ${service.containerName}`);
                    await execAsync(`docker rm ${service.containerName}`);
                } catch (error) {
                    console.warn(`Failed to remove container ${service.containerName}:`, error.message);
                }
            }

            // Remove firewall rules
            await this.removeFirewallRules(policy.firewallRules, policyName);

            // Remove network
            await this.removeNetwork(policy.networkConfig.networkName);

            // Remove from active isolations
            this.activeIsolations.delete(policyName);

            // Log removal
            if (this.auditLogger) {
                await this.auditLogger.logSystemEvent('network_isolation_removed', {
                    policyName,
                    networkName: policy.networkConfig.networkName
                });
            }

            return { success: true, policyName };
        } catch (error) {
            console.error(`Failed to remove network isolation for ${policyName}:`, error);
            throw error;
        }
    }

    /**
     * Remove firewall rules
     */
    async removeFirewallRules(firewallRules, policyName) {
        for (const rule of firewallRules) {
            try {
                await this.removeFirewallRule(rule, policyName);
            } catch (error) {
                console.warn(`Failed to remove firewall rule:`, error.message);
            }
        }
    }

    /**
     * Remove individual firewall rule
     */
    async removeFirewallRule(rule, policyName) {
        const { action, source, destination, protocol, ports } = rule;

        try {
            if (this.isLinux) {
                for (const port of ports) {
                    const command = `iptables -D FORWARD -s ${source} -d ${destination} -p ${protocol} --dport ${port} -j ${action}`;
                    await execAsync(command);
                }
            } else if (this.isWindows) {
                const ruleName = `${policyName}_${action}_${source}_${destination}_${protocol}`;
                const command = `netsh advfirewall firewall delete rule name="${ruleName}"`;
                await execAsync(command);
            }
        } catch (error) {
            console.warn(`Failed to remove firewall rule:`, error.message);
        }
    }

    /**
     * Remove network
     */
    async removeNetwork(networkName) {
        try {
            if (this.isLinux || this.isMacOS) {
                await execAsync(`docker network rm ${networkName}`);
            } else if (this.isWindows) {
                await execAsync(`Remove-VMSwitch -Name "${networkName}" -Force`);
            }
        } catch (error) {
            console.warn(`Failed to remove network ${networkName}:`, error.message);
        }
    }

    /**
     * Get active isolations
     */
    getActiveIsolations() {
        const isolations = [];
        for (const [policyName, isolation] of this.activeIsolations) {
            isolations.push({
                policyName,
                networkName: isolation.policy.networkConfig.networkName,
                appliedAt: isolation.appliedAt,
                status: isolation.status,
                services: isolation.policy.allowedServices.length
            });
        }
        return isolations;
    }

    /**
     * Get isolation policy
     */
    getIsolationPolicy(policyName) {
        return this.isolationPolicies.get(policyName);
    }

    /**
     * Get all isolation policies
     */
    getAllIsolationPolicies() {
        const policies = [];
        for (const [policyName, policy] of this.isolationPolicies) {
            policies.push({
                policyName,
                description: policy.description,
                networkName: policy.networkConfig.networkName,
                subnet: policy.networkConfig.subnet,
                services: policy.allowedServices.length,
                firewallRules: policy.firewallRules.length
            });
        }
        return policies;
    }
}

module.exports = NetworkIsolationService;

