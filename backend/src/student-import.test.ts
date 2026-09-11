/**
 * Toplu öğrenci içe aktarma (CSV) entegrasyon testleri — spec.md §5.6.
 * Gerçek test.db üzerinde şema + aktif yıl + iki sınıf kurulur.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { normalizeTurkish } from './utils/text.js';
import { resetDb, insertTestUsers, TEST_PASSWORD } from './test/helpers.js';

const app = createApp();
let adminToken: string;

const HEADER =
  'ogrenci_adi,dershane_sinifi,veli_adi,veli_whatsapp,okul_adi,sinif_seviyesi';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\r\n') + '\r\n';
}

function importReq(csvText: string, dryRun: boolean, password = TEST_PASSWORD) {
  return request(app)
    .post(`/api/v1/admin/students/import?dry_run=${dryRun}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .field('password', password)
    .attach('file', Buffer.from(csvText, 'utf8'), {
      filename: 'ogrenciler.csv',
      contentType: 'text/csv',
    });
}

function countUsers(): number {
  return (
    db.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number }
  ).c;
}

function countOf(table: 'students' | 'guardians' | 'schools'): number {
  return (
    db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }
  ).c;
}

beforeAll(async () => {
  resetDb();
  insertTestUsers();
  db.prepare(
    `INSERT INTO academic_years (id, name, start_date, end_date, is_active)
     VALUES ('y1', '2026-2027', '2026-09-01', '2027-06-30', 1)`,
  ).run();
  for (const name of ['ÖKLİD', 'PİSAGOR']) {
    db.prepare(
      `INSERT INTO classes (id, academic_year_id, name, name_normalized, deleted_at)
       VALUES (?, 'y1', ?, ?, NULL)`,
    ).run(`c-${normalizeTurkish(name)}`, name, normalizeTurkish(name));
  }
  db.prepare(
    `INSERT INTO schools (id, name, name_normalized, deleted_at)
     VALUES ('sch-ataturk', 'Örnek Okul 1', 'ataturk ortaokulu', NULL)`,
  ).run();

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users
       (id, full_name, full_name_normalized, username, email, password_hash, role,
        is_active, token_version, deleted_at, created_at)
     VALUES ('g-mevcut', 'Mevcut Veli', 'mevcut veli', 'veli-mevcut', NULL, 'x', 'guardian', 1, 1, NULL, ?)`,
  ).run(now);
  db.prepare(
    `INSERT INTO guardians (id, user_id, whatsapp_phone, phone_secondary, consent_at, deleted_at)
     VALUES ('g-mevcut-rec', 'g-mevcut', '+905550001111', NULL, NULL, NULL)`,
  ).run();

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier: 'admin@test.local', password: TEST_PASSWORD });
  adminToken = login.body.token as string;
});

describe('GET /admin/students/import/template', () => {
  it('doğru başlıkları ve UTF-8 BOM döner', async () => {
    const res = await request(app)
      .get('/api/v1/admin/students/import/template')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const text = res.text;
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain('ogrenci_adi,dershane_sinifi,veli_adi,veli_whatsapp');
  });
});

describe('Önizleme (dry_run)', () => {
  it('kardeş satırlarını tek velide birleştirir, yazmaz', async () => {
    const before = countUsers();
    const res = await importReq(
      csv(
        'Ali Yılmaz,ÖKLİD,Örnek Kişi 5,+90 555 111 22 33,Örnek Okul 1,6',
        'Ayla Yılmaz,PİSAGOR,Örnek Kişi 5,+90 555 111 22 33,,',
      ),
      true,
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.committed).toBe(false);
    expect(res.body.summary).toMatchObject({
      new_students: 2,
      new_guardians: 1,
      new_schools: 0,
      matched_schools: 1,
    });
    expect(countUsers()).toBe(before);
  });

  it('okul adı normalize eşleşir, yeni okul açmaz', async () => {
    const res = await importReq(
      csv('Deniz,ÖKLİD,Veli,+90 555 222 33 44,ATATÜRK ORTAOKULU,7'),
      true,
    );
    expect(res.body.summary.new_schools).toBe(0);
    expect(res.body.summary.matched_schools).toBe(1);
  });

  it('geçersiz sınıf satır hatası verir (önizleme), hiçbir şey yazılmaz', async () => {
    const before = countUsers();
    const res = await importReq(
      csv(
        'Ege,ÖKLİD,Veli,+90 555 333 44 55,,',
        'Sude,OLMAYAN SINIF,Veli,+90 555 444 55 66,,',
      ),
      true,
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.committed).toBe(false);
    expect(res.body.errors[0]).toMatchObject({ row: 3, field: 'dershane_sinifi' });
    expect(countUsers()).toBe(before);
  });

  it('commit: hatalı CSV 400 döner ve hiçbir kayıt oluşturmaz (hepsi ya da hiçbiri)', async () => {
    const before = {
      users: countUsers(),
      students: countOf('students'),
      guardians: countOf('guardians'),
      schools: countOf('schools'),
    };
    const res = await importReq(
      csv(
        'Ege,ÖKLİD,Geçerli Veli,+90 555 333 44 55,Yeni Okul,6',
        'Sude,OLMAYAN SINIF,İkinci Veli,+90 555 444 55 66,,',
      ),
      false,
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.errors[0]).toMatchObject({
      row: 3,
      field: 'dershane_sinifi',
    });
    expect(countUsers()).toBe(before.users);
    expect(countOf('students')).toBe(before.students);
    expect(countOf('guardians')).toBe(before.guardians);
    expect(countOf('schools')).toBe(before.schools);
    const stray = db
      .prepare(`SELECT COUNT(*) AS c FROM users WHERE full_name IN ('Ege', 'Sude')`)
      .get() as { c: number };
    expect(stray.c).toBe(0);
  });

  it('mevcut veli adı farklıysa uyarı üretir', async () => {
    const res = await importReq(
      csv('Kerem,ÖKLİD,Bambaşka Ad,+90 555 000 11 11,,'),
      true,
    );
    expect(res.body.warnings.length).toBeGreaterThan(0);
    expect(res.body.warnings[0].field).toBe('veli_adi');
  });

  it('zorunlu başlık eksikse 400', async () => {
    const res = await importReq('ogrenci_adi,veli_adi\r\nAli,Veli\r\n', true);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('başlıkları eksik');
  });
});

describe('Kaydetme (commit)', () => {
  it('kardeşleri tek velide birleştirip hepsini tek transaction yazar', async () => {
    const res = await importReq(
      csv(
        'Ali Yılmaz,ÖKLİD,Örnek Kişi 5,+90 555 111 22 33,Örnek Okul 1,6',
        'Ayla Yılmaz,PİSAGOR,Örnek Kişi 5,+90 555 111 22 33,,',
      ),
      false,
    );
    expect(res.status).toBe(201);
    expect(res.body.committed).toBe(true);
    expect(res.body.created).toMatchObject({
      created_students: 2,
      created_guardians: 1,
      created_schools: 0,
    });

    const guardians = db
      .prepare(
        `SELECT COUNT(*) AS c FROM guardians
         WHERE whatsapp_phone = '+905551112233' AND deleted_at IS NULL`,
      )
      .get() as { c: number };
    expect(guardians.c).toBe(1);

    const rows = db
      .prepare(
        `SELECT u.username, u.role, e.class_id
         FROM users u
         JOIN students s ON s.user_id = u.id
         JOIN enrollments e ON e.student_id = s.id AND e.end_date IS NULL
         WHERE u.full_name IN ('Ali Yılmaz', 'Ayla Yılmaz')
         ORDER BY u.full_name`,
      )
      .all() as Array<{ username: string; role: string; class_id: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].role).toBe('student');
    expect(rows[0].class_id).toBe('c-oklid');
    expect(rows[1].class_id).toBe('c-pisagor');
    expect(rows.map((r) => r.username)).toEqual(['aliyilmaz1', 'aylayilmaz1']);

    // İçe aktarmayla gelen tüm yeni kullanıcılar ilk girişte şifre değiştirir.
    const flags = db
      .prepare(
        `SELECT must_change_password FROM users
         WHERE full_name IN ('Ali Yılmaz', 'Ayla Yılmaz', 'Örnek Kişi 5')`,
      )
      .all() as Array<{ must_change_password: number }>;
    expect(flags).toHaveLength(3);
    expect(flags.every((f) => f.must_change_password === 1)).toBe(true);

    const audit = db
      .prepare(`SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'student.import'`)
      .get() as { c: number };
    expect(audit.c).toBe(1);
  });

  it('aynı adlı iki öğrenciye artan sayaçlı kullanıcı adı üretir', async () => {
    const res = await importReq(
      csv(
        'Örnek Kişi 8,ÖKLİD,Nurten Yılmaz,+90 555 123 45 67,',
        'Örnek Kişi 8,PİSAGOR,Nurten Yılmaz,+90 555 123 45 67,',
      ),
      false,
    );
    expect(res.status).toBe(201);

    const rows = db
      .prepare(
        `SELECT u.username FROM users u
         WHERE u.full_name = 'Örnek Kişi 8' ORDER BY u.username`,
      )
      .all() as Array<{ username: string }>;
    expect(rows.map((r) => r.username)).toEqual(['ornekkisi81', 'ornekkisi82']);
  });

  it('başlangıç şifresi kısa ise 400 ve yazma yok', async () => {
    const before = countUsers();
    const res = await importReq(
      csv('Poyraz,ÖKLİD,Veli,+90 555 777 88 99,,'),
      false,
      'kisa',
    );
    expect(res.status).toBe(400);
    expect(res.body.error.fields.password).toBeDefined();
    expect(countUsers()).toBe(before);
  });
});
