import { Router } from 'express';
import {
  create,
  getPaymentProof,
  handleEsewaFailure,
  handleEsewaSuccess,
  initiateEsewa,
  listAdmin,
  mine,
  paymentOptions,
  reviewQueue,
  reviewTransfer,
  submitTransfer,
  verifyEsewa
} from '../controllers/donation.controller.js';
import { authenticate, requirePermission, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import paymentProofUpload from '../middleware/paymentProofUpload.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();

const authorizeDonationReview = (req, res, next) => {
  if (req.user.role === 'ADMIN') return requirePermission('donation.review')(req, res, next);
  if (req.user.role === 'NGO') return next();
  return next(new HttpError(403, 'You do not have permission to review transfers.'));
};

const authorizeProofRead = (req, res, next) => {
  if (req.user.role === 'ADMIN') return requirePermission('donation.review')(req, res, next);
  next();
};

router.get('/options/:campaignId', paymentOptions);
router.get('/esewa/success', handleEsewaSuccess);
router.get('/esewa/failure', handleEsewaFailure);
router.get('/mine', authenticate, requireRole('CITIZEN'), mine);
router.get('/review-queue', authenticate, requireRole('NGO', 'ADMIN'), authorizeDonationReview, reviewQueue);
router.get('/admin', authenticate, requireRole('ADMIN'), requirePermission('donation.review'), listAdmin);
router.post('/', authenticate, requireRole('CITIZEN'), create);
router.post('/:id/esewa/initiate', authenticate, requireRole('CITIZEN'), initiateEsewa);
router.post('/:id/esewa/verify', authenticate, requireRole('CITIZEN'), verifyEsewa);
router.post('/:id/transfer', authenticate, requireRole('CITIZEN'), paymentProofUpload.single('proof'), submitTransfer);
router.patch('/:id/review', authenticate, requireRole('NGO', 'ADMIN'), validateBody(['status']), authorizeDonationReview, reviewTransfer);
router.get('/:id/proof', authenticate, requireRole('CITIZEN', 'NGO', 'ADMIN'), authorizeProofRead, getPaymentProof);

export default router;
