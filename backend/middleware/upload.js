/**
 * upload.js — shared image upload handling
 *
 * multer memory storage, a single file field "image", size ≤ MAX_UPLOAD_MB
 * (default 10), JPEG / PNG / WebP only — verified by magic bytes, not just
 * the declared mimetype.
 */
import multer from 'multer';

export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function maxUploadBytes() {
  const mb = Number(process.env.MAX_UPLOAD_MB);
  return Math.floor((Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024);
}

/** Detect the real image type from its first bytes. Returns a mimetype or null. */
export function sniffImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const multerSingle = () => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes(), files: 1, fields: 10 },
  fileFilter(_req, file, cb) {
    const declared = (file.mimetype || '').toLowerCase().replace('image/jpg', 'image/jpeg');
    if (ALLOWED_TYPES.includes(declared)) cb(null, true);
    else cb(Object.assign(new Error('Only JPEG, PNG or WebP images are accepted.'), { code: 'INVALID_FILE_TYPE' }));
  },
}).single('image');

/**
 * Express middleware: parse the upload and verify its magic bytes.
 * On success req.file.mimetype is the sniffed type.
 */
export function imageUpload(req, res, next) {
  multerSingle()(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: `File too large. Maximum size is ${Math.round(maxUploadBytes() / 1048576)} MB.`, code: 'FILE_TOO_LARGE' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}`, code: 'UPLOAD_ERROR' });
      }
      return res.status(400).json({ error: err.message, code: err.code || 'UPLOAD_ERROR' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded. Send multipart/form-data with an "image" field.', code: 'NO_FILE' });
    }
    const sniffed = sniffImageType(req.file.buffer);
    if (!sniffed) {
      return res.status(400).json({ error: 'The file is not a valid JPEG, PNG or WebP image.', code: 'INVALID_FILE_TYPE' });
    }
    req.file.mimetype = sniffed;
    next();
  });
}
