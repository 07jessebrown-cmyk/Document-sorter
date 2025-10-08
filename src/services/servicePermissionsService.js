/**
 * Service Permissions Management Service
 * Ensures all services run with least-privilege principles and non-root accounts
 */

const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class ServicePermissionsService {
    constructor(options = {}) {
        this.serviceUsers = new Map();
        this.permissionPolicies = new Map();
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
     * Initialize default permission policies for services
     */
    initializeDefaultPolicies() {
        // Document processing service permissions
        this.permissionPolicies.set('documentProcessor', {
            serviceName: 'documentProcessor',
            requiredUser: 'doc-processor',
            requiredGroup: 'doc-processor',
            allowedDirectories: [
                '/tmp/document-processing',
                '/var/lib/document-sorter/processing',
                '/var/lib/document-sorter/temp'
            ],
            allowedFiles: [
                '*.pdf',
                '*.doc',
                '*.docx',
                '*.txt',
                '*.jpg',
                '*.png'
            ],
            deniedDirectories: [
                '/etc',
                '/root',
                '/home',
                '/usr/bin',
                '/usr/sbin',
                '/bin',
                '/sbin'
            ],
            networkAccess: {
                allowed: ['127.0.0.1:3000', '127.0.0.1:3001'],
                denied: ['0.0.0.0/0']
            },
            systemCalls: {
                allowed: ['read', 'write', 'open', 'close', 'stat'],
                denied: ['execve', 'fork', 'clone', 'kill', 'ptrace']
            },
            capabilities: {
                required: [],
                denied: ['CAP_SYS_ADMIN', 'CAP_SYS_MODULE', 'CAP_SYS_RAWIO']
            }
        });

        // File storage service permissions
        this.permissionPolicies.set('fileStorage', {
            serviceName: 'fileStorage',
            requiredUser: 'file-storage',
            requiredGroup: 'file-storage',
            allowedDirectories: [
                '/var/lib/document-sorter/storage',
                '/var/lib/document-sorter/backup'
            ],
            allowedFiles: ['*'],
            deniedDirectories: [
                '/etc',
                '/root',
                '/home',
                '/usr',
                '/bin',
                '/sbin',
                '/tmp'
            ],
            networkAccess: {
                allowed: ['127.0.0.1:3002'],
                denied: ['0.0.0.0/0']
            },
            systemCalls: {
                allowed: ['read', 'write', 'open', 'close', 'stat', 'unlink'],
                denied: ['execve', 'fork', 'clone', 'kill', 'ptrace', 'mount']
            },
            capabilities: {
                required: [],
                denied: ['CAP_SYS_ADMIN', 'CAP_SYS_MODULE', 'CAP_DAC_OVERRIDE']
            }
        });

        // Authentication service permissions
        this.permissionPolicies.set('authentication', {
            serviceName: 'authentication',
            requiredUser: 'auth-service',
            requiredGroup: 'auth-service',
            allowedDirectories: [
                '/var/lib/document-sorter/auth',
                '/var/lib/document-sorter/sessions'
            ],
            allowedFiles: ['*.json', '*.db'],
            deniedDirectories: [
                '/etc',
                '/root',
                '/home',
                '/usr',
                '/bin',
                '/sbin',
                '/tmp'
            ],
            networkAccess: {
                allowed: ['127.0.0.1:3003'],
                denied: ['0.0.0.0/0']
            },
            systemCalls: {
                allowed: ['read', 'write', 'open', 'close', 'stat'],
                denied: ['execve', 'fork', 'clone', 'kill', 'ptrace', 'mount']
            },
            capabilities: {
                required: [],
                denied: ['CAP_SYS_ADMIN', 'CAP_SYS_MODULE', 'CAP_DAC_OVERRIDE']
            }
        });

        // Audit logging service permissions
        this.permissionPolicies.set('auditLogging', {
            serviceName: 'auditLogging',
            requiredUser: 'audit-logger',
            requiredGroup: 'audit-logger',
            allowedDirectories: [
                '/var/log/document-sorter',
                '/var/lib/document-sorter/audit'
            ],
            allowedFiles: ['*.log', '*.json'],
            deniedDirectories: [
                '/etc',
                '/root',
                '/home',
                '/usr',
                '/bin',
                '/sbin',
                '/tmp'
            ],
            networkAccess: {
                allowed: ['127.0.0.1:3004'],
                denied: ['0.0.0.0/0']
            },
            systemCalls: {
                allowed: ['read', 'write', 'open', 'close', 'stat', 'append'],
                denied: ['execve', 'fork', 'clone', 'kill', 'ptrace', 'mount', 'unlink']
            },
            capabilities: {
                required: [],
                denied: ['CAP_SYS_ADMIN', 'CAP_SYS_MODULE', 'CAP_DAC_OVERRIDE']
            }
        });
    }

    /**
     * Create service user account
     */
    async createServiceUser(serviceName, policy) {
        const { requiredUser, requiredGroup } = policy;
        
        try {
            if (this.isWindows) {
                return await this.createWindowsServiceUser(requiredUser, requiredGroup);
            } else {
                return await this.createUnixServiceUser(requiredUser, requiredGroup);
            }
        } catch (error) {
            console.error(`Failed to create service user for ${serviceName}:`, error);
            throw error;
        }
    }

    /**
     * Create Unix/Linux service user
     */
    async createUnixServiceUser(username, groupname) {
        try {
            // Create group if it doesn't exist
            try {
                await execAsync(`groupadd ${groupname}`);
            } catch (error) {
                if (!error.message.includes('already exists')) {
                    throw error;
                }
            }

            // Create user if it doesn't exist
            try {
                await execAsync(`useradd -r -g ${groupname} -s /bin/false -d /var/lib/${username} ${username}`);
            } catch (error) {
                if (!error.message.includes('already exists')) {
                    throw error;
                }
            }

            // Create home directory
            const homeDir = `/var/lib/${username}`;
            await fs.mkdir(homeDir, { recursive: true });
            await execAsync(`chown ${username}:${groupname} ${homeDir}`);
            await execAsync(`chmod 750 ${homeDir}`);

            return { success: true, username, groupname, homeDir };
        } catch (error) {
            throw new Error(`Failed to create Unix service user: ${error.message}`);
        }
    }

    /**
     * Create Windows service user
     */
    async createWindowsServiceUser(username, groupname) {
        try {
            // Create local user
            await execAsync(`net user ${username} /add /passwordreq:no /expires:never`);
            
            // Add to service group
            await execAsync(`net localgroup "Service Users" ${username} /add`);
            
            // Create home directory
            const homeDir = `C:\\ServiceUsers\\${username}`;
            await fs.mkdir(homeDir, { recursive: true });
            
            return { success: true, username, groupname, homeDir };
        } catch (error) {
            throw new Error(`Failed to create Windows service user: ${error.message}`);
        }
    }

    /**
     * Set up service permissions
     */
    async setupServicePermissions(serviceName, policy) {
        const { allowedDirectories, deniedDirectories, capabilities } = policy;
        
        try {
            // Create allowed directories
            for (const dir of allowedDirectories) {
                await this.createSecureDirectory(dir, policy.requiredUser, policy.requiredGroup);
            }

            // Set up directory permissions
            await this.setDirectoryPermissions(allowedDirectories, policy);

            // Configure capabilities (Linux only)
            if (this.isLinux) {
                await this.configureCapabilities(serviceName, capabilities);
            }

            // Set up process limits
            await this.setProcessLimits(serviceName, policy);

            // Log permission setup
            if (this.auditLogger) {
                await this.auditLogger.logSystemEvent('service_permissions_configured', {
                    serviceName,
                    allowedDirectories,
                    capabilities: capabilities.required
                });
            }

            return { success: true, serviceName };
        } catch (error) {
            console.error(`Failed to setup permissions for ${serviceName}:`, error);
            throw error;
        }
    }

    /**
     * Create secure directory with proper permissions
     */
    async createSecureDirectory(dirPath, owner, group) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
            
            if (!this.isWindows) {
                await execAsync(`chown ${owner}:${group} ${dirPath}`);
                await execAsync(`chmod 750 ${dirPath}`);
            }
        } catch (error) {
            throw new Error(`Failed to create secure directory ${dirPath}: ${error.message}`);
        }
    }

    /**
     * Set directory permissions
     */
    async setDirectoryPermissions(directories, policy) {
        for (const dir of directories) {
            try {
                if (!this.isWindows) {
                    // Set restrictive permissions
                    await execAsync(`chmod 750 ${dir}`);
                    await execAsync(`chown ${policy.requiredUser}:${policy.requiredGroup} ${dir}`);
                    
                    // Set ACL to deny access to other users
                    await execAsync(`setfacl -m u::rwx,g::rx,o:: ${dir}`);
                }
            } catch (error) {
                console.warn(`Failed to set permissions for ${dir}:`, error.message);
            }
        }
    }

    /**
     * Configure Linux capabilities
     */
    async configureCapabilities(serviceName, capabilities) {
        try {
            const { required, denied } = capabilities;
            
            // Create capability configuration file
            const capFile = `/etc/systemd/system/${serviceName}.service.d/capabilities.conf`;
            await fs.mkdir(path.dirname(capFile), { recursive: true });
            
            let capConfig = '[Service]\n';
            
            if (required.length > 0) {
                capConfig += `AmbientCapabilities=${required.join(' ')}\n`;
                capConfig += `CapabilityBoundingSet=${required.join(' ')}\n`;
            }
            
            if (denied.length > 0) {
                // Remove denied capabilities from bounding set
                const allCaps = this.getAllCapabilities();
                const allowedCaps = allCaps.filter(cap => !denied.includes(cap));
                capConfig += `CapabilityBoundingSet=${allowedCaps.join(' ')}\n`;
            }
            
            await fs.writeFile(capFile, capConfig);
            
            // Reload systemd
            await execAsync('systemctl daemon-reload');
            
        } catch (error) {
            console.warn(`Failed to configure capabilities for ${serviceName}:`, error.message);
        }
    }

    /**
     * Get all available Linux capabilities
     */
    getAllCapabilities() {
        return [
            'CAP_AUDIT_CONTROL', 'CAP_AUDIT_READ', 'CAP_AUDIT_WRITE',
            'CAP_BLOCK_SUSPEND', 'CAP_CHOWN', 'CAP_DAC_OVERRIDE',
            'CAP_DAC_READ_SEARCH', 'CAP_FOWNER', 'CAP_FSETID',
            'CAP_IPC_LOCK', 'CAP_IPC_OWNER', 'CAP_KILL',
            'CAP_LEASE', 'CAP_LINUX_IMMUTABLE', 'CAP_MAC_ADMIN',
            'CAP_MAC_OVERRIDE', 'CAP_MKNOD', 'CAP_NET_ADMIN',
            'CAP_NET_BIND_SERVICE', 'CAP_NET_BROADCAST', 'CAP_NET_RAW',
            'CAP_SETFCAP', 'CAP_SETGID', 'CAP_SETPCAP',
            'CAP_SETUID', 'CAP_SYS_ADMIN', 'CAP_SYS_BOOT',
            'CAP_SYS_CHROOT', 'CAP_SYS_MODULE', 'CAP_SYS_NICE',
            'CAP_SYS_PACCT', 'CAP_SYS_PTRACE', 'CAP_SYS_RAWIO',
            'CAP_SYS_RESOURCE', 'CAP_SYS_TIME', 'CAP_SYS_TTY_CONFIG',
            'CAP_SYSLOG', 'CAP_WAKE_ALARM'
        ];
    }

    /**
     * Set process limits
     */
    async setProcessLimits(serviceName, policy) {
        try {
            const limitsFile = `/etc/security/limits.d/${serviceName}.conf`;
            
            const limits = [
                `${policy.requiredUser} soft nofile 1024`,
                `${policy.requiredUser} hard nofile 2048`,
                `${policy.requiredUser} soft nproc 256`,
                `${policy.requiredUser} hard nproc 512`,
                `${policy.requiredUser} soft fsize 1048576`, // 1MB
                `${policy.requiredUser} hard fsize 2097152`, // 2MB
                `${policy.requiredUser} soft data 10485760`, // 10MB
                `${policy.requiredUser} hard data 20971520`  // 20MB
            ];
            
            await fs.writeFile(limitsFile, limits.join('\n') + '\n');
            
        } catch (error) {
            console.warn(`Failed to set process limits for ${serviceName}:`, error.message);
        }
    }

    /**
     * Validate service permissions
     */
    async validateServicePermissions(serviceName) {
        const policy = this.permissionPolicies.get(serviceName);
        if (!policy) {
            throw new Error(`No policy found for service: ${serviceName}`);
        }

        const validation = {
            serviceName,
            isValid: true,
            errors: [],
            warnings: [],
            checks: {}
        };

        try {
            // Check if service user exists
            validation.checks.userExists = await this.checkUserExists(policy.requiredUser);
            if (!validation.checks.userExists) {
                validation.errors.push(`Service user ${policy.requiredUser} does not exist`);
                validation.isValid = false;
            }

            // Check if service group exists
            validation.checks.groupExists = await this.checkGroupExists(policy.requiredGroup);
            if (!validation.checks.groupExists) {
                validation.errors.push(`Service group ${policy.requiredGroup} does not exist`);
                validation.isValid = false;
            }

            // Check directory permissions
            validation.checks.directoryPermissions = await this.checkDirectoryPermissions(policy.allowedDirectories, policy);
            if (!validation.checks.directoryPermissions.valid) {
                validation.errors.push(...validation.checks.directoryPermissions.errors);
                validation.isValid = false;
            }

            // Check denied directories are not accessible
            validation.checks.deniedAccess = await this.checkDeniedAccess(policy.deniedDirectories, policy.requiredUser);
            if (!validation.checks.deniedAccess.valid) {
                validation.warnings.push(...validation.checks.deniedAccess.warnings);
            }

            // Check process limits
            validation.checks.processLimits = await this.checkProcessLimits(serviceName, policy.requiredUser);
            if (!validation.checks.processLimits.valid) {
                validation.warnings.push(...validation.checks.processLimits.warnings);
            }

        } catch (error) {
            validation.errors.push(`Validation error: ${error.message}`);
            validation.isValid = false;
        }

        return validation;
    }

    /**
     * Check if user exists
     */
    async checkUserExists(username) {
        try {
            if (this.isWindows) {
                await execAsync(`net user ${username}`);
                return true;
            } else {
                await execAsync(`id ${username}`);
                return true;
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if group exists
     */
    async checkGroupExists(groupname) {
        try {
            if (this.isWindows) {
                await execAsync(`net localgroup ${groupname}`);
                return true;
            } else {
                await execAsync(`getent group ${groupname}`);
                return true;
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * Check directory permissions
     */
    async checkDirectoryPermissions(directories, policy) {
        const result = { valid: true, errors: [] };

        for (const dir of directories) {
            try {
                const stats = await fs.stat(dir);
                if (!stats.isDirectory()) {
                    result.errors.push(`${dir} is not a directory`);
                    result.valid = false;
                    continue;
                }

                // Check ownership (Unix only)
                if (!this.isWindows) {
                    const { stdout } = await execAsync(`ls -ld ${dir}`);
                    const parts = stdout.trim().split(/\s+/);
                    const owner = parts[2];
                    const group = parts[3];

                    if (owner !== policy.requiredUser) {
                        result.errors.push(`${dir} is not owned by ${policy.requiredUser}`);
                        result.valid = false;
                    }

                    if (group !== policy.requiredGroup) {
                        result.errors.push(`${dir} is not owned by group ${policy.requiredGroup}`);
                        result.valid = false;
                    }
                }
            } catch (error) {
                result.errors.push(`Cannot access ${dir}: ${error.message}`);
                result.valid = false;
            }
        }

        return result;
    }

    /**
     * Check denied access
     */
    async checkDeniedAccess(deniedDirectories, username) {
        const result = { valid: true, warnings: [] };

        for (const dir of deniedDirectories) {
            try {
                await fs.access(dir, fs.constants.R_OK);
                result.warnings.push(`User ${username} can access denied directory ${dir}`);
                result.valid = false;
            } catch (error) {
                // Expected - user should not have access
            }
        }

        return result;
    }

    /**
     * Check process limits
     */
    async checkProcessLimits(serviceName, username) {
        const result = { valid: true, warnings: [] };

        try {
            if (!this.isWindows) {
                const { stdout } = await execAsync(`ulimit -a`);
                // Parse ulimit output and check against expected limits
                // This is a simplified check - in production, use proper parsing
                if (stdout.includes('unlimited')) {
                    result.warnings.push(`Some process limits are unlimited for ${username}`);
                }
            }
        } catch (error) {
            result.warnings.push(`Could not check process limits: ${error.message}`);
        }

        return result;
    }

    /**
     * Get service permission status
     */
    getServicePermissionStatus(serviceName) {
        const policy = this.permissionPolicies.get(serviceName);
        if (!policy) {
            return { error: 'Service not found' };
        }

        return {
            serviceName,
            policy,
            user: policy.requiredUser,
            group: policy.requiredGroup,
            allowedDirectories: policy.allowedDirectories,
            deniedDirectories: policy.deniedDirectories,
            capabilities: policy.capabilities
        };
    }

    /**
     * Get all service permissions
     */
    getAllServicePermissions() {
        const services = [];
        for (const [serviceName, policy] of this.permissionPolicies) {
            services.push({
                serviceName,
                user: policy.requiredUser,
                group: policy.requiredGroup,
                allowedDirectories: policy.allowedDirectories.length,
                deniedDirectories: policy.deniedDirectories.length,
                capabilities: policy.capabilities
            });
        }
        return services;
    }

    /**
     * Update service policy
     */
    updateServicePolicy(serviceName, updates) {
        const policy = this.permissionPolicies.get(serviceName);
        if (!policy) {
            throw new Error(`Service policy not found: ${serviceName}`);
        }

        Object.assign(policy, updates);
        policy.updatedAt = new Date();

        return { success: true, policy };
    }

    /**
     * Remove service policy
     */
    removeServicePolicy(serviceName) {
        if (this.permissionPolicies.has(serviceName)) {
            this.permissionPolicies.delete(serviceName);
            return { success: true, serviceName };
        }
        return { success: false, error: 'Service policy not found' };
    }
}

module.exports = ServicePermissionsService;
