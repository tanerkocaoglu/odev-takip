/**
 * Teslim dosyası temizliği CLI — `npm run cleanup-submissions`.
 *
 * Render Shell'den **admin tarafından elle** çalıştırılan ara dönem bakım
 * komutu. spec.md §8'deki 1 yıllık **otomatik** saklama politikası Aşama 6'ya
 * bırakılmıştır; bu araç o politikanın yerine geçmez.
 *
 * Güvenlik:
 * - Filtresiz çalışmaz; tümünü hedeflemek için `--all`.
 * - Varsayılan **dry-run**: hiçbir şey silinmez, yalnızca önizleme.
 * - Gerçek silme `--execute` ister; önce tam yedek (`db:backup` çekirdeği)
 *   alınır, sonra DB + disk tutarlı biçimde temizlenir.
 *
 * Örnekler:
 *   npm run cleanup-submissions --prefix backend
 *   npm run cleanup-submissions --prefix backend -- --before 2026-01-01
 *   npm run cleanup-submissions --prefix backend -- --student ornekkisi81
 *   npm run cleanup-submissions --prefix backend -- --class ÖKLİD --week 5 --execute
 *   npm run cleanup-submissions --prefix backend -- --all --execute
 */

import { loadEnv } from '../src/utils/env.js';
import {
  runCleanup,
  type CleanupFilters,
  type CleanupResult,
} from '../src/services/submissionCleanup.js';

loadEnv();

function usage(): void {
  console.log(`Teslim dosyası temizliği (manuel bakım komutu)

Kullanım:
  npm run cleanup-submissions --prefix backend [filtre...] [--dry-run|--execute]

Filtreler (en az biri zorunlu):
  --before <YYYY-MM-DD>   Bu tarihten önce teslim edilenler
  --after <YYYY-MM-DD>    Bu tarih ve sonrasında teslim edilenler
  --student <username|id> Belirli öğrenci
  --class <ad|id>         Belirli sınıf (ad normalize edilir)
  --week <no>             Belirli hafta numarası
  --homework <id>         Belirli ödev
  --key <key>             Tek dosya anahtarı
  --all                   Tüm teslim dosyaları (diğer filtrelerle birlikte kullanılmaz)

Mod:
  --dry-run   (varsayılan) Yalnızca ne silineceğini gösterir
  --execute   Önce tam yedek alır, sonra gerçekten siler

Not: Bu komut teslim ve ödev/rapor kayıtlarını silmez; yalnızca dosyaları ve
dosya kayıtlarını kaldırır, boşalan teslimlere files_purged_at yazar.`);
}

interface ParsedArgs {
  filters: CleanupFilters;
  execute: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const filters: CleanupFilters = {};
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
      case '--all':
        filters.all = true;
        break;
      case '--before':
        filters.before = readValue();
        break;
      case '--after':
        filters.after = readValue();
        break;
      case '--student':
        filters.student = readValue();
        break;
      case '--class':
        filters.className = readValue();
        break;
      case '--week': {
        const value = Number(readValue());
        if (!Number.isInteger(value)) throw new Error('--week pozitif bir tam sayı olmalı.');
        filters.weekNo = value;
        break;
      }
      case '--homework':
        filters.homeworkId = readValue();
        break;
      case '--key':
        filters.key = readValue();
        break;
      default:
        throw new Error(`Bilinmeyen argüman: ${name}\n\n${usageHelp()}`);
    }
  }

  return { filters, execute };
}

/** `--help` metnini tek bir dize olarak döndürür (hata mesajı sonuna eklemek için). */
function usageHelp(): string {
  return 'Ayrıntılı kullanım için: npm run cleanup-submissions --prefix backend -- --help';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function printResult(result: CleanupResult): void {
  console.log('');
  console.log('=== Teslim dosyası temizliği ===');
  console.log(`Filtre:          ${JSON.stringify(result.filters)}`);
  console.log(`Dosya (seçili):  ${result.fileCount}`);
  console.log(`Teslim (etkilenen): ${result.submissionCount}`);
  console.log(`Toplam boyut:    ${formatBytes(result.totalBytes)}`);
  console.log(`Diskte mevcut:   ${result.existingOnDisk}  (eksik: ${result.missingOnDisk})`);
  if (result.remoteObjects > 0) {
    console.log(`R2 nesnesi:      ${result.remoteObjects} (varlık kontrolü yapılmaz)`);
  }
  if (result.invalidKeys > 0) {
    console.log(`Geçersiz key:    ${result.invalidKeys} (atlandı)`);
  }
  console.log(`files_purged_at işaretlenecek teslim: ${result.fullyPurgedSubmissions.length}`);

  if (result.files.length > 0) {
    console.log('');
    console.log('İlk dosyalar:');
    for (const file of result.files.slice(0, 20)) {
      console.log(
        `  - ${file.studentName} · ${file.className}/${file.courseName} · ` +
          `Hafta ${file.weekNo} · ${file.filename} (${file.key})`,
      );
    }
    if (result.files.length > 20) {
      console.log(`  … ve ${result.files.length - 20} dosya daha`);
    }
  }

  if (!result.executed) {
    console.log('');
    console.log('DRY-RUN — hiçbir dosya veya kayıt silinmedi.');
    console.log('Gerçek silme için komuta --execute ekleyin.');
    return;
  }

  console.log('');
  console.log(`Yedek:           ${result.backupPath ?? '(yedek alınmadı — silinecek dosya yoktu)'}`);
  console.log(`Silinen DB satırı:   ${result.deletedFileRows}`);
  console.log(`Silinen nesne (yerel+R2): ${result.deletedObjects}`);
  console.log(`files_purged_at yazılan teslim: ${result.purgedSubmissions}`);
  if (result.deleteErrors.length > 0) {
    console.log('');
    console.log(`UYARI: ${result.deleteErrors.length} nesne silinemedi:`);
    for (const err of result.deleteErrors) {
      console.log(`  - ${err.key}: ${err.message}`);
    }
    console.log('DB kayıtları silindi; bu nesneler öksüz kaldı (yedekte mevcuttur).');
  }
}

try {
  const { filters, execute } = parseArgs(process.argv.slice(2));
  const result = await runCleanup(filters, { execute });
  printResult(result);
  if (result.executed && result.deleteErrors.length > 0) {
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
