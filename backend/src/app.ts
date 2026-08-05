import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import routes from './routes/index.js';
import { errorHandler } from './errors.js';

export function createApp(): express.Express {
  const app = express();

  app.use(express.json());

  // Tüm rotalar /api/v1 prefix'iyle başlar.
  app.use('/api/v1', routes);

  // Production: frontend build'ini (kök dist/) statik olarak sun.
  // Render'da tek servis yeterli olur — CORS/proxy gerekmez.
  // Test ortamında (DB_PATH=test.db) devre dışıdır: /api/v1 dışı rotalar
  // 404 dönmeye devam eder (app.test.ts).
  const isTest = process.env.DB_PATH !== undefined;
  const distPath = path.resolve(import.meta.dirname, '..', '..', 'dist');
  if (!isTest && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // SPA fallback — React Router'ın /student, /teacher vb. yolları.
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Tek biçimli hata yanıtı middleware'i.
  app.use(errorHandler);

  return app;
}
