/**
 * Admin router toplayıcısı — `/api/v1/admin/*` (spec.md §2, §6).
 *
 * Eski tek dosya (`routes/admin.ts`) konu bazlı alt router'lara bölündü.
 * **Yetki tek noktada**: burada bir kez `requireAuth + adminOnly` uygulanır;
 * alt router'lar bu korumanın altına mount edilir (her rotada tekrar yok).
 * Bu, projenin en kritik güvenlik ilkesini (admin rotalarının tamamı korumalı)
 * tek yerden garanti eder.
 *
 * Alt router'lar eski kaynak sırasıyla mount edilir; path'ler tam olduğu için
 * prefix verilmez.
 */

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { adminOnly } from '../../middleware/adminOnly.js';
import academicYearsRouter from './academicYears.js';
import weeksRouter from './weeks.js';
import classesRouter from './classes.js';
import coursesRouter from './courses.js';
import schoolsRouter from './schools.js';
import classCoursesRouter from './classCourses.js';
import teachersRouter from './teachers.js';
import adminsRouter from './admins.js';
import guardiansRouter from './guardians.js';
import studentsRouter from './students.js';
import digestsRouter from './digests.js';
import dashboardRouter from './dashboard.js';
import backupRouter from './backup.js';
import studentImportRouter from './studentImport.js';
import reportsRouter from './reports.js';

const router = Router();

// Router seviyesinde yetki — tüm /admin/* rotaları yalnızca admin.
router.use(requireAuth, adminOnly);

router.use(academicYearsRouter);
router.use(weeksRouter);
router.use(classesRouter);
router.use(coursesRouter);
router.use(schoolsRouter);
router.use(classCoursesRouter);
router.use(teachersRouter);
router.use(adminsRouter);
router.use(guardiansRouter);
router.use(studentsRouter);
router.use(digestsRouter);
router.use(dashboardRouter);
router.use(backupRouter);
router.use(studentImportRouter);
router.use(reportsRouter);

export default router;
