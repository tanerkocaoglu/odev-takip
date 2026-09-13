import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import routes from './routes/index.js';
import { errorHandler } from './errors.js';

export interface AppOptions {
  /** Frontend build dizini; testler izole bir dizin vermek için kullanır. */
  distPath?: string;
}

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();

  app.use(express.json());

  // Tüm rotalar /api/v1 prefix'iyle başlar.
  app.use('/api/v1', routes);

  // Production: frontend build'ini (kök dist/) statik olarak sun.
  // Render'da tek servis yeterli olur — CORS/proxy gerekmez.
  //
  // Test ortamı YALNIZCA `NODE_ENV === 'test'` ile belirlenir. `DB_PATH` burada
  // sentinel DEĞİLDİR: üretimde kalıcı disk için `DB_PATH` set edilir (render.yaml)
  // ve statik sunum kapanmamalıdır. Testler `DB_PATH` set etse de (vitest.config)
  // NODE_ENV=test olduğu için /api/v1 dışı rotalar 404 döner (app.test.ts).
  const isTest = process.env.NODE_ENV === 'test';
  const distPath =
    options.distPath ?? path.resolve(import.meta.dirname, '..', '..', 'dist');
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
