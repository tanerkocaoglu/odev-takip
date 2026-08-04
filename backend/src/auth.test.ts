/**
 * Auth entegrasyon testleri (supertest) — spec.md §2 ve §2.1:
 * - 4 rolle giriş (admin/öğretmen e-posta+şifre, veli/öğrenci telefon+OTP)
 * - login brute-force rate limit (429)
 * - OTP: 2 dk aralık, 5 deneme kilidi, tek kullanım
 * - `token_version` uyumsuzluğunda 401
 * - Yetki matrisi: requireAuth (401/200) + adminOnly (403) — her rol
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Router } from 'express';
import { createApp } from './app.js';
import { errorHandler } from './errors.js';
import { db } from './db/index.js';
import { requireAuth } from './middleware/auth.js';
import { adminOnly } from './middleware/adminOnly.js';
import { signToken } from './utils/token.js';
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

const USERS = {
  admin: { email: 'admin@test.local', password: TEST_PASSWORD },
  teacher: { email: 'teacher@test.local', password: TEST_PASSWORD },
};

beforeAll(() => {
  resetDb();
  insertTestUsers();
});

beforeEach(() => {
  clearRateLimits();
  // OTP 2 dk rate limiti DB'de (last_sent_at) tutulur — testler izole olsun.
  db.exec('DELETE FROM otp_codes');
});

afterEach(() => {
  vi.useRealTimers();
});

function latestOtpCode(userId: string): string {
  const row = db
    .prepare(
      `SELECT code FROM otp_codes WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(userId) as { code: string } | undefined;
  if (!row) throw new Error('OTP kaydı yok');
  return row.code;
}

describe('POST /api/v1/auth/login', () => {
  it('admin e-posta + şifre ile giriş yapar ve JWT + user döner', async () => {
    const res = await request(app).post('/api/v1/auth/login').send(USERS.admin);
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
    const res = await request(app).post('/api/v1/auth/login').send(USERS.teacher);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('teacher');
  });

  it('yanlış şifre 401 UNAUTHORIZED döner', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.local', password: 'yanlis' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('E-posta veya şifre hatalı.');
  });

  it('olmayan e-posta aynı hata mesajını döner (hesap sızıntısı yok)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'yok@test.local', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('E-posta veya şifre hatalı.');
  });

  it('veli/öğrenci (password_hash yok) e-posta+şifre ile giremez', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'guardian@test.local', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('geçersiz body 400 VALIDATION_ERROR döner', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'gecersiz-email', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toBeDefined();
  });

  it('brute-force: 5 başarısız denemeden sonra 429 RATE_LIMITED döner', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@test.local', password: 'yanlis' });
      expect(res.status).toBe(401);
    }
    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.local', password: 'yanlis' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('POST /api/v1/auth/otp/request', () => {
  it('kayıtlı telefona kod gönderir (200 + mesaj)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+905009990003' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Giriş kodu gönderildi.');
  });

  it('2 dakika içinde ikinci istek 429 döner', async () => {
    await request(app).post('/api/v1/auth/otp/request').send({ phone: '+905009990004' });
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+905009990004' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('kayıtsız telefon 404 döner', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+905009990099' });
    expect(res.status).toBe(404);
  });

  it('yeni kod isteği eski kullanılmamış kodu geçersiz kılar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });

    await request(app).post('/api/v1/auth/otp/request').send({ phone: '+905009990003' });
    const firstCode = latestOtpCode('test-guardian');

    vi.advanceTimersByTime(2 * 60 * 1000 + 1);
    await request(app).post('/api/v1/auth/otp/request').send({ phone: '+905009990003' });
    const secondCode = latestOtpCode('test-guardian');

    expect(secondCode).not.toBe(firstCode);

    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+905009990003', code: firstCode });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/otp/verify', () => {
  it('veli doğru kodla giriş yapar ve JWT döner', async () => {
    await request(app).post('/api/v1/auth/otp/request').send({ phone: '+905009990003' });
    const code = latestOtpCode('test-guardian');

    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+905009990003', code });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toMatchObject({ id: 'test-guardian', role: 'guardian' });
  });

  it('öğrenci doğru kodla giriş yapar', async () => {
    await request(app).post('/api/v1/auth/otp/request').send({ phone: '+905009990004' });
    const code = latestOtpCode('test-student');

    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+905009990004', code });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('student');
  });

  it('yanlış kod 401 döner; aynı kod tekrar kullanılamaz (tek kullanımlık)', async () => {
    await request(app).post('/api/v1/auth/otp/request').send({ phone: '+905009990004' });
    const code = latestOtpCode('test-student');

    const first = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+905009990004', code });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+905009990004', code });
    expect(second.status).toBe(401);
  });

  it('5 hatalı deneme sonrası OTP kilitlenir; doğru kod bile 401 döner', async () => {
    await request(app).post('/api/v1/auth/otp/request').send({ phone: '+905009990003' });
    const code = latestOtpCode('test-guardian');

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '+905009990003', code: '000000' });
      expect(res.status).toBe(401);
      // 5. denemede OTP geçersiz kılınır — kullanıcıya yeni kod iste denir.
      if (i === 4) {
        expect(res.body.error.message).toContain('yeni kod isteyin');
      }
    }

    const last = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+905009990003', code });
    expect(last.status).toBe(401);
  });

  it('süresi dolan kod 401 expired mesajı döner', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });

    await request(app).post('/api/v1/auth/otp/request').send({ phone: '+905009990004' });
    const code = latestOtpCode('test-student');

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+905009990004', code });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain('süresi doldu');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('token yokken 401 UNAUTHORIZED döner', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('4 rolün geçerli tokenı ile 200 döner', async () => {
    const logins: Array<[string, string]> = [
      ['admin@test.local', TEST_PASSWORD],
      ['teacher@test.local', TEST_PASSWORD],
    ];
    for (const [email, password] of logins) {
      const login = await request(app).post('/api/v1/auth/login').send({ email, password });
      const me = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${login.body.token}`);
      expect(me.status).toBe(200);
      expect(me.body.user.email).toBe(email);
    }

    // OTP ile: veli + öğrenci
    for (const phone of ['+905009990003', '+905009990004']) {
      await request(app).post('/api/v1/auth/otp/request').send({ phone });
      const code = latestOtpCode(
        phone === '+905009990003' ? 'test-guardian' : 'test-student',
      );
      const login = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ phone, code });
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
  async function tokenFor(email: string): Promise<string> {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
    return login.body.token as string;
  }

  it('token olmadan korumalı rota 401 döner', async () => {
    const res = await request(app).get('/api/v1/_test/authed');
    expect(res.status).toBe(401);
  });

  it('4 rol de requireAuth\'tan geçer (200)', async () => {
    const adminToken = await tokenFor('admin@test.local');
    const teacherToken = await tokenFor('teacher@test.local');

    const guardianLogin = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+905009990003' });
    void guardianLogin;
    const guardianCode = latestOtpCode('test-guardian');
    const guardian = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+905009990003', code: guardianCode });

    const studentLogin = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+905009990004' });
    void studentLogin;
    const studentCode = latestOtpCode('test-student');
    const student = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+905009990004', code: studentCode });

    const tokens = [adminToken, teacherToken, guardian.body.token, student.body.token];
    for (const token of tokens) {
      const res = await request(app)
        .get('/api/v1/_test/authed')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
  });

  it('adminOnly: yalnızca admin 200; diğer 3 rol 403 FORBIDDEN', async () => {
    const adminToken = await tokenFor('admin@test.local');
    const adminRes = await request(app)
      .get('/api/v1/_test/admin-only')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.role).toBe('admin');

    const teacherToken = await tokenFor('teacher@test.local');
    const teacherRes = await request(app)
      .get('/api/v1/_test/admin-only')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(teacherRes.status).toBe(403);
    expect(teacherRes.body.error.code).toBe('FORBIDDEN');

    const guardian = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+905009990003' });
    void guardian;
    const guardianCode = latestOtpCode('test-guardian');
    const guardianLogin = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+905009990003', code: guardianCode });
    const guardianRes = await request(app)
      .get('/api/v1/_test/admin-only')
      .set('Authorization', `Bearer ${guardianLogin.body.token}`);
    expect(guardianRes.status).toBe(403);

    const student = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+905009990004' });
    void student;
    const studentCode = latestOtpCode('test-student');
    const studentLogin = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+905009990004', code: studentCode });
    const studentRes = await request(app)
      .get('/api/v1/_test/admin-only')
      .set('Authorization', `Bearer ${studentLogin.body.token}`);
    expect(studentRes.status).toBe(403);
  });
});
