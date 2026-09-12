/**
 * Yedek indirme rotası — `/api/v1/admin/backup` (spec.md §6 Admin madde 3).
 * Spawn mantığı `services/backupCli.ts`'te; rate limit ve yanıt burada.
 */

import { Router } from 'express';
import { rateLimit } from '../../middleware/rateLimit.js';
import { spawnBackup } from '../../services/backupCli.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ADMIN_BACKUP_RATE_LIMIT_MAX, EXPENSIVE_OP_WINDOW_MS } from './shared.js';

const router = Router();

router.post(
  '/backup',
  rateLimit({
    windowMs: EXPENSIVE_OP_WINDOW_MS,
    max: ADMIN_BACKUP_RATE_LIMIT_MAX,
    keyFn: (req) => `admin-backup:${req.user!.id}`,
    message:
      'Çok fazla yedek alma isteği yapıldı, lütfen bir süre sonra tekrar deneyin.',
  }),
  asyncHandler(async (_req, res) => {
    const result = await spawnBackup();
    if (!result.ok || !result.zipPath) {
      res.status(500).json({
        error: { code: 'INTERNAL', message: result.message ?? 'Yedek oluşturulamadı.' },
      });
      return;
    }
    res.download(result.zipPath);
  }),
);

export default router;
