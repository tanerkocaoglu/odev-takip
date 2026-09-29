/**
 * Veli paneli — rapor detayı (spec.md §6 Veli).
 *
 * Ortak `GuardianReportView` (haftanın dört dersi, hepsi açık) + girişli veliye
 * özel **ödev teslim geçmişi**. Teslim/önceki-ödev dosyaları korumalı rotadan
 * (Bearer token) açılır. Aynı rapor gövdesi public `/r/{token}` ile ortaktır;
 * bu sayfa yalnızca teslim geçmişini ve canlı `prev_submissions` verisini ekler.
 */

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { GuardianReportDetail } from "../../types";
import {
  guardianApi,
  openProtectedFile,
  ApiClientError,
} from "../../services/api";
import GuardianReportView from "../../components/customer/GuardianReportView";
import SubmissionHistory from "../../components/customer/SubmissionHistory";
import {
  buttonClass,
  EmptyState,
  ErrorState,
  Skeleton,
  useToast,
} from "../../components/ui";
import HomeworkAttachments from "../../components/HomeworkAttachments";
import SubmissionFileGrid from "../../components/SubmissionFileGrid";

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Yükleniyor…</span>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/guardian" className={buttonClass("ghost", "sm", "-ml-2 mb-3")}>
      <ArrowLeft size={16} aria-hidden="true" />
      Raporlarım
    </Link>
  );
}

export default function GuardianReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<GuardianReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const toast = useToast();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    guardianApi
      .report(id)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : "Rapor yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  async function openFile(key: string) {
    try {
      await openProtectedFile(key);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : "Dosya açılamadı. Yeniden deneyin.",
      );
    }
  }

  if (loading) {
    return (
      <div>
        <BackLink />
        <DetailSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <BackLink />
        <ErrorState
          message={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <BackLink />
        <EmptyState message="Rapor bulunamadı." />
      </div>
    );
  }

  // Bu haftanın puanladığı önceki haftanın ödevi (canlı veri) — sınıf-ders
  // bazında eşlenir; "Verilmiş ödev" satırının altında dosyaları gösterilir.
  const prevByClassCourse = new Map(
    (data.prev_submissions ?? []).map((p) => [p.class_course_id, p]),
  );

  return (
    <div>
      <BackLink />
      <div className="space-y-8">
        <GuardianReportView
          snapshot={data.snapshot}
          variant="guardian"
          sentAt={data.digest.sent_at}
          renderPrevHomework={(course) => {
            const prev = prevByClassCourse.get(course.class_course_id);
            const teacherAttachments = prev?.attachments ?? [];
            const files = prev?.submission?.files ?? [];
            if (teacherAttachments.length === 0 && files.length === 0)
              return null;
            return (
              <div className="mt-2 space-y-2">
                {teacherAttachments.length > 0 && (
                  <div>
                    <p className="text-[13px] text-muted">
                      Öğretmenin eklediği dosyalar
                    </p>
                    <HomeworkAttachments
                      attachments={teacherAttachments}
                      onOpen={(key) => void openFile(key)}
                    />
                  </div>
                )}
                {files.length > 0 && (
                  <div>
                    <p className="text-[13px] text-muted">
                      Öğrencinin bu ödeve yüklediği dosyalar
                    </p>
                    <SubmissionFileGrid
                      variant="server"
                      files={files}
                      collapsible
                      onOpenPdf={(key) => void openFile(key)}
                    />
                  </div>
                )}
              </div>
            );
          }}
        />

        <SubmissionHistory
          submissions={data.submissions}
          onOpenFile={(key) => void openFile(key)}
        />
      </div>
    </div>
  );
}
