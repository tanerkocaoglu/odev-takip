/**
 * Öğrenci ödev kartları — bekleyen (yükleme odaklı) ve tamamlanan (teslim + ekleme).
 *
 * Kırmızı çizgi (spec §6): kartta yalnızca ders, öğretmen, hafta, açıklama, son tarih,
 * öğretmenin PDF ekleri ve TESLİM DURUMU vardır — puan, öğretmen notu, rapor içeriği ve
 * değerlendirme süreci asla (bu bileşenlerin props'unda bu alanlar zaten yoktur;
 * `student.test.tsx` "puan yok" testi bunu doğrular).
 */

import { Badge, Card, useToast } from '../../components/ui';
import type { StudentHomework } from '../../types';
import { formatDate, formatDateIst } from '../../utils/date';
import { openProtectedFile, ApiClientError } from '../../services/api';
import HomeworkAttachments from '../../components/HomeworkAttachments';
import SubmissionFileGrid from '../../components/SubmissionFileGrid';
import UploadPanel from './UploadPanel';
import { cardStatus, type CardStatus } from './cardStatus';
import type { useHomeworkUploads } from './useHomeworkUploads';

type Uploads = ReturnType<typeof useHomeworkUploads>;

/** Teslim durumu — renk + ikon + metin (Badge). */
export function SubmissionBadges({ status }: { status: CardStatus }) {
  if (status === 'submitted') return <Badge tone="positive">Yüklendi</Badge>;
  if (status === 'late') return <Badge tone="warning">Geç yüklendi</Badge>;
  if (status === 'overdue') {
    return (
      <span className="flex flex-wrap gap-1">
        <Badge tone="danger">Yüklenmedi</Badge>
        <Badge tone="warning">Son tarih geçti</Badge>
      </span>
    );
  }
  return <Badge tone="neutral">Yüklenmedi</Badge>;
}

function useOpenFile() {
  const toast = useToast();
  return (key: string) => {
    openProtectedFile(key).catch((err) =>
      toast.error(
        err instanceof ApiClientError ? err.message : 'Dosya açılamadı. Yeniden deneyin.',
      ),
    );
  };
}

function CardHeader({ item, status }: { item: StudentHomework; status: CardStatus }) {
  return (
    <div>
      <p className="text-base font-semibold text-text">
        {item.course_name} · {item.teacher_name}
      </p>
      <p className="tabular mt-0.5 text-[13px] text-muted">
        Hafta {item.week.week_no} · {item.week.label}
      </p>
      <div className="mt-2">
        <SubmissionBadges status={status} />
      </div>
    </div>
  );
}

/** Bekleyen kart: açıklama + son tarih + ekler, altında yükleme paneli. */
export function PendingCard({
  item,
  uploads,
  className,
}: {
  item: StudentHomework;
  uploads: Uploads;
  className: string;
}) {
  const status = cardStatus(item);
  const openFile = useOpenFile();
  return (
    <article data-status={status} data-slide className={'snap-center ' + className}>
      <Card padding="lg" className="flex h-full flex-col gap-4">
        <CardHeader item={item} status={status} />

        <div>
          <p className="whitespace-pre-wrap text-base leading-relaxed text-text">
            {item.description}
          </p>
          <p className="tabular mt-2 text-sm text-muted">
            Son tarih: <span className="font-medium text-text">{formatDate(item.due_date)}</span>
          </p>
        </div>

        {(item.attachments ?? []).length > 0 && (
          <HomeworkAttachments
            size="comfortable"
            attachments={item.attachments ?? []}
            onOpen={openFile}
          />
        )}

        <UploadPanel homeworkId={item.id} uploads={uploads} serverCount={0} mode="new" />
      </Card>
    </article>
  );
}

/** Tamamlanan kart: teslim edilen dosyalar + ekleme (30 sınırı sunucu dosyalarını sayar). */
export function DoneCard({ item, uploads }: { item: StudentHomework; uploads: Uploads }) {
  const status = cardStatus(item);
  const openFile = useOpenFile();
  return (
    <article data-status={status}>
      <Card padding="lg" className="space-y-4">
        <CardHeader item={item} status={status} />

        <div>
          <p className="whitespace-pre-wrap text-base leading-relaxed text-text">
            {item.description}
          </p>
          <p className="tabular mt-2 text-sm text-muted">
            Son tarih: {formatDate(item.due_date)}
            {item.submission && <> · Teslim: {formatDateIst(item.submission.submitted_at)}</>}
          </p>
        </div>

        {(item.attachments ?? []).length > 0 && (
          <HomeworkAttachments
            size="comfortable"
            attachments={item.attachments ?? []}
            onOpen={openFile}
          />
        )}

        {item.submission && (
          <SubmissionFileGrid
            variant="server"
            files={item.submission.files}
            collapsible
            onOpenPdf={openFile}
          />
        )}

        <div className="border-t border-border pt-4">
          <UploadPanel
            homeworkId={item.id}
            uploads={uploads}
            serverCount={item.submission?.files.length ?? 0}
            mode="append"
          />
        </div>
      </Card>
    </article>
  );
}
