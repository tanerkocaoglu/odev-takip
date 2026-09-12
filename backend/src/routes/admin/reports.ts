/**
 * Rapor CSV dışa aktarma rotası — `GET /api/v1/admin/reports/export`
 * (spec.md §5.7). Filtreler `/teacher/reports` admin kapsamıyla aynıdır.
 */

import { Router } from 'express';
import { reportsExportCsv } from '../../services/csvExport.js';
import { sendCsv } from './shared.js';

const router = Router();

router.get('/reports/export', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const classId = typeof req.query.class_id === 'string' ? req.query.class_id : undefined;
  const weekId = typeof req.query.week_id === 'string' ? req.query.week_id : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  sendCsv(res, 'raporlar.csv', reportsExportCsv({ status, classId, weekId, q }));
});

export default router;
