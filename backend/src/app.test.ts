import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';

/**
 * Testler `DB_PATH` set eder (vitest.config.ts) ama `NODE_ENV=test` olduğu için
 * statik frontend sunumu kapalı olmalıdır. Aşağıdaki "mod ayrımı" testleri bunu
 * ile üretim davranışını ayrı ayrı kanıtlar.
 */

const originalNodeEnv = process.env.NODE_ENV;
let distDir: string;

beforeAll(() => {
  // İzole bir sahte frontend build'i — gerçek dist/ ve mod farkı bağımsız.
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-dist-'));
  fs.writeFileSync(
    path.join(distDir, 'index.html'),
    '<!doctype html><html><head><title>SPA-MARKER</title></head><body>SPA-MARKER</body></html>',
  );
});

afterAll(() => {
  fs.rmSync(distDir, { recursive: true, force: true });
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

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

describe('frontend sunumu — mod ayrımı', () => {
  it('test modu: NODE_ENV=test iken DB_PATH set olsa bile statik sunum KAPALI', async () => {
    process.env.NODE_ENV = 'test';
    expect(process.env.DB_PATH).toBeDefined();

    const app = createApp({ distPath: distDir });

    // Sahte dist gerçekten var — 404, dist yokluğundan değil moddan gelir.
    expect(fs.existsSync(path.join(distDir, 'index.html'))).toBe(true);

    const root = await request(app).get('/');
    const route = await request(app).get('/teacher');
    expect(root.status).toBe(404);
    expect(route.status).toBe(404);
  });

  it('üretim modu: NODE_ENV=production + DB_PATH set iken arayüz GERÇEKTEN sunulur', async () => {
    process.env.NODE_ENV = 'production';
    expect(process.env.DB_PATH).toBeDefined();

    const app = createApp({ distPath: distDir });

    const root = await request(app).get('/');
    expect(root.status).toBe(200);
    expect(root.text).toContain('SPA-MARKER');

    // SPA fallback: /api/ dışı bilinmeyen yol index.html döner.
    const route = await request(app).get('/teacher');
    expect(route.status).toBe(200);
    expect(route.text).toContain('SPA-MARKER');
  });
});
