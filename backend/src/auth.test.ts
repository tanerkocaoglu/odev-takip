/**
 * Auth entegrasyon testleri (supertest) — spec.md §2 ve §2.1:
 * - 4 rolle giriş (admin/öğretmen e-posta+şifre, veli/öğrenci username+şifre)
 * - login brute-force rate limit (429)
 * - Hesap var/yok sızıntısı yok (aynı hata mesajı + zamanlama eşitlemesi)
 * - `token_version` uyumsuzluğunda 401
 * - Yetki matrisi: requireAuth (401/200) + adminOnly (403) — her rol
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Router } from 'express';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { errorHandler } from './errors.js';
import { requireAuth } from './middleware/auth.js';
import { adminOnly } from './middleware/adminOnly.js';
import { signToken } from './utils/token.js';
import { hashPasswordSync } from './utils/hash.js';
import { clearRateLimits } from './middleware/rateLimit.js';
import { resetDb, insertTestUsers, TEST_PASSWORD } from './test/helpers.js';

// Test-only rotalar: yetki matrisi buradan beslenir.
const testRouter = Router();
testRouter.get('/admin-only', requireAuth, adminOnly, (req, res) => {
  res.json({ ok: true, role: req.user!.role, id: req.user!.id });
});
testRouter.get('/authed', requireAuth, (req, res) => {
  res.json({ ok: true, role: req.user!.role, id: req.user!.id });
});

const app = createApp();
app.use('/api/v1/_test', testRouter);
// Express 4: error handler en sonda register edilmeli — createApp'in
// errorHandler'ı testRouter'dan önce olduğu için _test hatalarını görmez.
app.use(errorHandler);

const EMAIL_USERS = {
  admin: { identifier: 'admin@test.local', password: TEST_PASSWORD },
  teacher: { identifier: 'teacher@test.local', password: TEST_PASSWORD },
};

const USERNAME_USERS = {
  guardian: { identifier: 'test-guardian', password: TEST_PASSWORD },
  student: { identifier: 'test-student', password: TEST_PASSWORD },
};

beforeAll(() => {
  resetDb();
  insertTestUsers();
});

beforeEach(() => {
  clearRateLimits();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/v1/auth/login', () => {
  it('admin e-posta + şifre ile giriş yapar ve JWT + user döner', async () => {
    const res = await request(app).post('/api/v1/auth/login').send(EMAIL_USERS.admin);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toMatchObject({
      id: 'test-admin',
      role: 'admin',
      email: 'admin@test.local',
    });
    expect(res.body.user.full_name).toBe('Test Admin');
  });

  it('öğretmen e-posta + şifre ile giriş yapar', async () => {
    const res = await request(app).post('/api/v1/auth/login').send(EMAIL_USERS.teacher);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('teacher');
  });

  it('veli username + şifre ile giriş yapar ve JWT döner', async () => {
    const res = await request(app).post('/api/v1/auth/login').send(USERNAME_USERS.guardian);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toMatchObject({
      id: 'test-guardian',
      role: 'guardian',
      username: 'test-guardian',
    });
  });

  it('öğrenci username + şifre ile giriş yapar', async () => {
    const res = await request(app).post('/api/v1/auth/login').send(USERNAME_USERS.student);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('student');
  });

  it('admin/öğretmen username ile giremez (username yok)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'test-admin', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('yanlış şifre 401 UNAUTHORIZED döner', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'admin@test.local', password: 'yanlis' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('E-posta/kullanıcı adı veya şifre hatalı.');
  });

  it('olmayan identifier aynı hata mesajını döner (hesap sızıntısı yok)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'yok@test.local', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('E-posta/kullanıcı adı veya şifre hatalı.');
  });

  it('geçersiz body 400 VALIDATION_ERROR döner', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: '', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toBeDefined();
  });

  it('brute-force: 5 başarısız denemeden sonra 429 RATE_LIMITED döner', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: 'test-guardian', password: 'yanlis' });
      expect(res.status).toBe(401);
    }
    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'test-guardian', password: 'yanlis' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('token yokken 401 UNAUTHORIZED döner', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('4 rolün geçerli tokenı ile 200 döner', async () => {
    const logins: Array<{ identifier: string; password: string }> = [
      EMAIL_USERS.admin,
      EMAIL_USERS.teacher,
      USERNAME_USERS.guardian,
      USERNAME_USERS.student,
    ];
    for (const input of logins) {
      const login = await request(app).post('/api/v1/auth/login').send(input);
      const me = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${login.body.token}`);
      expect(me.status).toBe(200);
    }
  });

  it('token_version uyumsuzluğunda 401 döner', async () => {
    // Eski tv ile imzalanmış token — DB'deki token_version ile eşleşmez.
    const stale = signToken(
      { id: 'test-admin', role: 'admin', teacher_id: null, student_id: null, guardian_id: null },
      99,
    );
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${stale}`);
    expect(res.status).toBe(401);
  });

  it('payload role yanlış olsa bile DB role kullanılır', async () => {
    // Öğretmenin id'siyle ama 'admin' rolüyle imzalanmış token:
    // güvenlik — role DB'den okunur, payload'a güvenilmez.
    const forged = signToken(
      { id: 'test-teacher', role: 'admin', teacher_id: null, student_id: null, guardian_id: null },
      1,
    );
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('teacher');
  });
});

describe('Yetki matrisi', () => {
  async function tokenFor(input: { identifier: string; password: string }): Promise<string> {
    const login = await request(app).post('/api/v1/auth/login').send(input);
    return login.body.token as string;
  }

  it('token olmadan korumalı rota 401 döner', async () => {
    const res = await request(app).get('/api/v1/_test/authed');
    expect(res.status).toBe(401);
  });

  it('4 rol de requireAuth\'tan geçer (200)', async () => {
    const inputs = [EMAIL_USERS.admin, EMAIL_USERS.teacher, USERNAME_USERS.guardian, USERNAME_USERS.student];
    for (const input of inputs) {
      const token = await tokenFor(input);
      const res = await request(app)
        .get('/api/v1/_test/authed')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
  });

  it('adminOnly: yalnızca admin 200; diğer 3 rol 403 FORBIDDEN', async () => {
    const adminRes = await request(app)
      .get('/api/v1/_test/admin-only')
      .set('Authorization', `Bearer ${await tokenFor(EMAIL_USERS.admin)}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.role).toBe('admin');

    const teacherRes = await request(app)
      .get('/api/v1/_test/admin-only')
      .set('Authorization', `Bearer ${await tokenFor(EMAIL_USERS.teacher)}`);
    expect(teacherRes.status).toBe(403);
    expect(teacherRes.body.error.code).toBe('FORBIDDEN');

    const guardianRes = await request(app)
      .get('/api/v1/_test/admin-only')
      .set('Authorization', `Bearer ${await tokenFor(USERNAME_USERS.guardian)}`);
    expect(guardianRes.status).toBe(403);

    const studentRes = await request(app)
      .get('/api/v1/_test/admin-only')
      .set('Authorization', `Bearer ${await tokenFor(USERNAME_USERS.student)}`);
    expect(studentRes.status).toBe(403);
  });
});

describe('must_change_password — ilk girişte zorunlu şifre değiştirme', () => {
  const CP_PASSWORD = 'Baslangic1';
  const NEW_PASSWORD = 'YeniSifre1';

  beforeAll(() => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users
         (id, full_name, full_name_normalized, username, email, password_hash, role,
          is_active, token_version, must_change_password, deleted_at, created_at)
       VALUES ('cp-student', 'CP Ogrenci', 'cp ogrenci', 'cp-student', NULL, ?, 'student',
               1, 1, 1, NULL, ?)`,
    ).run(hashPasswordSync(CP_PASSWORD), now);
  });

  beforeEach(() => {
    db.prepare(
      `UPDATE users SET password_hash = ?, must_change_password = 1, token_version = 1
       WHERE id = 'cp-student'`,
    ).run(hashPasswordSync(CP_PASSWORD));
  });

  async function loginCp(): Promise<string> {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'cp-student', password: CP_PASSWORD });
    return res.body.token as string;
  }

  it('login ve me must_change_password=true taşır', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'cp-student', password: CP_PASSWORD });
    expect(login.body.user.must_change_password).toBe(true);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.must_change_password).toBe(true);
  });

  it('bayrak 1 iken başka korumalı uç 403; /auth/me serbest', async () => {
    const token = await loginCp();
    const blocked = await request(app)
      .get('/api/v1/_test/authed')
      .set('Authorization', `Bearer ${token}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('FORBIDDEN');

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
  });

  it('şifre değişir: bayrak 0, tv+1, eski token 401, yeni token geçerli', async () => {
    const oldToken = await loginCp();

    const change = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ current_password: CP_PASSWORD, new_password: NEW_PASSWORD });
    expect(change.status).toBe(200);
    expect(change.body.user.must_change_password).toBe(false);
    expect(typeof change.body.token).toBe('string');

    const row = db
      .prepare(`SELECT must_change_password, token_version FROM users WHERE id = 'cp-student'`)
      .get() as { must_change_password: number; token_version: number };
    expect(row.must_change_password).toBe(0);
    expect(row.token_version).toBe(2);

    // Eski token öldü (tv uyuşmuyor) → 401.
    const withOld = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(withOld.status).toBe(401);

    // Yeni token hem me hem başka korumalı uçta çalışır.
    const withNew = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${change.body.token}`);
    expect(withNew.status).toBe(200);

    const allowed = await request(app)
      .get('/api/v1/_test/authed')
      .set('Authorization', `Bearer ${change.body.token}`);
    expect(allowed.status).toBe(200);
  });

  it('yanlış mevcut şifre 400; bayrak değişmez', async () => {
    const token = await loginCp();
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'YanlisSifre1', new_password: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.current_password).toBeDefined();
    const row = db
      .prepare(`SELECT must_change_password FROM users WHERE id = 'cp-student'`)
      .get() as { must_change_password: number };
    expect(row.must_change_password).toBe(1);
  });

  it('zayıf yeni şifre 400 (katı politika)', async () => {
    const token = await loginCp();
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: CP_PASSWORD, new_password: 'zayif' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields.new_password).toBeDefined();
  });

  it('öğretmen bu akışın tamamen dışındadır', async () => {
    const login = await request(app).post('/api/v1/auth/login').send(EMAIL_USERS.teacher);
    expect(login.status).toBe(200);
    expect(login.body.user.must_change_password).toBe(false);

    const row = db
      .prepare(`SELECT must_change_password FROM users WHERE id = 'test-teacher'`)
      .get() as { must_change_password: number };
    expect(row.must_change_password).toBe(0);

    // Zayıf/zorunlu yönlendirme yok — normal korumalı uç çalışır.
    const res = await request(app)
      .get('/api/v1/_test/authed')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
  });
});
