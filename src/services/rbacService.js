/**
 * Role-Based Access Control (RBAC) Service
 * Enforces per-client access control and prevents cross-client data access
 */

class RBACService {
    constructor() {
        this.roles = new Map();
        this.permissions = new Map();
        this.userRoles = new Map(); // username -> roles
        this.clientAccess = new Map(); // clientId -> allowed operations
        this.initializeDefaultRoles();
    }

    /**
     * Initialize default roles and permissions
     */
    initializeDefaultRoles() {
        // Define permissions
        const permissions = {
            // File operations
            'file:upload': 'Upload files to the system',
            'file:download': 'Download files from the system',
            'file:process': 'Process files through AI services',
            'file:delete': 'Delete files from the system',
            'file:view': 'View file metadata and content',
            
            // Client operations
            'client:read': 'Read client-specific data',
            'client:write': 'Write client-specific data',
            'client:admin': 'Administer client account',
            
            // System operations
            'system:monitor': 'Monitor system health and metrics',
            'system:config': 'Modify system configuration',
            'system:audit': 'View audit logs and security events',
            
            // AI operations
            'ai:extract': 'Use AI extraction services',
            'ai:classify': 'Use AI classification services',
            'ai:analyze': 'Use AI analysis services',
            
            // Security operations
            'security:audit': 'View security audit logs',
            'security:monitor': 'Monitor security events',
            'security:manage': 'Manage security policies'
        };

        // Store permissions
        for (const [key, description] of Object.entries(permissions)) {
            this.permissions.set(key, description);
        }

        // Define roles
        this.roles.set('client_user', {
            name: 'Client User',
            description: 'Standard client user with access to own files only',
            permissions: [
                'file:upload',
                'file:download', 
                'file:process',
                'file:view',
                'client:read',
                'ai:extract',
                'ai:classify',
                'ai:analyze'
            ]
        });

        this.roles.set('client_admin', {
            name: 'Client Administrator',
            description: 'Client administrator with full access to client data',
            permissions: [
                'file:upload',
                'file:download',
                'file:process',
                'file:view',
                'file:delete',
                'client:read',
                'client:write',
                'client:admin',
                'ai:extract',
                'ai:classify',
                'ai:analyze',
                'security:audit'
            ]
        });

        this.roles.set('system_admin', {
            name: 'System Administrator',
            description: 'System administrator with full access',
            permissions: Array.from(this.permissions.keys())
        });

        this.roles.set('security_auditor', {
            name: 'Security Auditor',
            description: 'Security auditor with read-only access to security data',
            permissions: [
                'system:monitor',
                'system:audit',
                'security:audit',
                'security:monitor',
                'client:read'
            ]
        });
    }

    /**
     * Assign role to user
     */
    assignRole(username, roleName, clientId = null) {
        if (!this.roles.has(roleName)) {
            throw new Error(`Role '${roleName}' does not exist`);
        }

        const role = this.roles.get(roleName);
        
        // For client-specific roles, ensure clientId is provided
        if (roleName.includes('client') && !clientId) {
            throw new Error('Client ID required for client-specific roles');
        }

        if (!this.userRoles.has(username)) {
            this.userRoles.set(username, []);
        }

        const userRole = {
            role: roleName,
            clientId: clientId,
            assignedAt: new Date(),
            assignedBy: 'system' // In production, track who assigned the role
        };

        this.userRoles.get(username).push(userRole);
        
        return { success: true, role: userRole };
    }

    /**
     * Remove role from user
     */
    removeRole(username, roleName, clientId = null) {
        if (!this.userRoles.has(username)) {
            return { success: false, message: 'User has no roles assigned' };
        }

        const userRoles = this.userRoles.get(username);
        const roleIndex = userRoles.findIndex(r => 
            r.role === roleName && r.clientId === clientId
        );

        if (roleIndex === -1) {
            return { success: false, message: 'Role not found for user' };
        }

        userRoles.splice(roleIndex, 1);
        return { success: true };
    }

