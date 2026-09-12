/**
 * Haftalık gönderim rotaları — `/api/v1/admin/digests*` (spec.md §5.4).
 * İş mantığı `services/digests.ts`'te; burada yalnızca parse + yanıt.
 */

import { Router } from 'express';
import {
  currentDigestWeek,
  listDigests,
  previewDigest,
  revokeDigest,
  sendDigest,
} from '../../services/digests.js';

const router = Router();

router.get('/digests', (req, res) => {
  const statusFilter =
    typeof req.query.status === 'string' &&
    ['pending', 'ready', 'sent'].includes(req.query.status)
      ? req.query.status
      : null;
  const classId = typeof req.query.class_id === 'string' ? req.query.class_id : null;
  const weekId =
    typeof req.query.week_id === 'string' ? req.query.week_id : (currentDigestWeek()?.id ?? null);
  res.json(listDigests({ weekId, status: statusFilter, classId }));
});

router.get('/digests/:id/preview', (req, res) => {
  res.json({ preview: previewDigest(req.params.id) });
});

router.post('/digests/:id/send', (req, res) => {
  res.json(sendDigest(req.params.id, req.user!.id));
});

router.post('/digests/:id/revoke', (req, res) => {
  res.json(revokeDigest(req.params.id, req.user!.id));
});

export default router;
