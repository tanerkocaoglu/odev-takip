/**
 * Veli paneli — rapor detayı (spec.md §6 Veli).
 *
 * Ortak `GuardianReportView` (haftanın dört dersi, hepsi açık) + girişli veliye
 * özel **ödev teslim geçmişi**. Teslim/önceki-ödev dosyaları korumalı rotadan
 * (Bearer token) açılır. Aynı rapor gövdesi public `/r/{token}` ile ortaktır;
 * bu sayfa yalnızca teslim geçmişini ve canlı `prev_submissions` verisini ekler.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { GuardianReportDetail } from '../../types';
import { guardianApi, openProtectedFile, ApiClientError } from '../../services/api';
import GuardianReportView from '../../components/customer/GuardianReportView';
import SubmissionHistory from '../../components/customer/SubmissionHistory';
import SubmissionFileGrid from '../../components/SubmissionFileGrid';

function DetailSkeleton() {
  return (
    <div className="customer-face space-y-4" aria-hidden="true">
      <div className="shimmer h-32 w-full rounded-3xl" />
      <div className="shimmer h-12 w-full rounded-2xl" />
      <div className="shimmer h-64 w-full rounded-2xl" />
      <div className="shimmer h-64 w-full rounded-2xl" />
    </div>
  );
}

export default function GuardianReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<GuardianReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          setError(err instanceof ApiClientError ? err.message : 'Bir hata oluştu.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function openFile(key: string) {
    try {
      await openProtectedFile(key);
    } catch (err) {
      window.alert(err instanceof ApiClientError ? err.message : 'Dosya açılamadı.');
    }
  }

  if (loading) return <DetailSkeleton />;

  if (error) {
    return (
      <p role="alert" className="text-sm font-medium text-sub-missing">
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-surface/60 py-14 text-center">
        <p className="text-sm font-medium text-text">Rapor bulunamadı</p>
      </div>
    );
  }

  // Bu haftanın puanladığı önceki haftanın ödevi (canlı veri) — sınıf-ders
  // bazında eşlenir; "Verilmiş ödev" satırının altında dosyaları gösterilir.
  const prevByClassCourse = new Map(
    (data.prev_submissions ?? []).map((p) => [p.class_course_id, p]),
  );

  return (
    <div className="space-y-10">
      <GuardianReportView
        snapshot={data.snapshot}
        variant="guardian"
        sentAt={data.digest.sent_at}
        renderPrevHomework={(course) => {
          const prev = prevByClassCourse.get(course.class_course_id);
          const files = prev?.submission?.files ?? [];
          if (files.length === 0) return null;
          return (
            <div className="mt-2">
              <p className="text-xs text-muted">
                Öğrencinin bu ödeve yüklediği dosyalar
              </p>
              <SubmissionFileGrid
                variant="server"
                files={files}
                collapsible
                onOpenPdf={(key) => void openFile(key)}
              />
            </div>
          );
        }}
      />

      <SubmissionHistory
        submissions={data.submissions}
        onOpenFile={(key) => void openFile(key)}
      />
    </div>
  );
}
