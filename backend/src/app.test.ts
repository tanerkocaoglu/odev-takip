import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

describe('GET /api/v1/health', () => {
  it('200 döner ve status ok içerir', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      version: '0.0.1',
    });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('/api/v1 dışı rotalar 404 döner', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(404);
  });
});