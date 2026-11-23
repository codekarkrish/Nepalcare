import multer from 'multer';
import { HttpError } from '../utils/httpError.js';

const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const paymentProofUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new HttpError(400, 'Payment proof must be a PDF, JPG or PNG file.'));
    }
    callback(null, true);
  },
  limits: {
    files: 1,
    fileSize: 5 * 1024 * 1024
  }
});

export default paymentProofUpload;
