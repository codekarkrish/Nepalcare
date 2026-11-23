import multer from 'multer';
import { HttpError } from '../utils/httpError.js';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const campaignImageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new HttpError(400, 'Campaign images must be JPG, PNG or WebP files.'));
    }
    callback(null, true);
  },
  limits: {
    files: 2,
    fileSize: 5 * 1024 * 1024
  }
});

export default campaignImageUpload;
