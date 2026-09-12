/**
 * Admin panel rotaları — `/api/v1/admin/dashboard*` (spec.md §5.5, §6).
 * İş mantığı `services/dashboard.ts`'te; burada yalnızca query parse + yanıt.
 */

import { Router } from 'express';
import { parsePagination, paged } from '../../utils/pagination.js';
import {
  getDashboardOverview,
  getMissingReportsView,
  getRiskData,
} from '../../services/dashboard.js';

const router = Router();

router.get('/dashboard', (req, res) => {
  const weekId = typeof req.query.week_id === 'string' ? req.query.week_id : undefined;
  res.json(getDashboardOverview(weekId));
});

router.get('/dashboard/missing', (req, res) => {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  const weekId = typeof req.query.week_id === 'string' ? req.query.week_id : undefined;
  const { missing } = getMissingReportsView(weekId);
  const slice = missing.slice(pagination.offset, pagination.offset + pagination.limit);
  res.json(paged(slice, missing.length, pagination));
});

router.get('/dashboard/risk', (_req, res) => {
  res.json(getRiskData());
});

export default router;
