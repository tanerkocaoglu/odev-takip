/**
 * Öğrenci "Ödevlerim" — spec.md §5.3, §6 Öğrenci.
 *
 * Telefon öncelikli, comfortable. Durum sekmeleri (Bekleyen / Tamamlanan), hafta ve
 * ders çip şeritleri; bekleyen ödevler yatay kaydırılan kartlardır (masaüstünde
 * ızgara), her kartın altında yükleme paneli. Tamamlananlar liste hâlinde; teslime
 * dosya eklenebilir.
 *
 * Kırmızı çizgi: ekranda yalnızca ders, öğretmen, hafta, açıklama, son tarih ve teslim
 * durumu vardır — puan/not/rapor içeriği/değerlendirme süreci asla.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { StudentHomework } from '../../types';
import { studentApi, ApiClientError } from '../../services/api';
import {
  Button,
  EmptyState,
  ErrorState,
  FilterChip,
  FilterChipRow,
  LoadingState,
  PageHeader,
  Tabs,
} from '../../components/ui';
import { DoneCard, PendingCard } from './HomeworkCards';
import { useHomeworkUploads } from './useHomeworkUploads';

type Tab = 'pending' | 'done';

export default function HomeworkListPage() {
  const [items, setItems] = useState<StudentHomework[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pending');
  const [weekFilter, setWeekFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [activeSlide, setActiveSlide] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await studentApi.homeworks();
      setItems(res.items);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Ödevler yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Filtre (hafta/ders) veya sekme değişince liste her zaman başa döner:
  // yatay carousel başlangıca sarılır, aktif nokta sıfırlanır.
  useEffect(() => {
    setActiveSlide(0);
    const el = railRef.current;
    if (el) el.scrollLeft = 0;
  }, [weekFilter, courseFilter, tab]);

  const weekOptions = [...new Set((items ?? []).map((i) => i.week.week_no))].sort((a, b) => b - a);
  const courseOptions = [...new Set((items ?? []).map((i) => i.course_name))].sort();
  const baseFiltered = (items ?? []).filter(
    (i) =>
      (!weekFilter || String(i.week.week_no) === weekFilter) &&
      (!courseFilter || i.course_name === courseFilter),
  );
  const pendingItems = baseFiltered.filter((i) => !i.submission);
  const doneItems = baseFiltered.filter((i) => i.submission);

  // Tüm dosyalar yüklenince liste yenilenir ve "Tamamlanan" sekmesine geçilir.
  const uploads = useHomeworkUploads(
    useCallback(async () => {
      await load();
      setTab('done');
    }, [load]),
  );

  if (loading) return <LoadingState rows={3} />;

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollBehavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

  function goToSlide(index: number) {
    const clamped = Math.max(0, Math.min(index, pendingItems.length - 1));
    setActiveSlide(clamped);
    const el = railRef.current;
    // sr-only ipucu gibi ek çocuklar sırayı kaydırmasın diye kartlar
    // `data-slide` ile seçilir.
    const card = el?.querySelectorAll<HTMLElement>('[data-slide]')[clamped];
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({
        behavior: scrollBehavior,
        inline: 'center',
        block: 'nearest',
      });
    }
  }

  function scrollRail(dir: -1 | 1) {
    goToSlide(activeSlide + dir);
  }

  // Klavye: sol/sağ ok kartlar arasında gezinir, Home/End başa/sona gider.
  function onRailKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToSlide(activeSlide + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToSlide(activeSlide - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      goToSlide(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      goToSlide(pendingItems.length - 1);
    }
  }

  function onRailScroll() {
    const el = railRef.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>('[data-slide]');
    const step = first && first.offsetWidth ? first.offsetWidth + 16 : el.clientWidth || 1;
    const idx = Math.min(pendingItems.length - 1, Math.max(0, Math.round(el.scrollLeft / step)));
    setActiveSlide(idx);
  }

  const hasItems = (items ?? []).length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ödevlerim"
        description="Ödevini fotoğrafla çekebilir ya da dosya seçebilirsin. Son tarihi ve teslim durumunu buradan takip et."
      />

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {!error && !hasItems && <EmptyState message="Sana verilmiş ödev yok." />}

      {!error && hasItems && (
        <>
          <Tabs
            label="Ödev durumu"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'pending', label: 'Bekleyen', count: pendingItems.length },
              { id: 'done', label: 'Tamamlanan', count: doneItems.length },
            ]}
          />

          <FilterChipRow label="Hafta" hideLabel>
            {[
              { value: '', label: 'Tümü' },
              ...weekOptions.map((w) => ({
                value: String(w),
                label: `Hafta ${w}`,
              })),
            ].map((opt) => (
              <FilterChip
                key={opt.value || 'all'}
                active={weekFilter === opt.value}
                onClick={() => setWeekFilter(opt.value)}
              >
                {opt.label}
              </FilterChip>
            ))}
          </FilterChipRow>

          {courseOptions.length > 1 && (
            <FilterChipRow label="Ders" hideLabel>
              {[
                { value: '', label: 'Tümü' },
                ...courseOptions.map((c) => ({ value: c, label: c })),
              ].map((opt) => (
                <FilterChip
                  key={opt.value || 'all'}
                  active={courseFilter === opt.value}
                  onClick={() => setCourseFilter(opt.value)}
                >
                  {opt.label}
                </FilterChip>
              ))}
            </FilterChipRow>
          )}

          {baseFiltered.length === 0 ? (
            <EmptyState message="Bu filtrelerle ödev bulunamadı." />
          ) : tab === 'pending' ? (
            pendingItems.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                message="Bekleyen ödev yok. Bu listedeki her şeyi tamamladın."
              />
            ) : (
              <div className="relative">
                <div
                  ref={railRef}
                  data-testid="pending-rail"
                  role="group"
                  aria-roledescription="karusel"
                  aria-label="Bekleyen ödevler"
                  tabIndex={0}
                  onKeyDown={onRailKeyDown}
                  onScroll={onRailScroll}
                  className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-1 outline-offset-[-2px] [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0 lg:pb-0 xl:grid-cols-3"
                >
                  <p className="sr-only">Kartlar arasında sol ve sağ ok tuşlarıyla gezinin.</p>
                  {pendingItems.map((item) => (
                    <PendingCard
                      key={item.id}
                      item={item}
                      uploads={uploads}
                      className="w-[90%] shrink-0 sm:w-[400px] lg:w-auto lg:shrink"
                    />
                  ))}
                </div>
                {pendingItems.length > 1 && (
                  // Yalnızca dar ekran: "N / M" sayacı + ince çubuk (nokta sayısı ödevle büyümez).
                  <div className="mt-3 lg:hidden">
                    <div className="flex items-center justify-center gap-4">
                      <Button
                        onClick={() => scrollRail(-1)}
                        disabled={activeSlide === 0}
                        aria-label="Önceki ödev"
                        className="w-11 px-0"
                      >
                        <ChevronLeft size={20} aria-hidden="true" />
                      </Button>
                      <span
                        aria-live="polite"
                        aria-atomic="true"
                        className="tabular min-w-[3.5rem] text-center text-sm font-medium text-muted"
                      >
                        {activeSlide + 1} / {pendingItems.length}
                      </span>
                      <Button
                        onClick={() => scrollRail(1)}
                        disabled={activeSlide === pendingItems.length - 1}
                        aria-label="Sonraki ödev"
                        className="w-11 px-0"
                      >
                        <ChevronRight size={20} aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          ) : doneItems.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              message="Henüz teslim yok. Bir ödev yüklediğinde burada görünecek."
            />
          ) : (
            <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {doneItems.map((item) => (
                <DoneCard key={item.id} item={item} uploads={uploads} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
