/**
 * Haftalık ödev özeti rotası — `GET /api/v1/admin/homework-summary`
 * (spec.md §5.8). İş mantığı `services/homeworkSummary.ts`'te; burada yalnızca
 * parse + yanıt. Yetki toplayıcıda (requireAuth + adminOnly) uygulanır.
 */

import { Router } from 'express';
import { AppError } from '../../errors.js';
import {
  buildHomeworkSummary,
  resolveHomeworkSummaryWeekId,
} from '../../services/homeworkSummary.js';

const router = Router();

router.get('/homework-summary', (req, res) => {
  const classId = typeof req.query.class_id === 'string' ? req.query.class_id : '';
  if (!classId) {
    throw new AppError('VALIDATION_ERROR', 400, 'Sınıf seçilmedi.');
  }
  const weekId = resolveHomeworkSummaryWeekId(
    typeof req.query.week_id === 'string' ? req.query.week_id : undefined,
  );
  if (!weekId) {
    throw new AppError('NOT_FOUND', 404, 'Aktif hafta bulunamadı.');
  }
  res.json(buildHomeworkSummary(classId, weekId));
});

export default router;
