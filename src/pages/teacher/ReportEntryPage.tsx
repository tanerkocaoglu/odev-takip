/**
 * Toplu rapor giriş ekranı — projenin kalbi (spec.md §6.1).
 * Üstte sınıf düzeyi alanlar (verilmiş ödev, konu, yapılacak ödev, son tarih),
 * altta satır = öğrenci tablosu. Klavye navigasyonu (Enter/ok tuşları),
 * otomatik kaydetme (debounce ~2 sn), dar ekranda kart görünümü.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ListChecks } from 'lucide-react';
import type {
  Attendance,
  HomeworkAttachment,
  ReportEntry,
  ReportSaveInput,
  TeacherReportPayload,
} from '../../types';
import { ATTENDANCE_LABELS, DAY_LABELS } from '../../types';
import { teacherApi, openProtectedFile, ApiClientError } from '../../services/api';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  FormError,
  InlineNotice,
  Input,
  LoadingState,
  cx,
  textareaClass,
  useToast,
} from '../../components/ui';
import HomeworkAttachments from '../../components/HomeworkAttachments';
import SaveStatus, { SaveAnnouncer, type SaveState } from '../../components/SaveStatus';
import { useKeyboardOpen } from '../../hooks/useKeyboardOpen';
import ScoreRadioGroup from '../../components/ScoreRadioGroup';

/** Tablo hücresi kontrolü (compact: 32px — `.compact` kuralı yüksekliği sabitler). */
const cellClass =
  'h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px] text-text placeholder:text-muted focus:border-accent disabled:bg-subtle disabled:text-muted';
/** Puan hücresi: ortalı, iğne oklar gizli (ok tuşları satır/hücre gezinmesine ayrılmıştır). */
const scoreCellClass =
  cellClass +
  ' tabular text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/** Mobil kart kontrolü (comfortable: 44px, 16px yazı — global kural). */
const mobileControlClass =
  'h-11 rounded-md border border-border bg-surface px-3 text-sm text-text focus:border-accent disabled:bg-subtle disabled:text-muted';

/** Devamsızlık seçicisinin renk ipucu — renk yanında seçili metin de görünür. */
const ATTENDANCE_CELL_TONE: Record<Attendance, string> = {
  present: '',
  late: 'border-warning/30 text-warning font-medium',
  absent: 'border-danger/30 text-danger font-medium',
  excused: 'border-info/30 text-info font-medium',
};

function parseScore(value: string): number | null {
  if (value === '') return null;
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return null;
  return Math.min(10, Math.max(1, n));
}

/**
 * `returnTo` query parametresini güvenli, dahili bir yola çevirir.
 *
 * `URL` ile `window.location.origin`'e göre çözümlenir; farklı origin'e çıkan
 * ya da parse edilemeyen her girdi `/teacher`'a düşer. Yalnızca
 * `pathname + search + hash` döndürülür — protokol/host asla korunmaz. Böylece
 * `//evil.com`, `/\evil.com` (tek ters bölü), `https://evil.com` ve
 * `javascript:` gibi open redirect vektörleri reddedilir.
 */
function resolveReturnTo(raw: string | null): string {
  if (!raw) return '/teacher';
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return '/teacher';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/teacher';
  }
}

