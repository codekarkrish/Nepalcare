
import { Router } from 'express';

import {
  registerNGO,
  myNGO,
  mySummary,
  listPending,
  reviewNGO,
  uploadNGODocuments,
  updateMyNGO,
  getNGODocument
} from '../controllers/ngo.controller.js';

import {
  authenticate,
  requireRole,
  requirePermission
} from '../middleware/auth.js';

import { validateBody } from '../middleware/validate.js';
import upload from '../middleware/upload.js';

const router = Router();

// Register NGO
router.post(
  '/',
  authenticate,
  requireRole('NGO'),
  validateBody(['organizationName', 'registrationNumber', 'address']),
  registerNGO
);

// Get NGO profile
router.get('/me', authenticate, requireRole('NGO'), myNGO);

// Get NGO dashboard summary
router.get('/me/summary', authenticate, requireRole('NGO'), mySummary);
router.patch(
  '/me',
  authenticate,
  requireRole('NGO'),
  validateBody([]),
  updateMyNGO
);

// Admin: List pending NGOs
router.get(
  '/admin/pending',
  authenticate,
  requireRole('ADMIN'),
  requirePermission('ngo.review'),
  listPending
);

// Separate granular review actions
router.patch(
  '/admin/:id/approve',
  authenticate,
  requireRole('ADMIN'),
  requirePermission('ngo.approve'),
  (req, _res, next) => {
    req.body.status = 'VERIFIED';
    next();
  },
  reviewNGO
);

router.patch(
  '/admin/:id/reject',
  authenticate,
  requireRole('ADMIN'),
  requirePermission('ngo.reject'),
  validateBody(['reviewNote']),
  (req, _res, next) => {
    req.body.status = 'REJECTED';
    next();
  },
  reviewNGO
);

router.patch(
  '/admin/:id/resubmission',
  authenticate,
  requireRole('ADMIN'),
  requirePermission('ngo.review'),
  validateBody(['reviewNote']),
  (req, _res, next) => {
    req.body.status = 'RESUBMISSION_REQUIRED';
    next();
  },
  reviewNGO
);

router.patch(
  '/admin/:id/under-review',
  authenticate,
  requireRole('ADMIN'),
  requirePermission('ngo.review'),
  (req, _res, next) => {
    req.body.status = 'UNDER_REVIEW';
    next();
  },
  reviewNGO
);

// Admin: Review NGO
router.patch(
  '/admin/:id/review',
  authenticate,
  requireRole('ADMIN'),
  requirePermission('ngo.review'),
  validateBody(['status']),
  reviewNGO
);

// NGO: Upload documents
router.post(
  '/documents',
  authenticate,
  requireRole('NGO'),
  upload.array('documents', 5),
  uploadNGODocuments
);

router.get(
  '/:id/documents/:documentId/preview',
  authenticate,
  requireRole('ADMIN'),
  requirePermission('ngo.documents.read'),
  getNGODocument
);

router.get(
  '/:id/documents/:documentId/download',
  authenticate,
  requireRole('ADMIN'),
  requirePermission('ngo.documents.read'),
  getNGODocument
);

export default router;
