import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { authenticate, requireMainAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { writeAudit } from '../utils/audit.js';

const router = Router();
const allowedPermissions = [
  'ngo.documents.read',
  'ngo.review',
  'ngo.approve',
  'ngo.reject',
  'campaign.review',
  'campaign.approve',
  'campaign.reject',
  'campaign.deletion.review',
  'donation.review',
  'expense.review'
];

router.use(authenticate);
router.use(requireMainAdmin);

router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Main Admin access verified.' });
});

router.get('/staff', asyncHandler(async (_req, res) => {
  const items = await User.find({ role: 'ADMIN', adminLevel: 'STAFF' }).sort({ createdAt: -1 });
  res.json({ success: true, data: { items } });
}));

router.post('/staff', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const permissions = Array.isArray(req.body.permissions)
    ? [...new Set(req.body.permissions.filter((item) => allowedPermissions.includes(item)))]
    : [];
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    throw new HttpError(400, 'A valid name, email and password of at least 8 characters are required.');
  }
  if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists.');
  const staff = await User.create({
    name,
    email,
    password: await bcrypt.hash(password, 12),
    role: 'ADMIN',
    adminLevel: 'STAFF',
    permissions
  });
  await writeAudit({
    actor: req.user._id,
    action: 'STAFF_CREATED',
    resourceType: 'User',
    resourceId: staff._id,
    metadata: { permissions }
  });
  res.status(201).json({ success: true, data: { staff } });
}));

router.patch('/staff/:id/permissions', asyncHandler(async (req, res) => {
  if (!Array.isArray(req.body.permissions)) throw new HttpError(400, 'Permissions must be an array.');
  const staff = await User.findOne({ _id: req.params.id, role: 'ADMIN', adminLevel: 'STAFF' });
  if (!staff) throw new HttpError(404, 'Staff account not found.');
  const previousPermissions = [...staff.permissions];
  staff.permissions = [...new Set(req.body.permissions.filter((item) => allowedPermissions.includes(item)))];
  await staff.save();
  await writeAudit({
    actor: req.user._id,
    action: 'STAFF_PERMISSIONS_UPDATED',
    resourceType: 'User',
    resourceId: staff._id,
    metadata: { previousPermissions, newPermissions: staff.permissions }
  });
  res.json({ success: true, data: { staff } });
}));

router.patch('/staff/:id/status', asyncHandler(async (req, res) => {
  if (typeof req.body.isActive !== 'boolean') throw new HttpError(400, 'isActive must be a boolean.');
  const staff = await User.findOne({ _id: req.params.id, role: 'ADMIN', adminLevel: 'STAFF' });
  if (!staff) throw new HttpError(404, 'Staff account not found.');
  staff.isActive = req.body.isActive;
  await staff.save();
  await writeAudit({
    actor: req.user._id,
    action: 'STAFF_STATUS_UPDATED',
    resourceType: 'User',
    resourceId: staff._id,
    metadata: { isActive: staff.isActive }
  });
  res.json({ success: true, data: { staff } });
}));

router.get('/audit-logs', asyncHandler(async (_req, res) => {
  const items = await AuditLog.find().populate('actor', 'name email role adminLevel').sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, data: { items } });
}));

export default router;