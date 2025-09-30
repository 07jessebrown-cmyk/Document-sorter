/**
 * Authentication Service
 * Provides secure authentication with strong password policies and MFA support
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

class AuthenticationService {
    constructor() {
        this.users = new Map(); // In production, use a secure database
        this.sessions = new Map();
        this.passwordPolicy = {
            minLength: 12,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: true,
            maxAge: 90, // days
            preventReuse: 5 // last 5 passwords
        };
        this.mfaEnabled = true;
        this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
    }

    /**
     * Validate password strength against policy
     */
    validatePasswordStrength(password) {
        const errors = [];
        
        if (password.length < this.passwordPolicy.minLength) {
            errors.push(`Password must be at least ${this.passwordPolicy.minLength} characters long`);
        }
        
        if (this.passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }
        
        if (this.passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }
        
        if (this.passwordPolicy.requireNumbers && !/\d/.test(password)) {
            errors.push('Password must contain at least one number');
        }
        
        if (this.passwordPolicy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            errors.push('Password must contain at least one special character');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Register a new user with strong password validation
     */
    async registerUser(username, password, email, clientId) {
        // Validate password strength
        const passwordValidation = this.validatePasswordStrength(password);
        if (!passwordValidation.isValid) {
            throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
        }

        // Check if user already exists
        if (this.users.has(username)) {
            throw new Error('Username already exists');
        }

        // Hash password with bcrypt
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Generate MFA secret
        const mfaSecret = speakeasy.generateSecret({
            name: `Document Sorter (${username})`,
            issuer: 'Document Sorter Security'
        });

        // Create user record
        const user = {
            username,
            email,
            clientId,
            hashedPassword,
            mfaSecret: mfaSecret.base32,
            mfaEnabled: false,
            passwordHistory: [hashedPassword],
            lastPasswordChange: new Date(),
            accountCreated: new Date(),
            isActive: true,
            failedLoginAttempts: 0,
            lockedUntil: null
        };

        this.users.set(username, user);

        return {
            success: true,
            mfaQrCode: await QRCode.toDataURL(mfaSecret.otpauth_url),
            mfaSecret: mfaSecret.base32
        };
    }

    /**
     * Authenticate user with password and MFA
     */
    async authenticateUser(username, password, mfaToken = null) {
        const user = this.users.get(username);
        
        if (!user) {
            throw new Error('Invalid credentials');
        }

        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            throw new Error('Account is temporarily locked due to too many failed attempts');
        }

        // Verify password
        const passwordValid = await bcrypt.compare(password, user.hashedPassword);
        if (!passwordValid) {
            await this.handleFailedLogin(username);
            throw new Error('Invalid credentials');
        }

        // Verify MFA if enabled
        if (user.mfaEnabled) {
            if (!mfaToken) {
                throw new Error('MFA token required');
            }
            
            const mfaValid = speakeasy.totp.verify({
                secret: user.mfaSecret,
                encoding: 'base32',
                token: mfaToken,
                window: 2 // Allow 2 time windows for clock drift
            });

            if (!mfaValid) {
                await this.handleFailedLogin(username);
                throw new Error('Invalid MFA token');
            }
        }

        // Reset failed login attempts on successful login
        user.failedLoginAttempts = 0;
        user.lockedUntil = null;

        // Generate session token
        const sessionToken = this.generateSessionToken();
        const session = {
            username,
            clientId: user.clientId,
            createdAt: new Date(),
            lastActivity: new Date(),
            ipAddress: null, // Would be set by calling code
            userAgent: null  // Would be set by calling code
        };

        this.sessions.set(sessionToken, session);

        return {
            success: true,
            sessionToken,
            expiresAt: new Date(Date.now() + this.sessionTimeout),
            mfaRequired: !user.mfaEnabled
        };
    }

    /**
     * Enable MFA for a user
     */
    async enableMFA(username, mfaToken) {
        const user = this.users.get(username);
        if (!user) {
            throw new Error('User not found');
        }

        // Verify the MFA token
        const mfaValid = speakeasy.totp.verify({
            secret: user.mfaSecret,
            encoding: 'base32',
            token: mfaToken,
            window: 2
        });

        if (!mfaValid) {
            throw new Error('Invalid MFA token');
        }

        user.mfaEnabled = true;
        return { success: true };
    }

    /**
     * Verify session token and check if user can access client data
     */
    verifySession(sessionToken, requiredClientId = null) {
        const session = this.sessions.get(sessionToken);
        
        if (!session) {
            throw new Error('Invalid session');
        }

        // Check session timeout
        if (Date.now() - session.lastActivity.getTime() > this.sessionTimeout) {
            this.sessions.delete(sessionToken);
            throw new Error('Session expired');
        }

        // Check client access
        if (requiredClientId && session.clientId !== requiredClientId) {
            throw new Error('Access denied: insufficient permissions');
        }

        // Update last activity
        session.lastActivity = new Date();

        return {
            username: session.username,
            clientId: session.clientId,
            valid: true
        };
    }

    /**
     * Generate a secure session token
     */
    generateSessionToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Handle failed login attempts
     */
    async handleFailedLogin(username) {
        const user = this.users.get(username);
        if (!user) return;

        user.failedLoginAttempts++;
        
        // Lock account after 5 failed attempts
        if (user.failedLoginAttempts >= 5) {
            user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        }
    }

    /**
     * Logout user and invalidate session
     */
    logout(sessionToken) {
        this.sessions.delete(sessionToken);
        return { success: true };
    }

    /**
     * Change password with policy validation
     */
    async changePassword(username, currentPassword, newPassword) {
        const user = this.users.get(username);
        if (!user) {
            throw new Error('User not found');
        }

        // Verify current password
        const currentPasswordValid = await bcrypt.compare(currentPassword, user.hashedPassword);
        if (!currentPasswordValid) {
            throw new Error('Current password is incorrect');
        }

        // Validate new password strength
        const passwordValidation = this.validatePasswordStrength(newPassword);
        if (!passwordValidation.isValid) {
            throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
        }

        // Check password history
        const newPasswordHash = await bcrypt.hash(newPassword, 12);
        for (const oldHash of user.passwordHistory) {
            if (await bcrypt.compare(newPassword, oldHash)) {
                throw new Error('Cannot reuse recent passwords');
            }
        }

        // Update password
        user.hashedPassword = newPasswordHash;
        user.passwordHistory.unshift(newPasswordHash);
        
        // Keep only last 5 passwords
        if (user.passwordHistory.length > this.passwordPolicy.preventReuse) {
            user.passwordHistory = user.passwordHistory.slice(0, this.passwordPolicy.preventReuse);
        }
        
        user.lastPasswordChange = new Date();

        return { success: true };
    }

    /**
     * Get user information (for admin purposes)
     */
    getUserInfo(username) {
        const user = this.users.get(username);
        if (!user) {
            throw new Error('User not found');
        }

        return {
            username: user.username,
            email: user.email,
            clientId: user.clientId,
            mfaEnabled: user.mfaEnabled,
            lastPasswordChange: user.lastPasswordChange,
            accountCreated: user.accountCreated,
            isActive: user.isActive,
            failedLoginAttempts: user.failedLoginAttempts,
            lockedUntil: user.lockedUntil
        };
    }

    /**
     * Clean up expired sessions
     */
    cleanupExpiredSessions() {
        const now = new Date();
        for (const [token, session] of this.sessions.entries()) {
            if (now - session.lastActivity > this.sessionTimeout) {
                this.sessions.delete(token);
            }
        }
    }
}

module.exports = AuthenticationService;
