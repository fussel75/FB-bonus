import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../middleware/auth';

const router = Router();

const uploadsDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `logo_${Date.now()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Nur Bilddateien erlaubt (PNG, JPG, SVG, WEBP, GIF)'));
    }
  },
});

router.post('/logo', requireAuth, upload.single('logo'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'Keine Datei hochgeladen' });
    return;
  }

  const host = req.get('host') ?? 'localhost:5000';
  const protocol = req.protocol;
  const url = `${protocol}://${host}/uploads/${req.file.filename}`;

  res.json({
    success: true,
    data: {
      url,
      filename: req.file.filename,
      size: req.file.size,
    },
  });
});

export default router;
