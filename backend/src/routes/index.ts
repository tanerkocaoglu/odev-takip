import { Router } from 'express';
import { db } from '../db/index.js';
import authRoutes from './auth.js';

const router = Router();

router.use('/auth', authRoutes);

// Tüm rotalar /api/v1 prefix'iyle başlar; bu router'a monte edilir.
router.get('/health', (_req, res) => {
  // DB bağlantısının canlı olduğunu da doğrular.
  db.prepare('SELECT 1').get();
  res.json({
    status: 'ok',
    version: '0.0.1',
    timestamp: new Date().toISOString(),
  });
});

export default router;