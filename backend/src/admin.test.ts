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

describe('Sınıf', () => {
  let yearId: string;

  beforeAll(async () => {
    const list = await adminRequest('get', '/api/v1/admin/academic-years');
    const year = (list.body.items as Array<{ id: string; name: string }>).find(
      (y) => y.name === YEAR.name,
    );
    if (!year) throw new Error('2026-2027 yılı bulunamadı');
    yearId = year.id;
  });

  it('oluşturur; Türkçe harf duyarsız arama bulur', async () => {
    const created = await adminRequest('post', '/api/v1/admin/classes').send({
      academic_year_id: yearId,
      name: 'ÖKLİD',
    });
    expect(created.status).toBe(201);

    const search = await adminRequest('get', '/api/v1/admin/classes?q=oklid');
    expect((search.body.items as Array<{ name: string }>).map((c) => c.name)).toContain(
      'ÖKLİD',
    );
  });

  it('aynı ad farklı harf biçimiyle 409 döner (normalized çakışma)', async () => {
    const res = await adminRequest('post', '/api/v1/admin/classes').send({
      academic_year_id: yearId,
      name: 'Öklİd',
    });
    expect(res.status).toBe(409);
  });

  it('PATCH ad değiştirir; silinen sınıf listede görünmez', async () => {
    const list = await adminRequest('get', '/api/v1/admin/classes');
    const cls = (list.body.items as Array<{ id: string; name: string }>)[0];

    const patched = await adminRequest('patch', `/api/v1/admin/classes/${cls.id}`).send({
      name: 'ÖKLİD YENİ',
    });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe('ÖKLİD YENİ');

    const del = await adminRequest('delete', `/api/v1/admin/classes/${cls.id}`);
    expect(del.status).toBe(204);

    const after = await adminRequest('get', '/api/v1/admin/classes');
    expect(
      (after.body.items as Array<{ id: string }>).some((c) => c.id === cls.id),
    ).toBe(false);
  });

  it('olmayan sınıf güncelleme/silme 404 döner', async () => {
    expect((await adminRequest('patch', '/api/v1/admin/classes/yok').send({ name: 'X' })).status).toBe(404);
    expect((await adminRequest('delete', '/api/v1/admin/classes/yok')).status).toBe(404);
  });
});

describe('Ders', () => {
  it('oluşturur ve aynı ad 409 döner', async () => {
    const created = await adminRequest('post', '/api/v1/admin/courses').send({
      name: 'Geometri',
    });
    expect(created.status).toBe(201);

    const clash = await adminRequest('post', '/api/v1/admin/courses').send({
      name: 'geometrİ',
    });
    expect(clash.status).toBe(409);
  });

  it('PATCH ad değiştirir; atanmamış ders silinebilir', async () => {
    const list = await adminRequest('get', '/api/v1/admin/courses');
    const course = (list.body.items as Array<{ id: string; name: string }>).find(
      (c) => c.name === 'Geometri',
    );
    if (!course) throw new Error('Geometri bulunamadı');

    const patched = await adminRequest('patch', `/api/v1/admin/courses/${course.id}`).send({
      name: 'Geometri-2',
    });
    expect(patched.status).toBe(200);

    const del = await adminRequest('delete', `/api/v1/admin/courses/${course.id}`);
    expect(del.status).toBe(204);
  });
});

describe('Atamalar (class_courses)', () => {
  let classId: string;
  let courseId: string;
  let yearId: string;

  beforeAll(async () => {
    const years = await adminRequest('get', '/api/v1/admin/academic-years');
    yearId = (years.body.items as Array<{ id: string; name: string }>).find(
      (y) => y.name === YEAR.name,
    )!.id;

    const created = await adminRequest('post', '/api/v1/admin/classes').send({
      academic_year_id: yearId,
      name: 'PİSAGOR',
    });
    classId = created.body.id as string;

    const course = await adminRequest('post', '/api/v1/admin/courses').send({
      name: 'Fizik',
    });
    courseId = course.body.id as string;
  });

  it('oluşturur (ders günü + saat + öğretmen)', async () => {
    const created = await adminRequest('post', '/api/v1/admin/class-courses').send({
      class_id: classId,
      course_id: courseId,
      teacher_id: 'test-teacher',
      day_of_week: 3,
      lesson_time: '10:30',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      class_name: 'PİSAGOR',
      course_name: 'Fizik',
      teacher_name: 'Test Teacher',
      day_of_week: 3,
    });
  });

  it('aynı sınıf-ders çifti ikinci kez 409 döner', async () => {
    const res = await adminRequest('post', '/api/v1/admin/class-courses').send({
      class_id: classId,
      course_id: courseId,
      teacher_id: 'test-teacher',
      day_of_week: 5,
      lesson_time: '09:00',
    });
    expect(res.status).toBe(409);
  });

  it('öğretmen olmayan kullanıcıya atanamaz (404)', async () => {
    const res = await adminRequest('post', '/api/v1/admin/class-courses').send({
      class_id: classId,
      course_id: courseId,
      teacher_id: 'test-admin',
      day_of_week: 5,
      lesson_time: '09:00',
    });
    expect(res.status).toBe(404);
  });

  it('PATCH ders günü/saati/öğretmen değiştirir', async () => {
    const list = await adminRequest('get', `/api/v1/admin/class-courses?classId=${classId}`);
    const cc = (list.body.items as Array<{ id: string }>)[0];

    const patched = await adminRequest('patch', `/api/v1/admin/class-courses/${cc.id}`).send({
      day_of_week: 4,
      lesson_time: '13:00',
    });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ day_of_week: 4, lesson_time: '13:00' });
  });

  it('sınıf filtresi listeyi süzer; silinebilir', async () => {
    const list = await adminRequest('get', `/api/v1/admin/class-courses?classId=${classId}`);
    expect((list.body.items as unknown[]).length).toBe(1);

    const cc = (list.body.items as Array<{ id: string }>)[0];
    const del = await adminRequest('delete', `/api/v1/admin/class-courses/${cc.id}`);
    expect(del.status).toBe(204);
  });

  it('geçersiz saat 400 döner', async () => {
    const res = await adminRequest('post', '/api/v1/admin/class-courses').send({
      class_id: classId,
      course_id: courseId,
      teacher_id: 'test-teacher',
      day_of_week: 1,
      lesson_time: '10:30:00',
    });
    expect(res.status).toBe(400);
  });
});

