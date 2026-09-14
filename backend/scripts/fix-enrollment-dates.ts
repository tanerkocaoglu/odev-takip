/**
 * Tek seferlik enrollment tarih onarımı CLI — `npm run fix-enrollment-dates`.
 *
 * Yalnızca verilen `enrollments.id`'lerin `start_date`'ini düzeltir; ardından
 * bu öğrencilerin `class_id` NULL olan `weekly_digests` satırlarını
 * `classIdForStudentAtWeek()` ile onarır.
 *
 * Güvenlik: varsayılan **dry-run**; gerçek yazma `--execute` ister ve önce tam
 * yedek (`createBackup`) alır.
 *
 * Örnek:
 *   npm run fix-enrollment-dates -- \
 *     --enrollment 05ec2ecd-77cb-4ec0-aab2-6ec148a7aa44 \
 *     --enrollment eab7c557-687b-4439-940f-eb300b667e62 \
 *     --start-date 2026-09-12
 */

import { loadEnv } from '../src/utils/env.js';
import {
  planEnrollmentDateFix,
  runEnrollmentDateFix,
  type EnrollmentFixResult,
} from '../src/services/enrollmentDateFix.js';

loadEnv();

function usage(): void {
  console.log(`Enrollment tarih onarımı (tek seferlik, dar kapsamlı)

Kullanım:
  npm run fix-enrollment-dates -- --enrollment <id>[,<id>...] --start-date <YYYY-MM-DD> [--dry-run|--execute]

Argümanlar:
  --enrollment <id>     Zorunlu. Tekrarlanabilir veya virgülle ayrılmış liste.
  --start-date <tarih>  Zorunlu. Yeni start_date (YYYY-MM-DD).

Mod:
  --dry-run   (varsayılan) Yalnızca ne değişeceğini gösterir
  --execute   Önce tam yedek alır, sonra yazar

Yalnızca verilen enrollment satırlarına ve o öğrencilerin class_id NULL olan
digest satırlarına dokunur.`);
}

interface Parsed {
  enrollmentIds: string[];
  startDate: string;
  execute: boolean;
}

function parseArgs(argv: string[]): Parsed {
  const enrollmentIds: string[] = [];
  let startDate: string | undefined;
  let execute = false;

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
      case '--execute':
      case '--yes':
        execute = true;
        break;
      case '--dry-run':
        execute = false;
        break;
      case '--enrollment':
        enrollmentIds.push(...readValue().split(',').map((s) => s.trim()).filter(Boolean));
        break;
      case '--start-date':
        startDate = readValue();
        break;
      default:
        throw new Error(
          `Bilinmeyen argüman: ${name}\n\nAyrıntılı kullanım için: ` +
            `npm run fix-enrollment-dates -- --help`,
        );
    }
  }

  if (enrollmentIds.length === 0) {
    throw new Error(
      '--enrollment gerekli.\n\nAyrıntılı kullanım için: ' +
        'npm run fix-enrollment-dates -- --help',
    );
  }
  if (!startDate) {
    throw new Error(
      '--start-date gerekli.\n\nAyrıntılı kullanım için: ' +
        'npm run fix-enrollment-dates -- --help',
    );
  }
  return { enrollmentIds, startDate, execute };
}

function printResult(result: EnrollmentFixResult): void {
  console.log('');
  console.log('=== Enrollment tarih onarımı ===');
  console.log(`Yeni start_date: ${result.newStartDate}`);
  console.log('');
  console.log('Enrollment satırları:');
  for (const e of result.enrollments) {
    const mark = e.changed ? `${e.oldStartDate} → ${e.newStartDate}` : `${e.oldStartDate} (değişiklik yok)`;
    console.log(`  - ${e.studentName} · ${e.className} · ${e.enrollmentId}: ${mark}`);
  }
  console.log('');
  console.log(`class_id NULL digest satırları (hedeflenen): ${result.digests.length}`);
  for (const d of result.digests) {
    const mark = d.willUpdate
      ? `DOLDURULACAK → ${d.resolvedClassId}`
      : 'çözülemedi (dokunulmaz)';
    console.log(`  - Hafta ${d.weekNo} (${d.weekStart}) digest=${d.digestId}: ${mark}`);
  }

  if (!result.executed) {
    console.log('');
    console.log('DRY-RUN — hiçbir satır güncellenmedi.');
    console.log('Gerçek yazma için komuta --execute ekleyin.');
    return;
  }

  console.log('');
  console.log(`Yedek:            ${result.backupPath ?? '(yedek alınmadı — değişiklik yoktu)'}`);
  console.log(`Güncellenen enrollment: ${result.enrollmentUpdated}`);
  console.log(`Onarılan digest:        ${result.digestUpdated}`);
}

try {
  const { enrollmentIds, startDate, execute } = parseArgs(process.argv.slice(2));
  // Dry-run planı (execute'da da aynı planı göstermek için önceden hesaplanır).
  const result = execute
    ? runEnrollmentDateFix(enrollmentIds, startDate, { execute: true })
    : { ...planEnrollmentDateFix(enrollmentIds, startDate), executed: false, backupPath: null, enrollmentUpdated: 0, digestUpdated: 0 };
  printResult(result as EnrollmentFixResult);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
