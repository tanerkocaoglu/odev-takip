/**
 * Admin CRUD entegrasyon testleri (supertest) — Aşama 2b.
 * Ortak kurulum: resetDb + 4 rol hesabı; admin token'ı login ile alınır.
 * (fileParallelism: false — testler sıralı, tek test.db)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { resetDb, insertTestUsers, TEST_PASSWORD } from './test/helpers.js';

const app = createApp();

let adminToken: string;

beforeAll(async () => {
  resetDb();
  insertTestUsers();
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@test.local', password: TEST_PASSWORD });
  adminToken = login.body.token as string;
});

function adminRequest(method: 'get' | 'post' | 'patch' | 'delete', path: string) {
  return request(app)[method](path).set('Authorization', `Bearer ${adminToken}`);
}

const YEAR = {
  name: '2026-2027',
  start_date: '2026-09-01',
  end_date: '2027-06-30',
  is_active: true,
};

describe('Yetki — /admin/* yalnızca admin', () => {
  it('token yokken 401 döner', async () => {
    const res = await request(app).get('/api/v1/admin/academic-years');
    expect(res.status).toBe(401);
  });

  it('öğretmen tokenı ile 403 döner', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@test.local', password: TEST_PASSWORD });
    const res = await request(app)
      .get('/api/v1/admin/academic-years')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('Eğitim yılı', () => {
  it('oluşturur ve aktif yapınca tek aktif kalır', async () => {
    const created = await adminRequest('post', '/api/v1/admin/academic-years').send(YEAR);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: YEAR.name, is_active: 1 });

    const second = await adminRequest('post', '/api/v1/admin/academic-years').send({
      name: '2027-2028',
      start_date: '2027-09-01',
      end_date: '2028-06-30',
      is_active: true,
    });
    expect(second.status).toBe(201);

    const list = await adminRequest('get', '/api/v1/admin/academic-years');
    const active = (list.body.items as Array<{ is_active: number }>).filter(
      (y) => y.is_active === 1,
    );
    expect(active).toHaveLength(1);
  });

  it('aynı adla ikinci yıl 409 CONFLICT döner', async () => {
    const res = await adminRequest('post', '/api/v1/admin/academic-years').send(YEAR);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('is_active false yapılabilir; geçersiz body 400 döner', async () => {
    const list = await adminRequest('get', '/api/v1/admin/academic-years');
    const first = (list.body.items as Array<{ id: string }>)[0];

    const res = await adminRequest('patch', `/api/v1/admin/academic-years/${first.id}`).send({
      is_active: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(0);

    const invalid = await adminRequest('post', '/api/v1/admin/academic-years').send({
      name: '',
      start_date: 'x',
      end_date: 'y',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('olmayan yıl güncellenirse 404 döner', async () => {
    const res = await adminRequest('patch', '/api/v1/admin/academic-years/yok').send({
      name: 'X',
    });
    expect(res.status).toBe(404);
  });
});

describe('Hafta', () => {
  let yearId: string;

  beforeAll(async () => {
    const list = await adminRequest('get', '/api/v1/admin/academic-years');
    const year = (list.body.items as Array<{ id: string; name: string }>).find(
      (y) => y.name === YEAR.name,
    );
    if (!year) throw new Error('2026-2027 yılı bulunamadı');
    yearId = year.id;
  });

  it('oluşturur, listeler ve yıl filtresiyle süzler', async () => {
    const created = await adminRequest('post', '/api/v1/admin/weeks').send({
      academic_year_id: yearId,
      week_no: 1,
      start_date: '2026-09-01',
      end_date: '2026-09-07',
      label: '01 - 07 Eylül',
    });
    expect(created.status).toBe(201);

    const list = await adminRequest('get', '/api/v1/admin/weeks');
    expect((list.body.items as unknown[]).length).toBe(1);

    const filtered = await adminRequest(
      'get',
      `/api/v1/admin/weeks?academicYearId=${yearId}`,
    );
    expect((filtered.body.items as unknown[]).length).toBe(1);
  });

  it('aynı week_no ikinci kez 409 döner', async () => {
    const res = await adminRequest('post', '/api/v1/admin/weeks').send({
      academic_year_id: yearId,
      week_no: 1,
      start_date: '2026-09-01',
      end_date: '2026-09-07',
      label: 'Tekrar',
    });
    expect(res.status).toBe(409);
  });

  it('PATCH week_no değiştiremez (yalnızca tarih/label)', async () => {
    const list = await adminRequest('get', '/api/v1/admin/weeks');
    const week = (list.body.items as Array<{ id: string; week_no: number }>)[0];

    const res = await adminRequest('patch', `/api/v1/admin/weeks/${week.id}`).send({
      week_no: 99,
      label: 'Yeni etiket',
    });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Yeni etiket');
    expect(res.body.week_no).toBe(week.week_no); // week_no değişmedi
  });

  it('yıl aralığı dışına taşan hafta 400 döner', async () => {
    const res = await adminRequest('post', '/api/v1/admin/weeks').send({
      academic_year_id: yearId,
      week_no: 50,
      start_date: '2027-09-01',
      end_date: '2027-09-07',
      label: 'Yıl dışı',
    });
    expect(res.status).toBe(400);
  });

  it('olmayan yıla hafta eklenemez (404)', async () => {
    const res = await adminRequest('post', '/api/v1/admin/weeks').send({
      academic_year_id: 'yok',
      week_no: 1,
      start_date: '2026-09-01',
      end_date: '2026-09-07',
      label: 'X',
    });
    expect(res.status).toBe(404);
  });

  it('silinebilir; silinen haftaya tekrar eklenebilir', async () => {
    const created = await adminRequest('post', '/api/v1/admin/weeks').send({
      academic_year_id: yearId,
      week_no: 2,
      start_date: '2026-09-08',
      end_date: '2026-09-14',
      label: '08 - 14 Eylül',
    });
    expect(created.status).toBe(201);

    const del = await adminRequest('delete', `/api/v1/admin/weeks/${created.body.id}`);
    expect(del.status).toBe(204);

    const again = await adminRequest('post', '/api/v1/admin/weeks').send({
      academic_year_id: yearId,
      week_no: 2,
      start_date: '2026-09-08',
      end_date: '2026-09-14',
      label: 'Yeniden',
    });
    expect(again.status).toBe(201);
  });
});
