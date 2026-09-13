/**
 * Tek seferlik SALT-OKUNUR teşhis — `npm run diagnose-digest`.
 *
 * Belirli bir hafta ve öğrenci(listesi) için `weekly_digests.class_id` neden
 * boş/yanlış olabilir sorusunu yanıtlar. **Hiçbir yazma yapmaz** (yalnızca
 * SELECT). Render Shell'de çalıştırılıp çıktısı incelenmek üzere tasarlandı;
 * kalıcı ürün akışının parçası değildir.
 *
 * Örnek:
 *   npm run diagnose-digest --prefix backend -- \
 *     --week-id dfd5747b-2217-40fe-aa90-5c61d2b01225 \
 *     --student "Ahmet Akif BİLİCİOĞLU,Emir Taha Ekinözü"
 */

import { loadEnv } from '../src/utils/env.js';
import { db } from '../src/db/index.js';
import { normalizeTurkish } from '../src/utils/text.js';
import { classIdForStudentAtWeek } from '../src/services/digests.js';
import type { WeekRecord } from '../src/utils/weeks.js';

loadEnv();

function usage(): void {
  console.log(`Digest teşhisi (salt-okunur — hiçbir şey yazmaz)

Kullanım:
  npm run diagnose-digest --prefix backend -- --week-id <id> --student "Ad1,Ad2"

Argümanlar:
  --week-id <id>     Zorunlu. weeks.id
  --student "a,b"    Zorunlu. Virgülle ayrılmış tam ad(lar) (tam ad veya
                     normalize edilmiş ad ile eşleşir)

Çıktı: her öğrenci için weekly_digests (class_id/status/week_id), enrollments
(class_id/start_date/end_date + hafta başına göre aktif mi) ve class_id NULL ise
classIdForStudentAtWeek() manuel sonucu.`);
}

interface Parsed {
  weekId: string;
  students: string[];
}

function parseArgs(argv: string[]): Parsed {
  let weekId: string | undefined;
  let studentRaw: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);
    const readValue = (): string => {
      if (inline !== undefined) return inline;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`${name} için bir değer gerekli.`);
      }
      i += 1;
      return next;
    };

    switch (name) {
      case '--help':
      case '-h':
        usage();
        process.exit(0);
        break;
      case '--week-id':
        weekId = readValue();
        break;
      case '--student':
        studentRaw = readValue();
        break;
      default:
        throw new Error(`Bilinmeyen argüman: ${name}\n\n${usageHelp()}`);
    }
  }

  if (!weekId) throw new Error(`--week-id zorunludur.\n\n${usageHelp()}`);
  if (!studentRaw) throw new Error(`--student zorunludur.\n\n${usageHelp()}`);

  const students = studentRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (students.length === 0) throw new Error(`--student en az bir ad içermeli.`);

  return { weekId, students };
}

function usageHelp(): string {
  return 'Ayrıntılı kullanım için: npm run diagnose-digest --prefix backend -- --help';
}

const fmt = (v: unknown): string => (v === null || v === undefined ? 'NULL' : String(v));

interface StudentRow {
  student_id: string;
  user_id: string;
  full_name: string;
}

interface EnrollmentRow {
  id: string;
  class_id: string;
  class_name: string | null;
  start_date: string;
  end_date: string | null;
}

