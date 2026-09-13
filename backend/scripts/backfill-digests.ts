/**
 * Digest telafi CLI — `npm run digest-backfill`.
 *
 * Belirli bir sınıf+hafta için, rapora fiilen yazılmış (puanlanmış) ama
 * `enrollments.start_date` hafta başından sonra olduğu için digest'i hiç
 * açılmamış öğrencilere `weekly_digests` satırı ekler. Mevcut satırlara
 * dokunmaz (idempotent). Kalıcı ürün akışı değil, tek seferlik geçiş aracıdır
 * (bkz. services/digestBackfill.ts).
 *
 * Güvenlik:
 * - Varsayılan **dry-run**: hiçbir şey yazılmaz, yalnızca önizleme.
 * - Gerçek yazma `--execute` ister; önce tam yedek (`createBackup`) alınır.
 *
 * Örnekler:
 *   npm run digest-backfill --prefix backend -- --class FİBONACCİ
 *   npm run digest-backfill --prefix backend -- --class FİBONACCİ --week 2026-09-12
 *   npm run digest-backfill --prefix backend -- --class FİBONACCİ --week 21 --execute
 */

import { loadEnv } from '../src/utils/env.js';
import { runBackfill, type BackfillResult } from '../src/services/digestBackfill.js';

loadEnv();

function usage(): void {
  console.log(`Digest telafi (tek seferlik geçiş aracı)

Kullanım:
  npm run digest-backfill --prefix backend -- --class <ad> [--week <no|YYYY-MM-DD>|--week-id <id>] [--dry-run|--execute]

Argümanlar:
  --class <ad|id>       Zorunlu. Aktif eğitim yılındaki sınıf (ad normalize edilir)
  --week <no>           week_no (sınıfın eğitim yılında)
  --week <YYYY-MM-DD>   Tarihi kapsayan hafta
  --week-id <id>        Doğrudan weeks.id
                        (week verilmezse aktif yılın "şu anki" haftası)

Mod:
  --dry-run   (varsayılan) Yalnızca ne yazılacağını gösterir
  --execute   Önce tam yedek alır, sonra gerçekten yazar

Not: Bu araç yalnızca o sınıf+haftada rapora girmiş (puanlanmış) ve velisi
olan öğrencilere digest açar; velisi olmayanlar atlanır ve listelenir.`);
}

interface ParsedArgs {
  className: string;
  weekNo?: number;
  weekStartDate?: string;
  weekId?: string;
  execute: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  let className: string | undefined;
  let weekNo: number | undefined;
  let weekStartDate: string | undefined;
  let weekId: string | undefined;
  let execute = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inlineValue = eq === -1 ? undefined : arg.slice(eq + 1);

    const readValue = (): string => {
      if (inlineValue !== undefined) return inlineValue;
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
      case '--class':
        className = readValue();
        break;
      case '--week': {
        const value = readValue();
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          weekStartDate = value;
        } else {
          const n = Number(value);
          if (!Number.isInteger(n) || n < 1) {
            throw new Error('--week bir week_no (tam sayı) ya da YYYY-MM-DD tarih olmalı.');
          }
          weekNo = n;
        }
        break;
      }
      case '--week-id':
        weekId = readValue();
        break;
      default:
        throw new Error(
          `Bilinmeyen argüman: ${name}\n\nAyrıntılı kullanım için: ` +
            `npm run digest-backfill --prefix backend -- --help`,
        );
    }
  }

  if (!className) {
    throw new Error(
      '--class zorunludur.\n\nAyrıntılı kullanım için: ' +
        'npm run digest-backfill --prefix backend -- --help',
    );
  }
  return { className, weekNo, weekStartDate, weekId, execute };
}

function printResult(result: BackfillResult): void {
  console.log('');
  console.log('=== Digest telafi ===');
  console.log(`Sınıf:            ${result.className} (${result.classId})`);
  console.log(`Hafta:            ${result.weekNo} · ${result.weekLabel} (${result.weekId})`);
  console.log(`Puanlanmış öğrenci: ${result.items.length + result.skippedNoGuardian.length}`);
  console.log(`Yazılacak digest:  ${result.insertCount} (zaten var olan: ${result.items.length - result.insertCount})`);
  if (result.skippedNoGuardian.length > 0) {
    console.log(`Veli yok (atlandı): ${result.skippedNoGuardian.length}`);
    for (const s of result.skippedNoGuardian) {
      console.log(`  - ${s.studentName}`);
    }
  }
  if (result.items.length > 0) {
    console.log('');
    console.log('Satırlar:');
    for (const it of result.items) {
      const mark = it.alreadyExists ? 'VAR (dokunulmaz)' : `YAZILACAK → ${it.status}`;
      console.log(`  - ${it.studentName}: ${mark}`);
    }
  }

  if (!result.executed) {
    console.log('');
    console.log('DRY-RUN — hiçbir satır yazılmadı.');
    console.log('Gerçek yazma için komuta --execute ekleyin.');
    return;
  }

  console.log('');
  console.log(`Yedek:            ${result.backupPath ?? '(yedek alınmadı — yazılacak satır yoktu)'}`);
  console.log(`Yazılan satır:    ${result.inserted}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = runBackfill(
    {
      className: args.className,
      weekNo: args.weekNo,
      weekStartDate: args.weekStartDate,
      weekId: args.weekId,
    },
    { execute: args.execute },
  );
  printResult(result);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
