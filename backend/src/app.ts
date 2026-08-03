import express from 'express';
import routes from './routes/index.js';
import { errorHandler } from './errors.js';

export function createApp(): express.Express {
  const app = express();

  app.use(express.json());

  // Tüm rotalar /api/v1 prefix'iyle başlar.
  app.use('/api/v1', routes);

  // Tek biçimli hata yanıtı middleware'i.
  app.use(errorHandler);

  return app;
}