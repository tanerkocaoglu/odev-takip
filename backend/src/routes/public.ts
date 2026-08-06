/**
 * Public rota — `/api/v1/public/*` (kimlik doğrulamasız).
 *
 * `GET /public/digests/:token` — veli rapor sayfası `/r/{token}` besler
 * (spec.md §5.4 adım 6, §6 Veli). Girişsiz, salt okunur; velinin gördüğü
 * kopya `weekly_digests.snapshot`'tır (gönderim anında dondurulmuş içerik).
 *
 * 410 kuralları (spec.md §5.4 "Token iptali"):
 * - Bilinmeyen token → 410 (404 DEĞİL — token'ın var olup olmadığı sızmaz).
 * - `is_revoked = 1` → 410.
 * - Token, gönderilmemiş (`status != 'sent'`) veya snapshot'ı bozuk bir
 *   digest'e aitse → 410 (bu token zaten dışarı hiç paylaşılmamıştır).
 * Tümü aynı mesajı döner: "Bu rapor artık geçerli değil."
 */

import { Router } from 'express';
import { db } from '../db/index.js';
import { AppError } from '../errors.js';
import { isLinkPreviewBot, markDigestViewed } from '../services/digests.js';

const router = Router();

router.get('/digests/:token', (req, res) => {
  const { token } = req.params;

  const row = db
    .prepare(
      `SELECT id, snapshot, status, sent_at, is_revoked
       FROM weekly_digests WHERE token = ?`,
    )
    .get(token) as
    | { id: string; snapshot: string | null; status: string; sent_at: string | null; is_revoked: number }
    | undefined;

  if (!row || row.is_revoked === 1 || row.status !== 'sent' || row.snapshot === null) {
    throw new AppError('GONE', 410, 'Bu rapor artık geçerli değil.');
  }

  let snapshot: unknown;
  try {
    snapshot = JSON.parse(row.snapshot);
  } catch {
    throw new AppError('GONE', 410, 'Bu rapor artık geçerli değil.');
  }

  // Görüntüleme takibi (spec §5.4): gerçek veli görüntülemesi sayılır;
  // WhatsApp/facebook vb. link-önizleme botları değil (yanlış kayıt üretir).
  if (!isLinkPreviewBot(req.headers['user-agent'])) {
    markDigestViewed(row.id);
  }

  res.json({ snapshot, sent_at: row.sent_at });
});

export default router;