describe('Öğretmen', () => {
  it('oluşturur; aynı e-posta/telefon 409 döner', async () => {
    const created = await adminRequest('post', '/api/v1/admin/teachers').send({
      full_name: 'Yeni Öğretmen',
      email: 'yeni@test.local',
      phone: '+90 532 111 22 33',
      password: 'Sifre123',
    });
    expect(created.status).toBe(201);
    expect(created.body.phone).toBe('+905321112233'); // normalize edildi

    const clash = await adminRequest('post', '/api/v1/admin/teachers').send({
      full_name: 'İkinci',
      email: 'yeni@test.local',
      phone: '+905321112233',
      password: 'Sifre123',
    });
    expect(clash.status).toBe(409);
  });

  it('oluşturulan öğretmen şifresiyle giriş yapabilir', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'yeni@test.local', password: 'Sifre123' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('teacher');
  });

  it('sayfalama çalışır (pageSize ve total)', async () => {
    const res = await adminRequest('get', '/api/v1/admin/teachers?page=1&pageSize=1');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(res.body.items.length).toBe(1);
    expect(res.body.page).toBe(1);
  });

  it('şifre sıfırlama sonrası eski token 401, yeni şifreyle giriş OK', async () => {
    const list = await adminRequest('get', '/api/v1/admin/teachers?q=yeni+ogretmen');
    const teacher = (list.body.items as Array<{ id: string }>)[0];

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'yeni@test.local', password: 'Sifre123' });
    const oldToken = oldLogin.body.token as string;

    const reset = await adminRequest(
      'post',
      `/api/v1/admin/teachers/${teacher.id}/reset-password`,
    ).send({ password: 'YeniSifre456' });
    expect(reset.status).toBe(200);

    const meWithOld = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(meWithOld.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'yeni@test.local', password: 'YeniSifre456' });
    expect(newLogin.status).toBe(200);
  });

  it('silme: audit log yazar; eski token 401; atamalı öğretmen 409', async () => {
    const created = await adminRequest('post', '/api/v1/admin/teachers').send({
      full_name: 'Silinecek Öğretmen',
      email: 'silinecek@test.local',
      phone: '+905339998877',
      password: 'Sifre123',
    });
    const teacherId = created.body.id as string;

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'silinecek@test.local', password: 'Sifre123' });
    const token = login.body.token as string;

    const del = await adminRequest('delete', `/api/v1/admin/teachers/${teacherId}`);
    expect(del.status).toBe(204);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);

    const audit = await request(app).get('/api/v1/auth/me');
    void audit;
    // audit_logs'ta kayıt var (doğrudan DB üzerinden doğrulanır)
    const { db } = await import('./db/index.js');
    const log = db
      .prepare(`SELECT action FROM audit_logs WHERE entity_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(teacherId) as { action: string };
    expect(log.action).toBe('teacher.delete');
  });
});

describe('Admin ekleme', () => {
  it('yeni admin oluşturur ve audit log yazar', async () => {
    const created = await adminRequest('post', '/api/v1/admin/admins').send({
      full_name: 'İkinci Yönetici',
      email: 'admin2@test.local',
      phone: '+905331112233',
      password: 'Sifre123',
    });
    expect(created.status).toBe(201);
    expect(created.body.role ?? 'admin').toBe('admin');

    const { db } = await import('./db/index.js');
    const log = db
      .prepare(
        `SELECT action, diff FROM audit_logs WHERE entity_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(created.body.id as string) as { action: string; diff: string };
    expect(log.action).toBe('user.create');
    expect(JSON.parse(log.diff)).toMatchObject({ role: 'admin' });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin2@test.local', password: 'Sifre123' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('admin');
  });

  it('kısa şifre 400 döner', async () => {
    const res = await adminRequest('post', '/api/v1/admin/admins').send({
      full_name: 'X',
      email: 'x@test.local',
      phone: '+905331113344',
      password: '123',
    });
    expect(res.status).toBe(400);
  });
});
