import { Router } from 'express';
import {
  createActivity,
  createExpense,
  expenseReviewQueue,
  getActivityFile,
  getExpenseFile,
  getPublicActivityPhoto,
  getPublicExpenseReceipt,
  listActivities,
  listExpenses,
  listNGOActivities,
  resubmitExpense,
  reviewExpense
} from '../controllers/relief.controller.js';
import { authenticate, requirePermission, requireRole } from '../middleware/auth.js';
import privateFileUpload from '../middleware/privateFileUpload.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import AuditLog from '../models/AuditLog.js';

const router = Router();

router.get('/activities/public/:id/photos/:photoId', getPublicActivityPhoto);
router.get('/activities/ngo', authenticate, requireRole('NGO'), listNGOActivities);
router.get('/activities/:id/files/:fileId', authenticate, requireRole('NGO', 'ADMIN'), (req, res, next) => {
  if (req.user.role === 'ADMIN') return requirePermission('campaign.review')(req, res, next);
  next();
}, getActivityFile);
router.get('/activities', listActivities);
router.post(
  '/activities',
  authenticate,
  requireRole('NGO'),
  privateFileUpload.fields([{ name: 'photos', maxCount: 8 }, { name: 'documents', maxCount: 5 }]),
  createActivity
);

router.get('/expenses/public/:id/receipt', getPublicExpenseReceipt);
router.get('/expenses/admin/queue', authenticate, requireRole('ADMIN'), requirePermission('expense.review'), expenseReviewQueue);
router.get('/expenses', authenticate, requireRole('NGO', 'ADMIN'), (req, res, next) => {
  if (req.user.role === 'ADMIN') return requirePermission('expense.review')(req, res, next);
  next();
}, listExpenses);
router.post(
  '/expenses',
  authenticate,
  requireRole('NGO'),
  privateFileUpload.fields([{ name: 'receipt', maxCount: 1 }, { name: 'documents', maxCount: 5 }]),
  createExpense
);
router.post(
  '/expenses/:id/resubmit',
  authenticate,
  requireRole('NGO'),
  privateFileUpload.fields([{ name: 'receipt', maxCount: 1 }, { name: 'documents', maxCount: 5 }]),
  resubmitExpense
);
router.patch('/expenses/:id/review', authenticate, requireRole('ADMIN'), requirePermission('expense.review'), reviewExpense);
router.get('/expenses/:id/files/:fileId', authenticate, requireRole('NGO', 'ADMIN'), (req, res, next) => {
  if (req.user.role === 'ADMIN') return requirePermission('expense.review')(req, res, next);
  next();
}, getExpenseFile);
router.get('/audit-logs', authenticate, requireRole('ADMIN'), requirePermission('expense.review'), asyncHandler(async (_req, res) => {
  const items = await AuditLog.find().populate('actor', 'name email').sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, data: { items } });
}));

export default router;
