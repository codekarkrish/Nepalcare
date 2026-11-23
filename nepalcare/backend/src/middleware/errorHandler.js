export function notFound(req, res) { res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` }); }
export function errorHandler(err, _req, res, _next) {
  if (err.name === 'MulterError') {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message = status === 413
      ? err.field === 'proof'
        ? 'Payment proof must not exceed 5 MB.'
        : err.field === 'coverImage' || err.field === 'qrImage'
          ? 'Campaign images must not exceed 5 MB each.'
          : err.message
      : err.message;
    return res.status(status).json({ success: false, message });
  }
  if (err.code === 11000) return res.status(409).json({ success: false, message: 'A record with this value already exists.' });
  if (err.name === 'ValidationError') return res.status(400).json({ success: false, message: err.message });
  if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid resource identifier.' });
  const status = err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ success: false, message: status >= 500 ? 'An unexpected server error occurred.' : err.message });
}
