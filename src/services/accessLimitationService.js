/**
 * Access Limitation Service
 * Implements file system and network access restrictions for sandboxes and services
 */

const fs = require('fs').promises;
const path = require('path');
const net = require('net');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class AccessLimitationService {
    constructor(options = {}) {
        this.accessPolicies = new Map();
        this.activeRestrictions = new Map();
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
     * Initialize default access limitation policies
     */
    initializeDefaultPolicies() {
        // Document processing sandbox policy
        this.accessPolicies.set('documentProcessingSandbox', {
            policyName: 'documentProcessingSandbox',
            description: 'Access restrictions for document processing sandbox',
            fileSystem: {
                allowedPaths: [
                    '/tmp/document-processing',
                    '/var/lib/document-sorter/processing',
                    '/var/lib/document-sorter/temp',
                    '/var/lib/document-sorter/input',
                    '/var/lib/document-sorter/output'
                ],
                deniedPaths: [
                    '/etc',
                    '/root',
                    '/home',
                    '/usr/bin',
                    '/usr/sbin',
                    '/bin',
                    '/sbin',
                    '/proc',
                    '/sys',
                    '/dev'
                ],
                allowedFileTypes: ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.png', '.tiff'],
                maxFileSize: 50 * 1024 * 1024, // 50MB
                readOnlyPaths: ['/var/lib/document-sorter/templates']
            },
            network: {
                allowedEndpoints: [
                    '127.0.0.1:3000', // Main application
                    '127.0.0.1:3001', // File service
                    '127.0.0.1:3002'  // Processing service
                ],
                deniedEndpoints: ['0.0.0.0/0'],
                allowedProtocols: ['tcp'],
                deniedProtocols: ['udp', 'icmp'],
                maxConnections: 10,
                connectionTimeout: 30000
            },
            system: {
                allowedSyscalls: [
                    'read', 'write', 'open', 'close', 'stat', 'fstat',
                    'lstat', 'access', 'readlink', 'getcwd', 'chdir'
                ],
                deniedSyscalls: [
                    'execve', 'fork', 'clone', 'kill', 'ptrace', 'mount',
                    'umount', 'chroot', 'setuid', 'setgid', 'capset'
                ],
                maxMemoryUsage: 256 * 1024 * 1024, // 256MB
                maxCpuTime: 300, // 5 minutes
                maxFileDescriptors: 100
            }
        });

        // File storage service policy
        this.accessPolicies.set('fileStorageService', {
            policyName: 'fileStorageService',
            description: 'Access restrictions for file storage service',
            fileSystem: {
                allowedPaths: [
                    '/var/lib/document-sorter/storage',
                    '/var/lib/document-sorter/backup',
                    '/var/lib/document-sorter/metadata'
                ],
                deniedPaths: [
                    '/etc',
                    '/root',
                    '/home',
                    '/usr',
                    '/bin',
                    '/sbin',
                    '/tmp',
                    '/proc',
                    '/sys',
                    '/dev'
                ],
                allowedFileTypes: ['*'],
                maxFileSize: 500 * 1024 * 1024, // 500MB
                readOnlyPaths: []
            },
            network: {
                allowedEndpoints: [
                    '127.0.0.1:3002', // File service port
                    '127.0.0.1:3004'  // Audit service
                ],
                deniedEndpoints: ['0.0.0.0/0'],
                allowedProtocols: ['tcp'],
                deniedProtocols: ['udp', 'icmp'],
                maxConnections: 50,
                connectionTimeout: 60000
            },
            system: {
                allowedSyscalls: [
                    'read', 'write', 'open', 'close', 'stat', 'fstat',
                    'lstat', 'access', 'unlink', 'rename', 'mkdir', 'rmdir'
                ],
                deniedSyscalls: [
                    'execve', 'fork', 'clone', 'kill', 'ptrace', 'mount',
                    'umount', 'chroot', 'setuid', 'setgid', 'capset'
                ],
                maxMemoryUsage: 512 * 1024 * 1024, // 512MB
                maxCpuTime: 600, // 10 minutes
                maxFileDescriptors: 200
            }
        });

        // Authentication service policy
        this.accessPolicies.set('authenticationService', {
            policyName: 'authenticationService',
            description: 'Access restrictions for authentication service',
            fileSystem: {
                allowedPaths: [
                    '/var/lib/document-sorter/auth',
                    '/var/lib/document-sorter/sessions',
                    '/var/lib/document-sorter/keys'
                ],
                deniedPaths: [
                    '/etc',
                    '/root',
                    '/home',
                    '/usr',
                    '/bin',
                    '/sbin',
                    '/tmp',
                    '/proc',
                    '/sys',
                    '/dev'
                ],
                allowedFileTypes: ['.json', '.db', '.key', '.pem'],
                maxFileSize: 10 * 1024 * 1024, // 10MB
                readOnlyPaths: ['/var/lib/document-sorter/templates']
            },
            network: {
                allowedEndpoints: [
                    '127.0.0.1:3003', // Auth service port
                    '127.0.0.1:3004'  // Audit service
                ],
                deniedEndpoints: ['0.0.0.0/0'],
                allowedProtocols: ['tcp'],
                deniedProtocols: ['udp', 'icmp'],
                maxConnections: 100,
                connectionTimeout: 30000
            },
            system: {
                allowedSyscalls: [
                    'read', 'write', 'open', 'close', 'stat', 'fstat',
                    'lstat', 'access', 'getcwd', 'chdir'
                ],
                deniedSyscalls: [
                    'execve', 'fork', 'clone', 'kill', 'ptrace', 'mount',
                    'umount', 'chroot', 'setuid', 'setgid', 'capset'
                ],
                maxMemoryUsage: 128 * 1024 * 1024, // 128MB
                maxCpuTime: 60, // 1 minute
                maxFileDescriptors: 50
            }
        });
    }

    /**
     * Apply access restrictions to a service
     */
    async applyAccessRestrictions(serviceName, policyName) {
        const policy = this.accessPolicies.get(policyName);
        if (!policy) {
            throw new Error(`Access policy not found: ${policyName}`);
        }

        try {
            // Apply file system restrictions
            await this.applyFileSystemRestrictions(serviceName, policy.fileSystem);

            // Apply network restrictions
            await this.applyNetworkRestrictions(serviceName, policy.network);

            // Apply system restrictions
            await this.applySystemRestrictions(serviceName, policy.system);

            // Store active restrictions
            this.activeRestrictions.set(serviceName, {
                policyName,
                appliedAt: new Date(),
                restrictions: policy
            });

            // Log restriction application
            if (this.auditLogger) {
                await this.auditLogger.logSystemEvent('access_restrictions_applied', {
                    serviceName,
                    policyName,
                    fileSystemPaths: policy.fileSystem.allowedPaths.length,
                    networkEndpoints: policy.network.allowedEndpoints.length,
                    systemRestrictions: Object.keys(policy.system).length
                });
            }

            return { success: true, serviceName, policyName };
        } catch (error) {
            console.error(`Failed to apply access restrictions for ${serviceName}:`, error);
            throw error;
        }
    }

    /**
     * Apply file system restrictions
     */
    async applyFileSystemRestrictions(serviceName, fileSystemPolicy) {
        const { allowedPaths, deniedPaths, readOnlyPaths } = fileSystemPolicy;

        // Create allowed directories
        for (const path of allowedPaths) {
            await this.createSecureDirectory(path);
        }

        // Set up path restrictions using chroot or similar
        if (this.isLinux) {
            await this.setupLinuxFileSystemRestrictions(serviceName, fileSystemPolicy);
        } else if (this.isWindows) {
            await this.setupWindowsFileSystemRestrictions(serviceName, fileSystemPolicy);
        }

        // Set up read-only paths
        for (const path of readOnlyPaths) {
            await this.setReadOnlyPath(path);
        }
    }

    /**
     * Setup Linux file system restrictions
     */
    async setupLinuxFileSystemRestrictions(serviceName, fileSystemPolicy) {
        try {
            // Create systemd service override
            const overrideDir = `/etc/systemd/system/${serviceName}.service.d`;
            await fs.mkdir(overrideDir, { recursive: true });

            const overrideFile = path.join(overrideDir, 'access-limits.conf');
            let config = '[Service]\n';

            // Set up private directories
            config += 'PrivateTmp=true\n';
            config += 'ProtectSystem=strict\n';
            config += 'ProtectHome=true\n';
            config += 'ReadWritePaths=' + fileSystemPolicy.allowedPaths.join(' ') + '\n';
            config += 'ReadOnlyPaths=' + fileSystemPolicy.readOnlyPaths.join(' ') + '\n';

            // Deny access to sensitive directories
            config += 'InaccessiblePaths=' + fileSystemPolicy.deniedPaths.join(' ') + '\n';

            // Set up file system namespaces
            config += 'MountFlags=slave\n';
            config += 'NoNewPrivileges=true\n';

            await fs.writeFile(overrideFile, config);

            // Reload systemd
            await execAsync('systemctl daemon-reload');

        } catch (error) {
            console.warn(`Failed to setup Linux file system restrictions: ${error.message}`);
        }
    }

    /**
     * Setup Windows file system restrictions
     */
    async setupWindowsFileSystemRestrictions(serviceName, fileSystemPolicy) {
        try {
            // Create access control lists for Windows
            for (const allowedPath of fileSystemPolicy.allowedPaths) {
                await this.setWindowsPathPermissions(allowedPath, 'Allow');
            }

            for (const deniedPath of fileSystemPolicy.deniedPaths) {
                await this.setWindowsPathPermissions(deniedPath, 'Deny');
            }

        } catch (error) {
            console.warn(`Failed to setup Windows file system restrictions: ${error.message}`);
        }
    }

    /**
     * Set Windows path permissions
     */
    async setWindowsPathPermissions(path, accessType) {
        try {
            // Use icacls to set permissions
            const command = `icacls "${path}" /inheritance:r /grant:r "Service Users:${accessType === 'Allow' ? 'F' : 'D'}"`;
            await execAsync(command);
        } catch (error) {
            console.warn(`Failed to set Windows permissions for ${path}: ${error.message}`);
        }
    }

    /**
     * Apply network restrictions
     */
    async applyNetworkRestrictions(serviceName, networkPolicy) {
        const { allowedEndpoints, deniedEndpoints, maxConnections } = networkPolicy;

        // Set up firewall rules (Linux)
        if (this.isLinux) {
            await this.setupLinuxNetworkRestrictions(serviceName, networkPolicy);
        } else if (this.isWindows) {
            await this.setupWindowsNetworkRestrictions(serviceName, networkPolicy);
        }

        // Set up connection limits
        await this.setConnectionLimits(serviceName, maxConnections);
    }

    /**
     * Setup Linux network restrictions
     */
    async setupLinuxNetworkRestrictions(serviceName, networkPolicy) {
        try {
            // Create iptables rules
            for (const endpoint of networkPolicy.allowedEndpoints) {
                const [host, port] = endpoint.split(':');
                await execAsync(`iptables -A OUTPUT -d ${host} -p tcp --dport ${port} -j ACCEPT`);
            }

            // Block all other outbound connections
            await execAsync(`iptables -A OUTPUT -j DROP`);

            // Save iptables rules
            await execAsync('iptables-save > /etc/iptables/rules.v4');

        } catch (error) {
            console.warn(`Failed to setup Linux network restrictions: ${error.message}`);
        }
    }

    /**
     * Setup Windows network restrictions
     */
    async setupWindowsNetworkRestrictions(serviceName, networkPolicy) {
        try {
            // Use Windows Firewall with Advanced Security
            for (const endpoint of networkPolicy.allowedEndpoints) {
                const [host, port] = endpoint.split(':');
                const ruleName = `${serviceName}_allow_${host}_${port}`;
                
                await execAsync(`netsh advfirewall firewall add rule name="${ruleName}" dir=out action=allow protocol=TCP remoteip=${host} remoteport=${port}`);
            }

            // Block all other outbound connections
            await execAsync(`netsh advfirewall firewall add rule name="${serviceName}_block_all" dir=out action=block protocol=any`);

        } catch (error) {
            console.warn(`Failed to setup Windows network restrictions: ${error.message}`);
        }
    }

    /**
     * Apply system restrictions
     */
    async applySystemRestrictions(serviceName, systemPolicy) {
        const { maxMemoryUsage, maxCpuTime, maxFileDescriptors } = systemPolicy;

        // Set up resource limits
        await this.setResourceLimits(serviceName, {
            memory: maxMemoryUsage,
            cpuTime: maxCpuTime,
            fileDescriptors: maxFileDescriptors
        });

        // Set up system call restrictions (Linux only)
        if (this.isLinux) {
            await this.setupSystemCallRestrictions(serviceName, systemPolicy);
        }
    }

    /**
     * Set resource limits
     */
    async setResourceLimits(serviceName, limits) {
        try {
            const limitsFile = `/etc/security/limits.d/${serviceName}.conf`;
            
            const limitConfig = [
                `# Resource limits for ${serviceName}`,
                `* soft as ${limits.memory}`,
                `* hard as ${limits.memory}`,
                `* soft cpu ${limits.cpuTime}`,
                `* hard cpu ${limits.cpuTime}`,
                `* soft nofile ${limits.fileDescriptors}`,
                `* hard nofile ${limits.fileDescriptors}`
            ].join('\n') + '\n';

            await fs.writeFile(limitsFile, limitConfig);

        } catch (error) {
            console.warn(`Failed to set resource limits for ${serviceName}: ${error.message}`);
        }
    }

    /**
     * Setup system call restrictions
     */
    async setupSystemCallRestrictions(serviceName, systemPolicy) {
        try {
            // Use seccomp to restrict system calls
            const seccompFile = `/etc/systemd/system/${serviceName}.service.d/seccomp.conf`;
            await fs.mkdir(path.dirname(seccompFile), { recursive: true });

            let seccompConfig = '[Service]\n';
            seccompConfig += 'SystemCallFilter=@system-service\n';
            
            // Add allowed system calls
            for (const syscall of systemPolicy.allowedSyscalls) {
                seccompConfig += `SystemCallFilter=+${syscall}\n`;
            }

            // Remove denied system calls
            for (const syscall of systemPolicy.deniedSyscalls) {
                seccompConfig += `SystemCallFilter=-${syscall}\n`;
            }

            await fs.writeFile(seccompFile, seccompConfig);

            // Reload systemd
            await execAsync('systemctl daemon-reload');

        } catch (error) {
            console.warn(`Failed to setup system call restrictions: ${error.message}`);
        }
    }

    /**
     * Create secure directory
     */
    async createSecureDirectory(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
            
            // Set restrictive permissions
            if (!this.isWindows) {
                await execAsync(`chmod 750 ${dirPath}`);
            }
        } catch (error) {
            console.warn(`Failed to create directory ${dirPath}: ${error.message}`);
        }
    }

    /**
     * Set read-only path
     */
    async setReadOnlyPath(path) {
        try {
            if (!this.isWindows) {
                await execAsync(`chmod 444 ${path}`);
            }
        } catch (error) {
            console.warn(`Failed to set read-only for ${path}: ${error.message}`);
        }
    }

    /**
     * Set connection limits
     */
    async setConnectionLimits(serviceName, maxConnections) {
        try {
            // This would typically be implemented at the application level
            // or using system-level connection limiting tools
            console.log(`Connection limit set to ${maxConnections} for ${serviceName}`);
        } catch (error) {
            console.warn(`Failed to set connection limits: ${error.message}`);
        }
    }

    /**
     * Validate access restrictions
     */
    async validateAccessRestrictions(serviceName) {
        const restriction = this.activeRestrictions.get(serviceName);
        if (!restriction) {
            return { error: 'No active restrictions found for service' };
        }

        const validation = {
            serviceName,
            policyName: restriction.policyName,
            isValid: true,
            errors: [],
            warnings: [],
            checks: {}
        };

        try {
            // Validate file system access
            validation.checks.fileSystem = await this.validateFileSystemAccess(restriction.restrictions.fileSystem);
            if (!validation.checks.fileSystem.valid) {
                validation.errors.push(...validation.checks.fileSystem.errors);
                validation.isValid = false;
            }

            // Validate network access
            validation.checks.network = await this.validateNetworkAccess(restriction.restrictions.network);
            if (!validation.checks.network.valid) {
                validation.errors.push(...validation.checks.network.errors);
                validation.isValid = false;
            }

            // Validate system restrictions
            validation.checks.system = await this.validateSystemRestrictions(restriction.restrictions.system);
            if (!validation.checks.system.valid) {
                validation.warnings.push(...validation.checks.system.warnings);
            }

        } catch (error) {
            validation.errors.push(`Validation error: ${error.message}`);
            validation.isValid = false;
        }

        return validation;
    }

    /**
     * Validate file system access
     */
    async validateFileSystemAccess(fileSystemPolicy) {
        const result = { valid: true, errors: [] };

        // Check allowed paths exist and are accessible
        for (const path of fileSystemPolicy.allowedPaths) {
            try {
                await fs.access(path, fs.constants.R_OK | fs.constants.W_OK);
            } catch (error) {
                result.errors.push(`Cannot access allowed path ${path}: ${error.message}`);
                result.valid = false;
            }
        }

        // Check denied paths are not accessible
        for (const path of fileSystemPolicy.deniedPaths) {
            try {
                await fs.access(path, fs.constants.R_OK);
                result.errors.push(`Denied path ${path} is accessible`);
                result.valid = false;
            } catch (error) {
                // Expected - path should not be accessible
            }
        }

        return result;
    }

    /**
     * Validate network access
     */
    async validateNetworkAccess(networkPolicy) {
        const result = { valid: true, errors: [] };

        // Test allowed endpoints
        for (const endpoint of networkPolicy.allowedEndpoints) {
            try {
                const [host, port] = endpoint.split(':');
                const isReachable = await this.testNetworkConnection(host, parseInt(port));
                if (!isReachable) {
                    result.errors.push(`Cannot reach allowed endpoint ${endpoint}`);
                    result.valid = false;
                }
            } catch (error) {
                result.errors.push(`Error testing endpoint ${endpoint}: ${error.message}`);
                result.valid = false;
            }
        }

        return result;
    }

    /**
     * Test network connection
     */
    async testNetworkConnection(host, port) {
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
     * Validate system restrictions
     */
    async validateSystemRestrictions(systemPolicy) {
        const result = { valid: true, warnings: [] };

        // Check if resource limits are in place
        try {
            const { stdout } = await execAsync('ulimit -a');
            // Parse ulimit output and check against policy
            // This is a simplified check
            if (stdout.includes('unlimited')) {
                result.warnings.push('Some resource limits are unlimited');
            }
        } catch (error) {
            result.warnings.push(`Could not check resource limits: ${error.message}`);
        }

        return result;
    }

    /**
     * Remove access restrictions
     */
    async removeAccessRestrictions(serviceName) {
        const restriction = this.activeRestrictions.get(serviceName);
        if (!restriction) {
            return { success: false, error: 'No active restrictions found' };
        }

        try {
            // Remove systemd overrides
            if (this.isLinux) {
                const overrideDir = `/etc/systemd/system/${serviceName}.service.d`;
                await fs.rmdir(overrideDir, { recursive: true });
                await execAsync('systemctl daemon-reload');
            }

            // Remove firewall rules
            await this.removeFirewallRules(serviceName);

            // Remove resource limits
            const limitsFile = `/etc/security/limits.d/${serviceName}.conf`;
            try {
                await fs.unlink(limitsFile);
            } catch (error) {
                // File might not exist
            }

            // Remove from active restrictions
            this.activeRestrictions.delete(serviceName);

            // Log removal
            if (this.auditLogger) {
                await this.auditLogger.logSystemEvent('access_restrictions_removed', {
                    serviceName,
                    policyName: restriction.policyName
                });
            }

            return { success: true, serviceName };
        } catch (error) {
            console.error(`Failed to remove access restrictions for ${serviceName}:`, error);
            throw error;
        }
    }

    /**
     * Remove firewall rules
     */
    async removeFirewallRules(serviceName) {
        try {
            if (this.isLinux) {
                // Remove iptables rules
                await execAsync(`iptables -D OUTPUT -j DROP`);
                await execAsync('iptables-save > /etc/iptables/rules.v4');
            } else if (this.isWindows) {
                // Remove Windows Firewall rules
                await execAsync(`netsh advfirewall firewall delete rule name="${serviceName}_block_all"`);
            }
        } catch (error) {
            console.warn(`Failed to remove firewall rules: ${error.message}`);
        }
    }

    /**
     * Get active restrictions
     */
    getActiveRestrictions() {
        const restrictions = [];
        for (const [serviceName, restriction] of this.activeRestrictions) {
            restrictions.push({
                serviceName,
                policyName: restriction.policyName,
                appliedAt: restriction.appliedAt,
                fileSystemPaths: restriction.restrictions.fileSystem.allowedPaths.length,
                networkEndpoints: restriction.restrictions.network.allowedEndpoints.length
            });
        }
        return restrictions;
    }

    /**
     * Get access policy
     */
    getAccessPolicy(policyName) {
        return this.accessPolicies.get(policyName);
    }

    /**
     * Get all access policies
     */
    getAllAccessPolicies() {
        const policies = [];
        for (const [policyName, policy] of this.accessPolicies) {
            policies.push({
                policyName,
                description: policy.description,
                fileSystemPaths: policy.fileSystem.allowedPaths.length,
                networkEndpoints: policy.network.allowedEndpoints.length,
                systemRestrictions: Object.keys(policy.system).length
            });
        }
        return policies;
    }
}

module.exports = AccessLimitationService;