export default function ReportEntryPage() {
  const { classCourseId = '', weekId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Dönüş hedefi: admin gönderim ekranından gelindiyse oraya, aksi halde
  // öğretmen paneline. Yalnızca aynı origin'e ait gerçek dahili path kabul
  // edilir (open redirect koruması — `resolveReturnTo`).
  const returnToParam = searchParams.get('returnTo');
  const returnTo = resolveReturnTo(returnToParam);
  const returnLabel = returnTo.startsWith('/admin') ? 'Gönderim ekranına dön' : 'Geri dön';

  const [payload, setPayload] = useState<TeacherReportPayload | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [topic, setTopic] = useState('');
  const [prevText, setPrevText] = useState('');
  const [hwDesc, setHwDesc] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [entries, setEntries] = useState<ReportEntry[]>([]);

  const toast = useToast();
  const [reloadKey, setReloadKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeMsg, setCompleteMsg] = useState<string | null>(null);
  const [completeErrors, setCompleteErrors] = useState<Record<string, string>>({});

  const [bulkHomework, setBulkHomework] = useState('');
  const [bulkInterest, setBulkInterest] = useState('');
  const [mobileIndex, setMobileIndex] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const mobileCardRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const keyboardOpen = useKeyboardOpen();

  // Ödev ekleri (PDF) — migration #13. Yalnızca bu haftanın ekleri düzenlenir;
  // geçen haftanın ekleri salt-okunur gösterilir.
  const [homeworkAttachments, setHomeworkAttachments] = useState<HomeworkAttachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const reportIdRef = useRef<string | null>(null);
  const originalDueRef = useRef('');
  const readyRef = useRef(false);
  const cellRefs = useRef(new Map<string, HTMLElement>());
  // Bekleyen otomatik kayıt: `pendingRef` değişiklik kaydedilmeden önce true,
  // `timerRef` debounce zamanlayıcısı, `flushSaveRef` her zaman en güncel kaydedici.
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushSaveRef = useRef<() => Promise<boolean>>(async () => true);
  const leaveBlockedRef = useRef(false);

  // ---- Yükleme (rapor varsa o; yoksa ve hafta başladıysa get-or-create) ----
  useEffect(() => {
    let cancelled = false;
    teacherApi
      .openReportEntry(classCourseId, weekId)
      .then(async (view) => {
        // Hafta başlamış ama rapor henüz yoksa taslak oluşturulur; hafta
        // başlamadıysa (`read_only`) hiçbir şey yazılmaz, önizleme gösterilir.
        const data =
          view.read_only || view.report.id
            ? view
            : await teacherApi.openReport(classCourseId, weekId);
        if (cancelled) return;
        // İki ayrı kilit kaynağı birleşir: hafta salt-okunur önizlemesi
        // (`read_only`) + gönderilmiş rapor (öğretmen için `locked_for_teacher`).
        // Admin `locked_for_teacher=false` alır → sent raporda düzenleyebilir.
        const locked = data.read_only || data.locked_for_teacher;
        setPayload(data);
        setReadOnly(locked);
        reportIdRef.current = data.report.id;
        originalDueRef.current = data.report.homework?.due_date ?? '';
        setTopic(data.report.topic_covered ?? '');
        setPrevText(data.report.prev_homework_text ?? '');
        setHwDesc(data.report.homework?.description ?? '');
        setDueDate(data.report.homework?.due_date ?? '');
        setHomeworkAttachments(data.report.homework_attachments ?? []);
        setEntries(data.entries);
        // Otomatik kaydetme yalnızca gerçekten yazılabilir bir raporda çalışır.
        // Kilitli raporda PUT hiç üretilmez (yalnızca `disabled` görünümü değil).
        readyRef.current = !locked && data.report.id !== null;
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
          err instanceof ApiClientError
            ? err.message
            : 'Rapor yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.',
        );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [classCourseId, weekId, reloadKey]);

  const buildInput = useCallback(
    (): ReportSaveInput => ({
      topic_covered: topic,
      prev_homework_text: prevText,
      homework_description: hwDesc,
      // Normal haftada dolu tarih boşaltılamaz; temizlenirse asıl değerine döner.
      due_date: dueDate || originalDueRef.current || null,
      entries: entries.map((e) => ({
        student_id: e.student_id,
        attendance: e.attendance,
        homework_score: e.homework_score,
        interest_score: e.interest_score,
        teacher_note: e.teacher_note,
      })),
    }),
    [topic, prevText, hwDesc, dueDate, entries],
  );

  /** Kaydeder; başarıyı döndürür. Bekleyen debounce'u sıfırlar. */
  const flushSave = useCallback(async (): Promise<boolean> => {
    const id = reportIdRef.current;
    if (!id) return true;
    pendingRef.current = false;
    try {
      await teacherApi.saveReport(id, buildInput());
      setSaveState('saved');
      setSavedAt(Date.now());
      return true;
    } catch {
      pendingRef.current = true;
      setSaveState('error');
      return false;
    }
  }, [buildInput]);
  useEffect(() => {
    flushSaveRef.current = flushSave;
  }, [flushSave]);

  /**
   * Bekleyen değişiklik varsa 2 sn beklemeden HEMEN kaydeder (kart değiştirme,
   * "Geri dön"). Bekleyen yoksa hiçbir şey yapmaz. Başarıyı döndürür.
   */
  const flushPending = useCallback(async (): Promise<boolean> => {
    if (!pendingRef.current) return true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setSaveState('saving');
    return flushSaveRef.current();
  }, []);

  // ---- Otomatik kaydetme: debounce ~2 sn (salt-okunur önizlemede kapalı) ----
  useEffect(() => {
    if (readOnly || !readyRef.current || !reportIdRef.current) return;
    setSaveState('saving');
    pendingRef.current = true;
    const timer = setTimeout(() => {
      timerRef.current = null;
      void flushSaveRef.current();
    }, 2000);
    timerRef.current = timer;
    return () => clearTimeout(timer);
  }, [topic, prevText, hwDesc, dueDate, entries, readOnly]);

  // Sayfadan ayrılırken (sekme değişimi dahil) bekleyen değişiklik kaybolmasın.
  useEffect(
    () => () => {
      if (pendingRef.current) void flushSaveRef.current();
    },
    [],
  );

  function handleRetrySave() {
    setSaveState('saving');
    void flushSaveRef.current();
  }

  async function handleLeave() {
    // Kaydedilemeyen değişiklik varsa bir kez uyarır; ikinci tıklama yine de çıkar.
    const ok = await flushPending();
    if (!ok && !leaveBlockedRef.current) {
      leaveBlockedRef.current = true;
      setCompleteMsg('Değişiklikler kaydedilemedi. Yeniden deneyin ya da yine de çıkmak için tekrar tıklayın.');
      return;
    }
    navigate(returnTo);
  }

  /**
   * Mobil kartlar arası geçiş: bekleyen otomatik kayıt 2 sn beklenmeden
   * HEMEN gönderilir (kart değişince değişiklik kaybolmaz); odak yeni karta taşınır.
   */
  function goToCard(next: number) {
    if (next < 0 || next > entries.length - 1) return;
    void flushPending();
    setMobileIndex(next);
    requestAnimationFrame(() => mobileCardRef.current?.focus());
  }

  function updateEntry(studentId: string, patch: Partial<ReportEntry>) {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.student_id !== studentId) return e;
        const next = { ...e, ...patch };
        // Devamsız/izinli satırda yalnızca ders içi performans puanı null olur
        // (spec §4); ödev puanı devamsızlıktan bağımsızdır ve korunur.
        if (next.attendance === 'absent' || next.attendance === 'excused') {
          next.interest_score = null;
        }
        return next;
      }),
    );
  }

  // ---- Klavye navigasyonu ----
  function setCellRef(key: string) {
    return (el: HTMLElement | null) => {
      if (el) cellRefs.current.set(key, el);
      else cellRefs.current.delete(key);
    };
  }

  function handleCellKeyDown(
    e: React.KeyboardEvent,
    row: number,
    col: number,
  ) {
    const tag = (e.target as HTMLElement).tagName;
    let target: [number, number];
    if (e.key === 'Enter') {
      target = [row + 1, col];
    } else if (tag === 'SELECT') {
      return; // Ok tuşları select'in kendi listesini yönetsin.
    } else if (e.key === 'ArrowDown') target = [row + 1, col];
    else if (e.key === 'ArrowUp') target = [row - 1, col];
    else if (e.key === 'ArrowRight') target = [row, col + 1];
    else if (e.key === 'ArrowLeft') target = [row, col - 1];
    else return;

    e.preventDefault();
    const el = cellRefs.current.get(`${target[0]}-${target[1]}`);
    if (el) el.focus();
  }

  // ---- Tamamla ----
  async function handleComplete() {
    const id = reportIdRef.current;
    if (!id) return;
    setCompleting(true);
    setCompleteMsg(null);
    setCompleteErrors({});
    try {
      // Bekleyen otomatik kaydı tamamla, sonra sunucuda doğrulat.
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingRef.current = false;
      await teacherApi.saveReport(id, buildInput());
      await teacherApi.completeReport(id);
      navigate('/teacher');
    } catch (err) {
      if (err instanceof ApiClientError && err.fields) {
        setCompleteErrors(err.fields);
        setCompleteMsg(err.message);
      } else {
        setCompleteMsg(err instanceof Error ? err.message : 'Rapor tamamlanamadı. Yeniden deneyin.');
      }
    } finally {
      setCompleting(false);
    }
  }

  async function openFile(key: string) {
    try {
      await openProtectedFile(key);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Dosya açılamadı. Yeniden deneyin.');
    }
  }

  async function handleAddAttachments(files: File[]) {
    const id = reportIdRef.current;
    if (!id) return;
    setAttachmentBusy(true);
    setAttachmentError(null);
    try {
      const res = await teacherApi.addAttachments(id, files);
      setHomeworkAttachments(res.attachments);
    } catch (err) {
      setAttachmentError(err instanceof ApiClientError ? err.message : 'Ek yüklenemedi.');
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function handleRemoveAttachment(attachmentId: string) {
    const id = reportIdRef.current;
    if (!id) return;
    setAttachmentBusy(true);
    setAttachmentError(null);
    try {
      const res = await teacherApi.removeAttachment(id, attachmentId);
      setHomeworkAttachments(res.attachments);
    } catch (err) {
      setAttachmentError(err instanceof ApiClientError ? err.message : 'Ek kaldırılamadı.');
    } finally {
      setAttachmentBusy(false);
    }
  }

  function bulkMakePresent() {
    setEntries((prev) => prev.map((e) => ({ ...e, attendance: 'present' as Attendance })));
  }

  function bulkApplyScore(field: 'homework_score' | 'interest_score') {
    const score = parseScore(field === 'homework_score' ? bulkHomework : bulkInterest);
    if (score === null) return;
    setEntries((prev) =>
      prev.map((e) => {
        // Ödev puanı devamsızlıktan bağımsızdır → tüm satırlara uygulanır.
        // Ders içi performans devamsız satırda null kalmalı (spec §4) → atlanır.
        if (
          field === 'interest_score' &&
          (e.attendance === 'absent' || e.attendance === 'excused')
        ) {
          return e;
        }
        return { ...e, [field]: score };
      }),
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <ErrorState
          message={loadError}
          onRetry={() => {
            setLoadError(null);
            setReloadKey((k) => k + 1);
          }}
        />
        <Button onClick={() => navigate(returnTo)}>{returnLabel}</Button>
      </div>
    );
  }

  if (!payload) return <LoadingState />;

  const { report } = payload;
  const isLastWeek = report.homework === null && dueDate === '';
  // "Tamamlandı" banner'ı yalnızca `completed` (öğretmen düzenleyebilir) için;
  // `sent` kendi banner'ını alır (spec §2) — ikisi asla üst üste görünmez.
  const isCompleted = report.status === 'completed';

  // Tamamlanma özeti: ödev puanı dolu + (performans dolu ya da devamsız/izinli).
  const doneCount = entries.filter((e) => {
    const away = e.attendance === 'absent' || e.attendance === 'excused';
    return e.homework_score !== null && (away || e.interest_score !== null);
  }).length;

  const lastIndex = entries.length - 1;
  const cardIndex = Math.min(mobileIndex, Math.max(0, lastIndex));

  return (
    <div
      className={cx(
        'space-y-3',
        // Sabit alt çubuğun altında içerik kalmasın (klavye açıkken çubuk yoktur).
        !keyboardOpen && 'max-md:pb-[calc(5rem+env(safe-area-inset-bottom))]',
      )}
    >
      {!readOnly && <SaveAnnouncer state={saveState} savedAt={savedAt} />}
      <div>
        <Button variant="ghost" size="sm" onClick={() => void handleLeave()} className="-ml-2">
          <ArrowLeft size={16} aria-hidden="true" />
          {returnLabel}
        </Button>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-text">
              {report.class_name} · {report.course_name}
            </h1>
            <p className="tabular mt-0.5 text-sm text-muted">
              Hafta {report.week.week_no} · {DAY_LABELS[report.day_of_week]}
              {report.lesson_time ? ` ${report.lesson_time}` : ''}
            </p>
          </div>
          {!readOnly && (
            <SaveStatus
              state={saveState}
              savedAt={savedAt}
              onRetry={handleRetrySave}
              className="pt-1 max-md:hidden"
            />
          )}
        </div>
      </div>

      {payload.week_range_invalid ? (
        <InlineNotice tone="danger">
          Hafta tanımı hatalı — bu dersin günü hafta aralığının dışında. Yönetici
          haftanın tarih aralığını düzeltmeden rapor doldurulamaz.
        </InlineNotice>
      ) : payload.locked_for_teacher ? (
        <InlineNotice tone="success">
          Bu rapor gönderildi; artık düzenlenemez. Düzeltme gerekiyorsa
          yöneticinize başvurun.
        </InlineNotice>
      ) : readOnly ? (
        <InlineNotice tone="info">
          Bu hafta henüz başlamadı — yalnızca önizleme. Hafta başladığında rapor
          doldurulabilir.
        </InlineNotice>
      ) : report.status === 'sent' ? (
        <InlineNotice tone="success">
          Bu rapor gönderildi. Admin olarak düzenleyebilirsiniz; değişiklikler
          kayıt altına alınır. Veliye iletilen kopya değişmez — gerekiyorsa
          yeniden gönderin.
        </InlineNotice>
      ) : null}

      {isCompleted && (
        <InlineNotice tone="info">
          Bu rapor tamamlandı. Yapılan düzenlemeler kayıt altına alınır.
        </InlineNotice>
      )}

      {/* "Teslim tarihini siz belirleyin" yalnızca yazılabilir raporda anlamlı:
          kilitli (locked_for_teacher) ya da hafta salt-okunur/aralık-hatalıyken
          (`readOnly`) bastırılır (banner önceliğinde isLastWeek en altta). */}
      {isLastWeek && !readOnly && (
        <InlineNotice tone="warning">
          Yılın son haftası — teslim tarihini siz belirleyin.
        </InlineNotice>
      )}

      <FormError message={completeMsg} />
      <FormError message={attachmentError} />

      {/* Dar ekranda ders bilgileri katlanır: öğrenci kartı ilk ekranda görünsün.
          Alanlar DOM'da tektir; katlanınca yalnızca CSS ile gizlenir. */}
      <button
        type="button"
        onClick={() => setInfoOpen((o) => !o)}
        aria-expanded={infoOpen || Object.keys(completeErrors).length > 0}
        aria-controls="class-info"
        className="flex min-h-14 w-full items-center gap-3 rounded-md border border-border bg-surface px-4 py-2 text-left md:hidden"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-text">Ders bilgileri</span>
          <span className="block truncate text-[13px] text-muted">
            {topic || hwDesc
              ? [topic && `Konu: ${topic}`, hwDesc && `Ödev: ${hwDesc}`].filter(Boolean).join(' · ')
              : 'Konu ve ödev henüz girilmedi'}
          </span>
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={cx('shrink-0 text-muted transition-transform', infoOpen && 'rotate-180')}
        />
      </button>
      <Card
        id="class-info"
        padding="sm"
        className={cx(
          'grid gap-3 md:grid-cols-2',
          !infoOpen && Object.keys(completeErrors).length === 0 && 'max-md:hidden',
        )}
      >
        <Field label="Verilmiş olan ödev" htmlFor="prev-homework">
          <Input
            id="prev-homework"
            value={prevText}
            onChange={(e) => setPrevText(e.target.value)}
            disabled={readOnly}
            placeholder="Geçen haftanın ödevi…"
          />
          {(payload.report.prev_homework_attachments ?? []).length > 0 && (
            <div className="mt-1.5">
              <HomeworkAttachments
                attachments={payload.report.prev_homework_attachments ?? []}
                onOpen={(key) => void openFile(key)}
              />
            </div>
          )}
        </Field>
        <Field label="İşlenen konu" htmlFor="topic" error={completeErrors.topic_covered}>
          <Input
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={readOnly}
            placeholder="Bu hafta işlenen konu…"
          />
        </Field>
        <Field
          label="Yapılacak ödev"
          htmlFor="next-homework"
          error={completeErrors.homework_description}
        >
          <Input
            id="next-homework"
            value={hwDesc}
            onChange={(e) => setHwDesc(e.target.value)}
            disabled={readOnly}
            placeholder="Önümüzdeki haftanın ödevi…"
          />
          {/* `homework` null olsa da (yılın son haftası) ekler rapora bağlıdır. */}
          <div className="mt-1.5">
            <HomeworkAttachments
              attachments={homeworkAttachments}
              onOpen={(key) => void openFile(key)}
              onAdd={!readOnly ? (files) => void handleAddAttachments(files) : undefined}
              onRemove={!readOnly ? (id) => void handleRemoveAttachment(id) : undefined}
              busy={attachmentBusy}
            />
          </div>
        </Field>
        <Field label="Teslim tarihi" htmlFor="due-date" error={completeErrors.due_date}>
          <Input
            id="due-date"
            type="date"
            className="tabular"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={readOnly}
            onBlur={() => {
              if (!dueDate && originalDueRef.current) setDueDate(originalDueRef.current);
            }}
          />
        </Field>
      </Card>

      {/* Toplu doldurma kısayolu (salt-okunur önizlemede gizli) */}
      {!readOnly && (
        <Card padding="sm" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button size="sm" onClick={bulkMakePresent} className="max-md:w-full">
            Tümünü geldi yap
          </Button>
          <div className="flex items-center gap-2 max-md:hidden">
            <label htmlFor="bulk-homework" className="whitespace-nowrap text-[13px] text-muted">
              Tümü ödev puanı
            </label>
            <input
              id="bulk-homework"
              type="number"
              min={1}
              max={10}
              value={bulkHomework}
              onChange={(e) => setBulkHomework(e.target.value)}
              className={cx(cellClass, 'tabular w-16 max-md:h-11')}
            />
            <Button size="sm" onClick={() => bulkApplyScore('homework_score')}>
              Uygula
            </Button>
          </div>
          <div className="flex items-center gap-2 max-md:hidden">
            <label
              htmlFor="bulk-interest"
              title="Ders içi performans puanı"
              className="whitespace-nowrap text-[13px] text-muted"
            >
              Tümü performans puanı
            </label>
            <input
              id="bulk-interest"
              type="number"
              min={1}
              max={10}
              value={bulkInterest}
              onChange={(e) => setBulkInterest(e.target.value)}
              className={cx(cellClass, 'tabular w-16 max-md:h-11')}
            />
            <Button size="sm" onClick={() => bulkApplyScore('interest_score')}>
              Uygula
            </Button>
          </div>
        </Card>
      )}

      {/* Masaüstü: tablo (klavye modeli: Tab/Enter aşağı, ok tuşları hücre, rakam tuşu puan) */}
      <div className="compact hidden overflow-x-auto rounded-md border border-border bg-surface md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-subtle/60 text-left text-[13px] font-medium text-muted">
              <th className="w-52">Öğrenci</th>
              <th className="w-36">Devamsızlık</th>
              <th className="w-20 text-center">Ödev</th>
              <th className="w-24 text-center" title="Ders içi performans puanı">
                Performans
              </th>
              <th>Not</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, row) => {
              // Yalnızca ders içi performans devamsızlıkta kapanır; ödev puanı
              // her durumda girebilir (spec §4).
              const interestDisabled =
                entry.attendance === 'absent' || entry.attendance === 'excused';
              return (
                <tr
                  key={entry.student_id}
                  className="border-b border-border transition-colors last:border-b-0 focus-within:bg-accent/5"
                >
                  <td className="text-[13px] text-text">
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap font-medium">{entry.student_name}</span>
                      {entry.submission ? (
                        <span className="shrink-0">
                          <Badge tone={entry.submission.is_late ? 'warning' : 'positive'}>
                            {entry.submission.is_late ? 'Geç yüklendi' : 'Yüklendi'}
                          </Badge>
                        </span>
                      ) : (
                        <span className="shrink-0">
                          <Badge tone="danger">Yüklenmedi</Badge>
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <select
                      ref={setCellRef(`${row}-0`)}
                      aria-label={`Devamsızlık — ${entry.student_name}`}
                      value={entry.attendance}
                      onChange={(e) =>
                        updateEntry(entry.student_id, {
                          attendance: e.target.value as Attendance,
                        })
                      }
                      onKeyDown={(e) => handleCellKeyDown(e, row, 0)}
                      disabled={readOnly}
                      className={cx(cellClass, ATTENDANCE_CELL_TONE[entry.attendance])}
                    >
                      {(Object.keys(ATTENDANCE_LABELS) as Attendance[]).map((a) => (
                        <option key={a} value={a}>
                          {ATTENDANCE_LABELS[a]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      ref={setCellRef(`${row}-1`)}
                      aria-label={`Ödev puanı — ${entry.student_name}`}
                      type="number"
                      min={1}
                      max={10}
                      value={entry.homework_score ?? ''}
                      onChange={(e) =>
                        updateEntry(entry.student_id, {
                          homework_score: parseScore(e.target.value),
                        })
                      }
                      onKeyDown={(e) => handleCellKeyDown(e, row, 1)}
                      onFocus={(e) => e.target.select()}
                      disabled={readOnly}
                      className={scoreCellClass}
                    />
                  </td>
                  <td>
                    <input
                      ref={setCellRef(`${row}-2`)}
                      aria-label={`Ders içi performans puanı — ${entry.student_name}`}
                      type="number"
                      min={1}
                      max={10}
                      disabled={readOnly || interestDisabled}
                      title={
                        interestDisabled
                          ? 'Devamsız/izinli öğrencide ders içi performans girilmez'
                          : undefined
                      }
                      placeholder={interestDisabled ? '—' : undefined}
                      value={entry.interest_score ?? ''}
                      onChange={(e) =>
                        updateEntry(entry.student_id, {
                          interest_score: parseScore(e.target.value),
                        })
                      }
                      onKeyDown={(e) => handleCellKeyDown(e, row, 2)}
                      onFocus={(e) => e.target.select()}
                      className={scoreCellClass}
                    />
                  </td>
                  <td>
                    <textarea
                      ref={setCellRef(`${row}-3`)}
                      aria-label={`Not — ${entry.student_name}`}
                      rows={1}
                      disabled={readOnly}
                      value={entry.teacher_note ?? ''}
                      onChange={(e) =>
                        updateEntry(entry.student_id, { teacher_note: e.target.value })
                      }
                      onKeyDown={(e) => handleCellKeyDown(e, row, 3)}
                      className={cx(cellClass, 'resize-y')}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobil: öğrenci başına kart + önceki/sonraki (yatay kaydırma yok) */}
      <div className="md:hidden">
        {entries.length > 0 &&
          (() => {
            const index = Math.min(mobileIndex, entries.length - 1);
            const entry = entries[index];
            const away = entry.attendance === 'absent' || entry.attendance === 'excused';
            return (
              <div className="space-y-3">
                <div
                  ref={mobileCardRef}
                  role="group"
                  aria-label={`${entry.student_name}, ${index + 1} / ${entries.length}`}
                  tabIndex={-1}
                  onFocusCapture={(e) => {
                    // Klavye açılırken odaktaki alan görünür alanın ortasına gelsin.
                    const t = e.target as HTMLElement;
                    if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') {
                      setTimeout(() => t.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 300);
                    }
                  }}
                  className="space-y-4 rounded-md border border-border bg-surface p-4 focus:outline-none"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-base font-semibold text-text">{entry.student_name}</h2>
                      <span className="tabular shrink-0 pt-0.5 text-[13px] text-muted">
                        {index + 1} / {entries.length}
                      </span>
                    </div>
                    <div
                      aria-hidden="true"
                      className="mt-2 h-1 overflow-hidden rounded-full bg-subtle"
                    >
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${((index + 1) / entries.length) * 100}%` }}
                      />
                    </div>
                    <div className="mt-2">
                      {entry.submission ? (
                        <Badge tone={entry.submission.is_late ? 'warning' : 'positive'}>
                          {entry.submission.is_late ? 'Geç yüklendi' : 'Yüklendi'}
                        </Badge>
                      ) : (
                        <Badge tone="danger">Yüklenmedi</Badge>
                      )}
                    </div>
                  </div>

                  <Field label="Devamsızlık" htmlFor="m-att">
                    <select
                      id="m-att"
                      value={entry.attendance}
                      onChange={(e) =>
                        updateEntry(entry.student_id, {
                          attendance: e.target.value as Attendance,
                        })
                      }
                      disabled={readOnly}
                      className={cx(mobileControlClass, 'w-full', ATTENDANCE_CELL_TONE[entry.attendance])}
                    >
                      {(Object.keys(ATTENDANCE_LABELS) as Attendance[]).map((a) => (
                        <option key={a} value={a}>
                          {ATTENDANCE_LABELS[a]}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label htmlFor="m-hw" className="text-[13px] font-medium text-muted">
                        Ödev puanı
                      </label>
                      <input
                        id="m-hw"
                        type="number"
                        min={1}
                        max={10}
                        value={entry.homework_score ?? ''}
                        onChange={(e) =>
                          updateEntry(entry.student_id, {
                            homework_score: parseScore(e.target.value),
                          })
                        }
                        disabled={readOnly}
                        className={cx(mobileControlClass, 'tabular w-20 text-center')}
                      />
                    </div>
                    <ScoreRadioGroup
                      label="Ödev puanı için hızlı seçim"
                      value={entry.homework_score}
                      disabled={readOnly}
                      onChange={(n) => updateEntry(entry.student_id, { homework_score: n })}
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label htmlFor="m-int" className="text-[13px] font-medium text-muted">
                        Ders içi performans puanı
                      </label>
                      <input
                        id="m-int"
                        type="number"
                        min={1}
                        max={10}
                        disabled={readOnly || away}
                        placeholder={away ? '—' : undefined}
                        value={entry.interest_score ?? ''}
                        onChange={(e) =>
                          updateEntry(entry.student_id, {
                            interest_score: parseScore(e.target.value),
                          })
                        }
                        className={cx(mobileControlClass, 'tabular w-20 text-center')}
                      />
                    </div>
                    <ScoreRadioGroup
                      label="Ders içi performans puanı için hızlı seçim"
                      value={entry.interest_score}
                      disabled={readOnly || away}
                      onChange={(n) => updateEntry(entry.student_id, { interest_score: n })}
                    />
                    {away && (
                      <p className="mt-2 text-[13px] text-muted">
                        Devamsız/izinli öğrencide ders içi performans girilmez.
                      </p>
                    )}
                  </div>

                  <Field label="Not" htmlFor="m-note">
                    <textarea
                      id="m-note"
                      rows={2}
                      value={entry.teacher_note ?? ''}
                      onChange={(e) =>
                        updateEntry(entry.student_id, { teacher_note: e.target.value })
                      }
                      disabled={readOnly}
                      className={textareaClass}
                    />
                  </Field>
                </div>
              </div>
            );
          })()}
      </div>

      {/* Tamamlama: tablonun/kartın hemen ardından — Tab ile son hücreden ulaşılır */}
      {!readOnly && report.status === 'draft' && (
        <div ref={footerRef}>
        <Card padding="sm" className="flex flex-wrap items-center justify-between gap-3">
          <p className="tabular text-sm text-muted">
            <span className="font-medium text-text">
              {doneCount} / {entries.length}
            </span>{' '}
            öğrencinin puanları tamam
          </p>
          <Button variant="primary" onClick={handleComplete} loading={completing}>
            {completing ? 'Tamamlanıyor…' : 'Raporu tamamla'}
          </Button>
        </Card>
        </div>
      )}

      {/* Mobil sabit alt çubuk: kartlar arası gezinme + kaydetme durumu.
          Klavye açıkken (not alanı odakta) hiç render edilmez → alanı/içeriği örtmez.
          `env(safe-area-inset-bottom)` iOS ana ekran çubuğu/çentik payıdır. */}
      {entries.length > 0 && !keyboardOpen && (
        <div
          data-testid="mobile-bar"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <Button
              size="lg"
              disabled={cardIndex === 0}
              onClick={() => goToCard(cardIndex - 1)}
              className="min-w-28"
            >
              <ChevronLeft size={18} aria-hidden="true" />
              Önceki
            </Button>
            <div className="min-w-0 flex-1 text-center">
              {!readOnly ? (
                <SaveStatus
                  state={saveState}
                  savedAt={savedAt}
                  onRetry={handleRetrySave}
                  className="flex justify-center"
                />
              ) : null}
            </div>
            {cardIndex < lastIndex ? (
              <Button
                size="lg"
                variant="primary"
                onClick={() => goToCard(cardIndex + 1)}
                className="min-w-28"
              >
                Sonraki
                <ChevronRight size={18} aria-hidden="true" />
              </Button>
            ) : (
              <Button
                size="lg"
                variant="primary"
                onClick={() => {
                  footerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="min-w-28"
              >
                <ListChecks size={18} aria-hidden="true" />
                Özet
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
