import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Authentication required. Provide a Bearer token.');
  }

  let payload;

  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Invalid or expired token. Please sign in again.');
  }

  const user = await User.findById(payload.sub);

  if (!user || !user.isActive) {
    throw new HttpError(401, 'Account not found or inactive.');
  }

  req.user = user;
  next();
});

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) {
    return next(new HttpError(401, 'Authentication required.'));
  }

  if (!roles.includes(req.user.role)) {
    return next(new HttpError(403, 'You do not have permission to perform this action.'));
  }

  next();
};

// Main Admin only
export const requireMainAdmin = (req, _res, next) => {
  if (!req.user) {
    return next(new HttpError(401, 'Authentication required.'));
  }

  if (
    req.user.role !== 'ADMIN' ||
    req.user.adminLevel !== 'MAIN_ADMIN'
  ) {
    return next(new HttpError(403, 'Main Admin access required.'));
  }

  next();
};

// Main Admin gets full access; Staff needs assigned permission
export const requirePermission = (permission) => (req, _res, next) => {
  if (!req.user) {
    return next(new HttpError(401, 'Authentication required.'));
  }

  if (req.user.role !== 'ADMIN') {
    return next(new HttpError(403, 'Admin access required.'));
  }

  if (req.user.adminLevel === 'MAIN_ADMIN') {
    return next();
  }

  if (
    req.user.adminLevel === 'STAFF' &&
    req.user.permissions.includes(permission)
  ) {
    return next();
  }

  return next(new HttpError(403, 'You do not have the required permission.'));
};