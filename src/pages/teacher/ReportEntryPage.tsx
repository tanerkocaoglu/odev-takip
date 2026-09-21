/**
 * Toplu rapor giriş ekranı — projenin kalbi (spec.md §6.1).
 * Üstte sınıf düzeyi alanlar (verilmiş ödev, konu, yapılacak ödev, son tarih),
 * altta satır = öğrenci tablosu. Klavye navigasyonu (Enter/ok tuşları),
 * otomatik kaydetme (debounce ~2 sn), dar ekranda kart görünümü.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type {
  Attendance,
  ReportEntry,
  ReportSaveInput,
  TeacherReportPayload,
} from '../../types';
import { ATTENDANCE_LABELS, DAY_LABELS } from '../../types';
import { teacherApi, ApiClientError } from '../../services/api';
import { Badge, Field, FormError, LoadingState, PrimaryButton } from '../../components/admin/ui';

const inputClass =
  'h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px] text-text placeholder:text-muted focus:border-accent';

function parseScore(value: string): number | null {
  if (value === '') return null;
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return null;
  return Math.min(10, Math.max(1, n));
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

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

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [completing, setCompleting] = useState(false);
  const [completeMsg, setCompleteMsg] = useState<string | null>(null);
  const [completeErrors, setCompleteErrors] = useState<Record<string, string>>({});

  const [bulkHomework, setBulkHomework] = useState('');
  const [bulkInterest, setBulkInterest] = useState('');
  const [mobileIndex, setMobileIndex] = useState(0);

  const reportIdRef = useRef<string | null>(null);
  const originalDueRef = useRef('');
  const readyRef = useRef(false);
  const cellRefs = useRef(new Map<string, HTMLElement>());

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
        setPayload(data);
        setReadOnly(data.read_only);
        reportIdRef.current = data.report.id;
        originalDueRef.current = data.report.homework?.due_date ?? '';
        setTopic(data.report.topic_covered ?? '');
        setPrevText(data.report.prev_homework_text ?? '');
        setHwDesc(data.report.homework?.description ?? '');
        setDueDate(data.report.homework?.due_date ?? '');
        setEntries(data.entries);
        // Otomatik kaydetme yalnızca gerçekten yazılabilir bir raporda çalışır.
        readyRef.current = !data.read_only && data.report.id !== null;
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [classCourseId, weekId]);

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

  const flushSave = useCallback(async () => {
    const id = reportIdRef.current;
    if (!id) return;
    try {
      await teacherApi.saveReport(id, buildInput());
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [buildInput]);

  // ---- Otomatik kaydetme: debounce ~2 sn (salt-okunur önizlemede kapalı) ----
  useEffect(() => {
    if (readOnly || !readyRef.current || !reportIdRef.current) return;
    setSaveState('saving');
    const timer = setTimeout(() => {
      flushSave();
    }, 2000);
    return () => clearTimeout(timer);
  }, [topic, prevText, hwDesc, dueDate, entries, flushSave, readOnly]);

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
      await teacherApi.saveReport(id, buildInput());
      await teacherApi.completeReport(id);
      navigate('/teacher');
    } catch (err) {
      if (err instanceof ApiClientError && err.fields) {
        setCompleteErrors(err.fields);
        setCompleteMsg(err.message);
      } else {
        setCompleteMsg(err instanceof Error ? err.message : 'Bir hata oluştu.');
      }
    } finally {
      setCompleting(false);
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
        <FormError message={loadError} />
        <button
          type="button"
          onClick={() => navigate(returnTo)}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-text hover:bg-bg"
        >
          {returnLabel}
        </button>
      </div>
    );
  }

  if (!payload) return <LoadingState />;

  const { report } = payload;
  const isLastWeek = report.homework === null && dueDate === '';
  const isCompleted = report.status !== 'draft';

  const saveIndicator = readOnly
    ? null
    : saveState === 'saving' ? (
        <span className="text-xs text-muted">Kaydediliyor…</span>
      ) : saveState === 'saved' ? (
        <span className="text-xs text-status-sent">Kaydedildi</span>
      ) : saveState === 'error' ? (
        <span className="text-xs text-att-absent">Kaydedilemedi</span>
      ) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">
            {report.class_name} · {report.course_name}
          </h1>
          <p className="tabular mt-0.5 text-sm text-muted">
            Hafta {report.week.week_no} · {DAY_LABELS[report.day_of_week]}
            {report.lesson_time ? ` ${report.lesson_time}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(returnTo)}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg"
          >
            {returnLabel}
          </button>
          {saveIndicator}
          {!isCompleted && !readOnly && (
            <PrimaryButton onClick={handleComplete} disabled={completing}>
              {completing ? 'Tamamlanıyor…' : 'Raporu tamamla'}
            </PrimaryButton>
          )}
        </div>
      </div>

      {payload.week_range_invalid ? (
        <p className="rounded-md border border-att-absent/40 bg-att-absent/5 px-3 py-2 text-sm text-att-absent">
          Hafta tanımı hatalı — bu dersin günü hafta aralığının dışında. Yönetici
          haftanın tarih aralığını düzeltmeden rapor doldurulamaz.
        </p>
      ) : (
        readOnly && (
          <p className="rounded-md border border-att-late/40 bg-att-late/5 px-3 py-2 text-sm text-att-late">
            Bu hafta henüz başlamadı — yalnızca önizleme. Hafta başladığında rapor
            doldurulabilir.
          </p>
        )
      )}

      {isCompleted && (
        <p className="rounded-md border border-status-completed/30 bg-status-completed/5 px-3 py-2 text-sm text-status-completed">
          Bu rapor tamamlandı. Yapılan düzenlemeler kayıt altına alınır.
        </p>
      )}

      {isLastWeek && (
        <p className="rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-sm text-amber">
          Yılın son haftası — teslim tarihini siz belirleyin.
        </p>
      )}

      <FormError message={completeMsg} />

      {/* Sınıf düzeyi alanlar */}
      <section className="elevation-1 grid gap-2 rounded-md border border-border bg-surface p-3 md:grid-cols-2">
        <Field label="Verilmiş olan ödev" htmlFor="prev-homework">
          <input
            id="prev-homework"
            className={inputClass}
            value={prevText}
            onChange={(e) => setPrevText(e.target.value)}
            disabled={readOnly}
            placeholder="Geçen haftanın ödevi…"
          />
        </Field>
        <Field label="İşlenen konu" htmlFor="topic" error={completeErrors.topic_covered}>
          <input
            id="topic"
            className={inputClass}
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
          <input
            id="next-homework"
            className={inputClass}
            value={hwDesc}
            onChange={(e) => setHwDesc(e.target.value)}
            disabled={readOnly}
            placeholder="Önümüzdeki haftanın ödevi…"
          />
        </Field>
        <Field
          label="Teslim tarihi"
          htmlFor="due-date"
          error={completeErrors.due_date}
        >
          <input
            id="due-date"
            type="date"
            className={inputClass + ' tabular'}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={readOnly}
            onBlur={() => {
              if (!dueDate && originalDueRef.current) setDueDate(originalDueRef.current);
            }}
          />
        </Field>
      </section>

      {/* Toplu doldurma kısayolu (salt-okunur önizlemede gizli) */}
      {!readOnly && (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={bulkMakePresent}
          className="min-h-[44px] rounded-md border border-border px-3 text-[13px] text-text hover:bg-bg md:h-8 md:min-h-0"
        >
          Tümünü geldi yap
        </button>
        <div className="flex items-center gap-2">
          <label
            htmlFor="bulk-homework"
            className="whitespace-nowrap text-[13px] text-muted"
          >
            Tümü ödev puanı
          </label>
          <input
            id="bulk-homework"
            type="number"
            min={1}
            max={10}
            value={bulkHomework}
            onChange={(e) => setBulkHomework(e.target.value)}
            className={inputClass + ' tabular w-14'}
          />
          <button
            type="button"
            onClick={() => bulkApplyScore('homework_score')}
            className="min-h-[44px] rounded-md border border-border px-3 text-[13px] text-text hover:bg-bg md:h-8 md:min-h-0"
          >
            Uygula
          </button>
        </div>
        <div className="flex items-center gap-2">
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
            className={inputClass + ' tabular w-14'}
          />
          <button
            type="button"
            onClick={() => bulkApplyScore('interest_score')}
            className="min-h-[44px] rounded-md border border-border px-3 text-[13px] text-text hover:bg-bg md:h-8 md:min-h-0"
          >
            Uygula
          </button>
        </div>
      </div>
      )}

      {/* Masaüstü: tablo */}
      <div className="compact elevation-1 hidden overflow-hidden rounded-md border border-border bg-surface md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-[13px] font-medium text-muted">
              <th className="w-48">Öğrenci</th>
              <th className="w-32">Devamsızlık</th>
              <th className="w-20">Ödev</th>
              <th className="w-20" title="Ders içi performans puanı">
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
                <tr key={entry.student_id} className="border-b border-border last:border-b-0">
                  <td className="text-[13px] text-text">
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap">{entry.student_name}</span>
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
                      value={entry.attendance}
                      onChange={(e) =>
                        updateEntry(entry.student_id, {
                          attendance: e.target.value as Attendance,
                        })
                      }
                      onKeyDown={(e) => handleCellKeyDown(e, row, 0)}
                      disabled={readOnly}
                      className={inputClass}
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
                      className={inputClass + ' tabular'}
                    />
                  </td>
                  <td>
                    <input
                      ref={setCellRef(`${row}-2`)}
                      type="number"
                      min={1}
                      max={10}
                      disabled={readOnly || interestDisabled}
                      value={entry.interest_score ?? ''}
                      onChange={(e) =>
                        updateEntry(entry.student_id, {
                          interest_score: parseScore(e.target.value),
                        })
                      }
                      onKeyDown={(e) => handleCellKeyDown(e, row, 2)}
                      onFocus={(e) => e.target.select()}
                      className={inputClass + ' tabular disabled:bg-bg disabled:text-muted'}
                    />
                  </td>
                  <td>
                    <textarea
                      ref={setCellRef(`${row}-3`)}
                      rows={1}
                      disabled={readOnly}
                      value={entry.teacher_note ?? ''}
                      onChange={(e) =>
                        updateEntry(entry.student_id, { teacher_note: e.target.value })
                      }
                      onKeyDown={(e) => handleCellKeyDown(e, row, 3)}
                      className={inputClass + ' h-8 resize-y'}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobil: öğrenci başına kart + ileri/geri */}
      <div className="md:hidden">
        {entries.length > 0 && (
          <div className="space-y-3">
            {(() => {
              const entry = entries[Math.min(mobileIndex, entries.length - 1)];
              const interestDisabled =
                entry.attendance === 'absent' || entry.attendance === 'excused';
              return (
                <div className="elevation-1 space-y-3 rounded-md border border-border bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-text">{entry.student_name}</p>
                    <span className="tabular text-xs text-muted">
                      {mobileIndex + 1} / {entries.length}
                    </span>
                  </div>
                  {entry.submission ? (
                    <Badge tone={entry.submission.is_late ? 'warning' : 'positive'}>
                      {entry.submission.is_late ? 'Geç yüklendi' : 'Yüklendi'}
                    </Badge>
                  ) : (
                    <Badge tone="danger">Yüklenmedi</Badge>
                  )}
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
                      className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-text disabled:bg-bg"
                    >
                      {(Object.keys(ATTENDANCE_LABELS) as Attendance[]).map((a) => (
                        <option key={a} value={a}>
                          {ATTENDANCE_LABELS[a]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Ödev puanı" htmlFor="m-hw">
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
                        className="tabular h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-text disabled:bg-bg"
                      />
                    </Field>
                    <Field label="Ders içi performans puanı" htmlFor="m-int">
                      <input
                        id="m-int"
                        type="number"
                        min={1}
                        max={10}
                        disabled={readOnly || interestDisabled}
                        value={entry.interest_score ?? ''}
                        onChange={(e) =>
                          updateEntry(entry.student_id, {
                            interest_score: parseScore(e.target.value),
                          })
                        }
                        className="tabular h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-text disabled:bg-bg"
                      />
                    </Field>
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
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text disabled:bg-bg"
                    />
                  </Field>
                </div>
              );
            })()}
            <div className="flex justify-between">
              <button
                type="button"
                disabled={mobileIndex === 0}
                onClick={() => setMobileIndex((i) => Math.max(0, i - 1))}
                className="min-h-[44px] min-w-[44px] rounded-md border border-border px-4 text-sm text-text disabled:opacity-50"
              >
                Önceki
              </button>
              <button
                type="button"
                disabled={mobileIndex >= entries.length - 1}
                onClick={() => setMobileIndex((i) => Math.min(entries.length - 1, i + 1))}
                className="min-h-[44px] min-w-[44px] rounded-md border border-border px-4 text-sm text-text disabled:opacity-50"
              >
                Sonraki
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
