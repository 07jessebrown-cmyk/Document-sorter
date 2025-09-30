/**
 * Service-to-Service Authentication Service
 * Manages API keys and service identity tokens for inter-service communication
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class ServiceAuthService {
    constructor() {
        this.services = new Map(); // serviceId -> service config
        this.apiKeys = new Map(); // apiKey -> serviceId
        this.serviceTokens = new Map(); // token -> service info
        this.jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
        this.tokenExpiry = 3600; // 1 hour
        this.initializeDefaultServices();
    }

    /**
     * Initialize default services with their permissions
     */
    initializeDefaultServices() {
        const defaultServices = {
            'ai-text-service': {
                name: 'AI Text Service',
                description: 'Handles AI text extraction and processing',
                permissions: ['ai:extract', 'ai:classify', 'ai:analyze'],
                allowedClients: 'all', // Can access all clients
                rateLimit: 100, // requests per minute
                isActive: true
            },
            'ocr-service': {
                name: 'OCR Service',
                description: 'Handles optical character recognition',
                permissions: ['file:process', 'ai:extract'],
                allowedClients: 'all',
                rateLimit: 50,
                isActive: true
            },
            'file-storage-service': {
                name: 'File Storage Service',
                description: 'Manages secure file storage and retrieval',
                permissions: ['file:upload', 'file:download', 'file:view', 'file:delete'],
                allowedClients: 'all',
                rateLimit: 200,
                isActive: true
            },
            'telemetry-service': {
                name: 'Telemetry Service',
                description: 'Collects and processes system metrics',
                permissions: ['system:monitor', 'system:audit'],
                allowedClients: 'all',
                rateLimit: 1000,
                isActive: true
            },
            'audit-service': {
                name: 'Audit Service',
                description: 'Handles security audit logging',
                permissions: ['security:audit', 'security:monitor', 'system:audit'],
                allowedClients: 'all',
                rateLimit: 500,
                isActive: true
            }
        };

        for (const [serviceId, config] of Object.entries(defaultServices)) {
            this.registerService(serviceId, config);
        }
    }

    /**
     * Register a new service
     */
    registerService(serviceId, config) {
        if (this.services.has(serviceId)) {
            throw new Error(`Service '${serviceId}' already exists`);
        }

        // Generate API key for the service
        const apiKey = this.generateApiKey();
        
        const serviceConfig = {
            serviceId,
            name: config.name,
            description: config.description,
            permissions: config.permissions || [],
            allowedClients: config.allowedClients || 'all',
            rateLimit: config.rateLimit || 100,
            isActive: config.isActive !== false,
            apiKey,
            createdAt: new Date(),
            lastUsed: null,
            requestCount: 0
        };

        this.services.set(serviceId, serviceConfig);
        this.apiKeys.set(apiKey, serviceId);

        return {
            serviceId,
            apiKey,
            config: serviceConfig
        };
    }

    /**
     * Generate a secure API key
     */
    generateApiKey() {
        return `sk_${crypto.randomBytes(32).toString('hex')}`;
    }

    /**
     * Authenticate service using API key
     */
    authenticateService(apiKey, clientId = null) {
        const serviceId = this.apiKeys.get(apiKey);
        
        if (!serviceId) {
            throw new Error('Invalid API key');
        }

        const service = this.services.get(serviceId);
        
        if (!service || !service.isActive) {
            throw new Error('Service is inactive or not found');
        }

        // Check client access
        if (clientId && service.allowedClients !== 'all' && !service.allowedClients.includes(clientId)) {
            throw new Error('Service not authorized for this client');
        }

        // Update usage statistics
        service.lastUsed = new Date();
        service.requestCount++;

        return {
            serviceId: service.serviceId,
            name: service.name,
            permissions: service.permissions,
            allowedClients: service.allowedClients
        };
    }

    /**
     * Generate JWT token for service
     */
    generateServiceToken(serviceId, clientId = null, additionalClaims = {}) {
        const service = this.services.get(serviceId);
        
        if (!service || !service.isActive) {
            throw new Error('Service not found or inactive');
        }

        const payload = {
            serviceId,
            clientId,
            permissions: service.permissions,
            allowedClients: service.allowedClients,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + this.tokenExpiry,
            ...additionalClaims
        };

        const token = jwt.sign(payload, this.jwtSecret, { algorithm: 'HS256' });
        
        // Store token for validation
        this.serviceTokens.set(token, {
            serviceId,
            clientId,
            issuedAt: new Date(),
            expiresAt: new Date(Date.now() + this.tokenExpiry * 1000)
        });

        return {
            token,
            expiresIn: this.tokenExpiry,
            expiresAt: new Date(Date.now() + this.tokenExpiry * 1000)
        };
    }

    /**
     * Verify JWT token
     */
    verifyServiceToken(token) {
        try {
            // Check if token is in our cache
            const cachedToken = this.serviceTokens.get(token);
            if (cachedToken && cachedToken.expiresAt < new Date()) {
                this.serviceTokens.delete(token);
                throw new Error('Token expired');
            }

            // Verify JWT signature and claims
            const decoded = jwt.verify(token, this.jwtSecret);
            
            // Verify service is still active
            const service = this.services.get(decoded.serviceId);
            if (!service || !service.isActive) {
                throw new Error('Service is inactive');
            }

            return {
                serviceId: decoded.serviceId,
                clientId: decoded.clientId,
                permissions: decoded.permissions,
                allowedClients: decoded.allowedClients,
                valid: true
            };
        } catch (error) {
            throw new Error(`Token verification failed: ${error.message}`);
        }
    }

    /**
     * Check if service has permission
     */
    hasServicePermission(serviceId, permission, clientId = null) {
        const service = this.services.get(serviceId);
        
        if (!service || !service.isActive) {
            return false;
        }

        // Check client access
        if (clientId && service.allowedClients !== 'all' && !service.allowedClients.includes(clientId)) {
            return false;
        }

        // Check permission
        return service.permissions.includes(permission);
    }

    /**
     * Validate service-to-service request
     */
    validateServiceRequest(apiKey, permission, clientId = null) {
        const authResult = this.authenticateService(apiKey, clientId);
        
        if (!this.hasServicePermission(authResult.serviceId, permission, clientId)) {
            throw new Error(`Service '${authResult.serviceId}' lacks permission '${permission}'`);
        }

        return authResult;
    }

    /**
     * Rotate API key for a service
     */
    rotateApiKey(serviceId) {
        const service = this.services.get(serviceId);
        
        if (!service) {
            throw new Error('Service not found');
        }

        // Remove old API key
        this.apiKeys.delete(service.apiKey);
        
        // Generate new API key
        const newApiKey = this.generateApiKey();
        service.apiKey = newApiKey;
        service.apiKeyRotatedAt = new Date();
        
        this.apiKeys.set(newApiKey, serviceId);

        return {
            serviceId,
            newApiKey,
            rotatedAt: service.apiKeyRotatedAt
        };
    }

    /**
     * Get service statistics
     */
    getServiceStats(serviceId) {
        const service = this.services.get(serviceId);
        
        if (!service) {
            throw new Error('Service not found');
        }

        return {
            serviceId: service.serviceId,
            name: service.name,
            isActive: service.isActive,
            requestCount: service.requestCount,
            lastUsed: service.lastUsed,
            createdAt: service.createdAt,
            apiKeyRotatedAt: service.apiKeyRotatedAt
        };
    }

    /**
     * List all services
     */
    listServices() {
        const services = [];
        for (const [serviceId, config] of this.services.entries()) {
            services.push({
                serviceId,
                name: config.name,
                description: config.description,
                isActive: config.isActive,
                requestCount: config.requestCount,
                lastUsed: config.lastUsed
            });
        }
        return services;
    }

    /**
     * Deactivate service
     */
    deactivateService(serviceId) {
        const service = this.services.get(serviceId);
        
        if (!service) {
            throw new Error('Service not found');
        }

        service.isActive = false;
        service.deactivatedAt = new Date();

        return { success: true, deactivatedAt: service.deactivatedAt };
    }

    /**
     * Clean up expired tokens
     */
    cleanupExpiredTokens() {
        const now = new Date();
        for (const [token, tokenInfo] of this.serviceTokens.entries()) {
            if (tokenInfo.expiresAt < now) {
                this.serviceTokens.delete(token);
            }
        }
    }

    /**
     * Audit service access
     */
    auditServiceAccess(serviceId, action, clientId, details = {}) {
        const auditLog = {
            timestamp: new Date(),
            serviceId,
            action,
            clientId,
            details,
            message: `Service '${serviceId}' performed '${action}'${clientId ? ` for client '${clientId}'` : ''}`
        };

        // In production, this would be sent to an audit logging service
        console.log('Service Auth Audit:', auditLog);
        
        return auditLog;
    }

    /**
     * Get rate limit info for service
     */
    getRateLimitInfo(serviceId) {
        const service = this.services.get(serviceId);
        
        if (!service) {
            throw new Error('Service not found');
        }

        return {
            serviceId,
            rateLimit: service.rateLimit,
            requestCount: service.requestCount,
            lastUsed: service.lastUsed
        };
    }
}

module.exports = ServiceAuthService;