try {
  const { weekId, students: names } = parseArgs(process.argv.slice(2));

  const week = db.prepare(`SELECT * FROM weeks WHERE id = ?`).get(weekId) as
    | WeekRecord
    | undefined;
  if (!week) {
    throw new Error(`Hafta bulunamadı: ${weekId}`);
  }

  console.log('=== diagnose-digest (SALT-OKUNUR) ===');

  // Migration #11 uygulanmamışsa `class_id` kolonu yoktur; sorguyu ona göre kur
  // (script patlamasın, durumu açıkça söylesin).
  const digestCols = (
    db.prepare(`PRAGMA table_info('weekly_digests')`).all() as Array<{ name: string }>
  ).map((c) => c.name);
  const hasClassId = digestCols.includes('class_id');
  const classIdExpr = hasClassId ? 'class_id' : 'NULL AS class_id';
  if (!hasClassId) {
    console.log(
      'UYARI: weekly_digests.class_id kolonu YOK (migration #11 uygulanmamış) — ' +
        'class_id bu çıktıda daima NULL görünür.',
    );
  }

  console.log(
    `Hafta: id=${week.id} week_no=${week.week_no} start=${week.start_date} ` +
      `end=${week.end_date} label="${week.label}"`,
  );
  console.log(`Aranan öğrenci(ler): ${names.join(' | ')}`);
  console.log('');

  for (const rawName of names) {
    const normalized = normalizeTurkish(rawName);
    const found = db
      .prepare(
        `SELECT s.id AS student_id, u.id AS user_id, u.full_name
         FROM students s
         JOIN users u ON u.id = s.user_id
         WHERE u.role = 'student' AND u.deleted_at IS NULL AND s.deleted_at IS NULL
           AND (u.full_name = ? OR u.full_name_normalized = ?)
         ORDER BY u.full_name`,
      )
      .all(rawName, normalized) as unknown as StudentRow[];

    console.log(`--- Öğrenci: "${rawName}" ---`);
    if (found.length === 0) {
      console.log('  Eşleşen aktif öğrenci bulunamadı.');
      console.log('');
      continue;
    }

    for (const student of found) {
      console.log(`  full_name = ${student.full_name}`);
      console.log(`  users.id = ${student.user_id} | students.id = ${student.student_id}`);

      // 1) weekly_digests kaydı
      const digest = db
        .prepare(
          `SELECT id, ${classIdExpr}, status, week_id, guardian_id, send_count, is_revoked
           FROM weekly_digests
           WHERE student_id = ? AND week_id = ?`,
        )
        .get(student.student_id, weekId) as
        | {
            id: string;
            class_id: string | null;
            status: string;
            week_id: string;
            guardian_id: string;
            send_count: number;
            is_revoked: number;
          }
        | undefined;

      console.log('  weekly_digests:');
      if (!digest) {
        console.log('    KAYIT YOK (bu öğrenci-hafta için digest satırı oluşmamış).');
      } else {
        let digestClassName: string | null = null;
        if (digest.class_id) {
          const c = db
            .prepare(`SELECT name FROM classes WHERE id = ?`)
            .get(digest.class_id) as { name: string } | undefined;
          digestClassName = c?.name ?? null;
        }
        console.log(`    id          = ${digest.id}`);
        console.log(
          `    class_id    = ${fmt(digest.class_id)}` +
            (digestClassName ? ` (${digestClassName})` : '') +
            `${digest.class_id === null ? '  ← NULL' : ''}`,
        );
        console.log(`    status      = ${digest.status}`);
        console.log(`    week_id     = ${digest.week_id}`);
        console.log(`    guardian_id = ${digest.guardian_id}`);
        console.log(`    send_count  = ${digest.send_count} | is_revoked = ${digest.is_revoked}`);
      }

      // 2) enrollments
      const enrollments = db
        .prepare(
          `SELECT e.id, e.class_id, c.name AS class_name, e.start_date, e.end_date
           FROM enrollments e
           LEFT JOIN classes c ON c.id = e.class_id
           WHERE e.student_id = ?
           ORDER BY e.start_date`,
        )
        .all(student.student_id) as unknown as EnrollmentRow[];

      console.log('  enrollments:');
      if (enrollments.length === 0) {
        console.log('    Kayıt yok.');
      }
      for (const e of enrollments) {
        const active =
          e.start_date <= week.start_date &&
          (e.end_date === null || e.end_date >= week.start_date);
        console.log(
          `    id=${e.id} class_id=${e.class_id}` +
            (e.class_name ? ` (${e.class_name})` : '') +
            ` start=${e.start_date} end=${fmt(e.end_date)}` +
            ` | hafta başına (${week.start_date}) göre aktif = ${active ? 'EVET' : 'HAYIR'}`,
        );
      }

      // 3) classIdForStudentAtWeek() — manuel çağrı (NULL nedenini netleştirir)
      const resolved = classIdForStudentAtWeek(student.student_id, week);
      let resolvedName: string | null = null;
      if (resolved) {
        const c = db
          .prepare(`SELECT name FROM classes WHERE id = ?`)
          .get(resolved) as { name: string } | undefined;
        resolvedName = c?.name ?? null;
      }
      console.log('  classIdForStudentAtWeek():');
      console.log(
        `    sonuç = ${fmt(resolved)}` +
          (resolvedName ? ` (${resolvedName})` : '') +
          (resolved === null
            ? '  ← NULL: hafta başında bu öğrenciyi kapsayan enrollment bulunamadı'
            : ''),
      );
      console.log('');
    }
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
