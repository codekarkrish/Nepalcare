import multer from 'multer';
import { HttpError } from '../utils/httpError.js';

const allowedTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const privateFileUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new HttpError(400, 'Files must be PDF, JPG, PNG or WebP.'));
    }
    callback(null, true);
  },
  limits: {
    files: 13,
    fileSize: 5 * 1024 * 1024
  }
});

export default privateFileUpload;
