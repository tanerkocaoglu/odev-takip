/**
 * Admin — Haftalık ödev özeti (spec.md §5.8).
 *
 * Sınıf + hafta seçilir; o sınıfın o haftaki **tüm** derslerinin "yapılacak
 * ödev"i listelenir. Eksik ders satırı atlanmaz ("Rapor girilmedi"). Ekranda
 * görünen belge `html-to-image` ile PNG'ye çevrilip WhatsApp grubuna
 * paylaşılmak üzere indirilir (otomatik gönderim yoktur).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { ClipboardList, Download } from 'lucide-react';
import type { ClassItem, HomeworkSummary, Week } from '../../types';
import { adminApi, ApiClientError } from '../../services/api';
import HomeworkSummarySheet from '../../components/admin/HomeworkSummarySheet';
import {
  EmptyState,
  FilterSelect,
  FormError,
  LoadingState,
  PageTitle,
  PrimaryButton,
} from '../../components/admin/ui';

/** Yıl başlamadıysa en erken haftaya, aksi hâlde "şu anki" haftaya düşer. */
function defaultWeekId(weeks: Week[]): string {
  if (weeks.length === 0) return '';
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  const current = [...weeks].reverse().find((w) => w.start_date <= todayISO);
  return (current ?? weeks[0]).id;
}

/** Dosya adı için Türkçe karakterleri ASCII'ye indirger. */
function fileSlug(name: string): string {
  return name
    .toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function HomeworkSummaryPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [classId, setClassId] = useState('');
  const [weekId, setWeekId] = useState('');

  const [summary, setSummary] = useState<HomeworkSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Referans veriler: aktif eğitim yılı → sınıflar + haftalar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const years = await adminApi.academicYears.list();
        const active = years.items.find((y) => y.is_active === 1) ?? years.items[0];
        if (!active) return;
        const [classRes, weekRes] = await Promise.all([
          adminApi.classes.list({ academicYearId: active.id }),
          adminApi.weeks.list(active.id),
        ]);
        if (cancelled) return;
        const sortedWeeks = [...weekRes.items].sort((a, b) => a.week_no - b.week_no);
        setClasses(classRes.items);
        setWeeks(sortedWeeks);
        setClassId((prev) => prev || classRes.items[0]?.id || '');
        setWeekId((prev) => prev || defaultWeekId(sortedWeeks));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Seçim değişince özeti yükle.
  useEffect(() => {
    if (!classId || !weekId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminApi
      .homeworkSummary({ class_id: classId, week_id: weekId })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
          setSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, weekId]);

  const handleDownload = useCallback(async () => {
    if (!sheetRef.current || !summary) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      // Web font yüklenmeden yakalanırsa metin yedek fontla render edilir.
      if (typeof document !== 'undefined' && document.fonts) {
        await document.fonts.ready;
      }
      const blob = await toBlob(sheetRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff',
      });
      if (!blob) throw new Error('Görsel oluşturulamadı.');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileSlug(summary.class.name)}-${summary.relative_week_no}-hafta-odevleri.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError('Görsel oluşturulamadı, lütfen tekrar deneyin.');
    } finally {
      setDownloading(false);
    }
  }, [summary]);

  const missingCount = summary?.rows.filter((r) => r.status === 'missing').length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <PageTitle icon={ClipboardList}>Haftalık ödev özeti</PageTitle>
        <p className="text-sm text-muted">
          Sınıf ve hafta seçin; veli WhatsApp grubuna paylaşılacak görseli indirin.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <FilterSelect label="Sınıf" value={classId} onChange={setClassId}>
          {classes.length === 0 && <option value="">Sınıf yok</option>}
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect label="Hafta" value={weekId} onChange={setWeekId}>
          {weeks.length === 0 && <option value="">Hafta yok</option>}
          {weeks.map((w) => (
            <option key={w.id} value={w.id}>
              {w.week_no}. hafta · {w.label}
            </option>
          ))}
        </FilterSelect>

        <PrimaryButton
          onClick={() => void handleDownload()}
          disabled={!summary || downloading}
        >
          <span className="inline-flex items-center gap-2">
            <Download size={16} aria-hidden="true" />
            {downloading ? 'Görsel hazırlanıyor…' : 'PNG olarak indir'}
          </span>
        </PrimaryButton>
      </div>

      <FormError message={error} />
      <FormError message={downloadError} />

      {summary && missingCount > 0 && (
        <p className="text-sm text-muted">
          {missingCount} dersin raporu girilmedi; bu satırlar görselde "Rapor girilmedi"
          olarak işaretlenir.
        </p>
      )}

      {loading ? (
        <LoadingState />
      ) : !summary ? (
        <EmptyState message="Görüntülemek için bir sınıf ve hafta seçin." />
      ) : (
        <div className="overflow-x-auto pb-2">
          <div ref={sheetRef} className="inline-block">
            <HomeworkSummarySheet summary={summary} />
          </div>
        </div>
      )}
    </div>
  );
}