    /**
     * Check if user has permission
     */
    hasPermission(username, permission, clientId = null) {
        if (!this.userRoles.has(username)) {
            return false;
        }

        const userRoles = this.userRoles.get(username);
        
        for (const userRole of userRoles) {
            const role = this.roles.get(userRole.role);
            if (!role) continue;

            // Check if role has the permission
            if (role.permissions.includes(permission)) {
                // For client-specific roles, verify client access
                if (userRole.clientId && clientId && userRole.clientId !== clientId) {
                    continue; // User doesn't have access to this client's data
                }
                
                return true;
            }
        }

        return false;
    }

    /**
     * Check if user can access client data
     */
    canAccessClient(username, clientId) {
        if (!this.userRoles.has(username)) {
            return false;
        }

        const userRoles = this.userRoles.get(username);
        
        for (const userRole of userRoles) {
            // System admin can access all clients
            if (userRole.role === 'system_admin') {
                return true;
            }
            
            // Security auditor can read all clients
            if (userRole.role === 'security_auditor') {
                return true;
            }
            
            // Client-specific roles must match clientId
            if (userRole.clientId === clientId) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get user's effective permissions for a specific client
     */
    getUserPermissions(username, clientId = null) {
        if (!this.userRoles.has(username)) {
            return [];
        }

        const userRoles = this.userRoles.get(username);
        const permissions = new Set();

        for (const userRole of userRoles) {
            const role = this.roles.get(userRole.role);
            if (!role) continue;

            // Check client access
            if (clientId && userRole.clientId && userRole.clientId !== clientId) {
                continue; // Skip roles that don't apply to this client
            }

            // Add role permissions
            for (const permission of role.permissions) {
                permissions.add(permission);
            }
        }

        return Array.from(permissions);
    }

    /**
     * Validate file access for user
     */
    validateFileAccess(username, fileId, operation, clientId) {
        // First check if user can access this client's data
        if (!this.canAccessClient(username, clientId)) {
            throw new Error('Access denied: User cannot access this client\'s data');
        }

        // Check if user has permission for the operation
        const permission = `file:${operation}`;
        if (!this.hasPermission(username, permission, clientId)) {
            throw new Error(`Access denied: User lacks '${permission}' permission`);
        }

        return true;
    }

    /**
     * Get all users for a specific client (admin function)
     */
    getClientUsers(clientId) {
        const clientUsers = [];
        
        for (const [username, roles] of this.userRoles.entries()) {
            const hasClientAccess = roles.some(role => 
                role.clientId === clientId || 
                role.role === 'system_admin' || 
                role.role === 'security_auditor'
            );
            
            if (hasClientAccess) {
                clientUsers.push({
                    username,
                    roles: roles.filter(role => 
                        role.clientId === clientId || 
                        role.role === 'system_admin' || 
                        role.role === 'security_auditor'
                    )
                });
            }
        }
        
        return clientUsers;
    }

    /**
     * Audit role changes
     */
    auditRoleChange(username, action, roleName, clientId, performedBy) {
        const auditLog = {
            timestamp: new Date(),
            username,
            action, // 'assigned' or 'removed'
            roleName,
            clientId,
            performedBy,
            details: `${action} role '${roleName}' for user '${username}'${clientId ? ` in client '${clientId}'` : ''}`
        };

        // In production, this would be sent to an audit logging service
        console.log('RBAC Audit:', auditLog);
        
        return auditLog;
    }

    /**
     * Create custom role
     */
    createCustomRole(roleName, description, permissions, clientId = null) {
        if (this.roles.has(roleName)) {
            throw new Error(`Role '${roleName}' already exists`);
        }

        // Validate permissions
        for (const permission of permissions) {
            if (!this.permissions.has(permission)) {
                throw new Error(`Permission '${permission}' does not exist`);
            }
        }

        this.roles.set(roleName, {
            name: roleName,
            description,
            permissions,
            clientId,
            isCustom: true,
            createdAt: new Date()
        });

        return { success: true, role: this.roles.get(roleName) };
    }

    /**
     * Get all roles
     */
    getAllRoles() {
        const roles = [];
        for (const [key, role] of this.roles.entries()) {
            roles.push({
                key,
                ...role
            });
        }
        return roles;
    }

    /**
     * Get all permissions
     */
    getAllPermissions() {
        const permissions = [];
        for (const [key, description] of this.permissions.entries()) {
            permissions.push({ key, description });
        }
        return permissions;
    }
}

module.exports = RBACService;
