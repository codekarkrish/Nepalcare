import { HttpError } from '../utils/httpError.js';
export function validateBody(required = []) {
  return (req, _res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return next(new HttpError(400, 'Request body must be a JSON object.'));
    const missing = required.filter((key) => req.body[key] === undefined || req.body[key] === null || req.body[key] === '');
    if (missing.length) return next(new HttpError(400, `Missing required fields: ${missing.join(', ')}`));
    next();
  };
}
