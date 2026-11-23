import { Router } from 'express';
import { cancelMine, create, getPhoto, listNGO, mine, updateStatus } from '../controllers/itemDonation.controller.js';
import privateFileUpload from '../middleware/privateFileUpload.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.post('/', authenticate, requireRole('CITIZEN'), privateFileUpload.array('photos', 5), create);
router.get('/mine', authenticate, requireRole('CITIZEN'), mine);
router.get('/ngo', authenticate, requireRole('NGO'), listNGO);
router.patch('/:id/status', authenticate, requireRole('NGO'), updateStatus);
router.patch('/:id/cancel', authenticate, requireRole('CITIZEN'), cancelMine);
router.get('/:id/photos/:photoId', authenticate, requireRole('CITIZEN', 'NGO'), getPhoto);

export default router;
