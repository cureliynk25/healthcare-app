const { verifyAccessToken } = require("../utils/jwt.utils");
const { errorResponse } = require("../utils/response.utils");
const User = require("../models/User");
const Doctor = require("../models/Doctor");
const Admin = require("../models/Admin");

/**
 * Map of role to their respective Mongoose models
 */
const MODEL_MAP = {
    user: User,
    doctor: Doctor,
    admin: Admin,
};

// How often (ms) a signed-in account's lastActiveAt gets refreshed.
const ACTIVITY_STAMP_THROTTLE_MS = 5 * 60 * 1000;

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return errorResponse(res, 401, "Access denied. No token provided.");
        }

        const token = authHeader.split(" ")[1];

        if (!token) {
            return errorResponse(res, 401, "Access denied. Token is malformed.");
        }

        // Verify the token
        let decoded;
        try {
            decoded = verifyAccessToken(token);
        } catch (err) {
            if (err.name === "TokenExpiredError") {
                return errorResponse(res, 401, "Token has expired. Please login again.");
            }
            if (err.name === "JsonWebTokenError") {
                return errorResponse(res, 401, "Invalid token. Please login again.");
            }
            return errorResponse(res, 401, "Token verification failed.");
        }

        // decoded should contain { id, role, email }
        const { id, role } = decoded;

        if (!id || !role) {
            return errorResponse(res, 401, "Token payload is invalid.");
        }

        const Model = MODEL_MAP[role];
        if (!Model) {
            return errorResponse(res, 401, "Invalid role in token.");
        }

        // Fetch user from DB (exclude sensitive fields)
        const user = await Model.findById(id).select("-password -refreshToken");

        if (!user) {
            return errorResponse(res, 401, "User not found. Token may be stale.");
        }

        if (!user.isActive) {
            return errorResponse(res, 403, "Your account has been deactivated. Please contact support.");
        }

        // Doctor-specific: must be approved by admin
        if (role === "doctor" && !user.isApproved) {
            return errorResponse(res, 403, "Your doctor account is pending admin approval.");
        }

        // Usage tracking: stamp "last active" on this request, throttled so an
        // active session doesn't write to the DB on every single API call.
        const lastStamp = user.lastActiveAt ? user.lastActiveAt.getTime() : 0;
        if (Date.now() - lastStamp > ACTIVITY_STAMP_THROTTLE_MS) {
            Model.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } }).catch((err) =>
                console.error("[authenticate] Failed to stamp lastActiveAt:", err)
            );
        }

        req.user = user;
        next();
    } catch (error) {
        console.error("[authenticate] Unexpected error:", error);
        return errorResponse(res, 500, "Authentication failed due to a server error.");
    }
};

/**
 * authorize — Role-Based Access Control (RBAC) guard
 * Must be used AFTER authenticate middleware.
 *
 * @param {...string} roles - Allowed roles (e.g. "admin", "doctor")
 *
 * Usage: router.get('/admin-only', authenticate, authorize('admin'), handler)
 */
const authorize = (...roles) => (req, res, next) => {
    if (!req.user) {
        return errorResponse(res, 401, "Authentication required.");
    }

    if (!roles.includes(req.user.role)) {
        return errorResponse(
            res,
            403,
            `Access denied. This route is restricted to: ${roles.join(", ")}.`
        );
    }

    next();
};

/**
 * requirePermission — gates a route to admins who have a specific permission
 * in their `permissions` array, instead of any admin at all.
 * Must be used AFTER authenticate (and typically after authorize('admin')).
 *
 * Usage: router.get('/stats', authenticate, authorize('admin'), requirePermission('view_analytics'), handler)
 */
const requirePermission = (permission) => (req, res, next) => {
    if (!req.user) {
        return errorResponse(res, 401, "Authentication required.");
    }

    if (req.user.role !== "admin" || !req.user.permissions?.includes(permission)) {
        return errorResponse(res, 403, `Access denied. Requires the "${permission}" permission.`);
    }

    next();
};

module.exports = { authenticate, authorize, requirePermission };
