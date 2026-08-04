import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { HealthResponse } from '../types';
import { useAuth } from '../context/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Yönetici',
  teacher: 'Öğretmen',
  guardian: 'Veli',
  student: 'Öğrenci',
};

function StatusBadge({ status }: { status: 'draft' | 'completed' | 'sent' }) {
  const styles = {
    draft: 'bg-status-draft/10 text-status-draft',
    completed: 'bg-status-completed/10 text-status-completed',
    sent: 'bg-status-sent/10 text-status-sent',
  } as const;

  const labels = {
    draft: 'Taslak',
    completed: 'Tamamlandı',
    sent: 'Gönderildi',
  } as const;

  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
        'tabular ' +
        styles[status]
      }
    >
      {labels[status]}
    </span>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    fetch('/api/v1/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setHealth(data))
      .catch(() => setHealth(null));
  }, []);

  // Rol bazlı paneller hazır: giriş sonrası ana sayfa role göre yönlendirir.
  const roleHome =
    user?.role === 'student'
      ? '/student'
      : user?.role === 'teacher'
        ? '/teacher'
        : user?.role === 'admin'
          ? '/admin'
          : null;
  if (roleHome) return <Navigate to={roleHome} replace />;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text">Ana sayfa</h1>

      {user && (
        <section className="rounded-md border border-border bg-surface p-6">
          <p className="text-sm text-muted">
            Hoş geldin,{' '}
            <span className="font-semibold text-text">{user.full_name}</span>.
          </p>
          <p className="mt-1 text-sm text-muted">
            Giriş türü: <span className="font-medium text-text">{ROLE_LABELS[user.role]}</span>.
            Rolünüze özel panel sonraki aşamalarda eklenecek.
          </p>
        </section>
      )}

      <section className="rounded-md border border-border bg-surface p-6">
        <h2 className="text-base font-semibold text-text">
          Aşama 0 — iskelet doğrulaması
        </h2>
        <p className="mt-1 text-sm text-muted">
          Bu ekrandaki buton, giriş alanı ve durum rozetleri tasarım
          token'larından türetilmiştir. Klavye odağında halka çıkmalıdır.
        </p>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:opacity-90"
            >
              Raporu tamamla
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg"
            >
              İptal
            </button>
          </div>

          <div>
            <label
              htmlFor="sample-input"
              className="mb-1 block text-sm font-medium text-muted"
            >
              İşlenen konu
            </label>
            <input
              id="sample-input"
              type="text"
              placeholder="Bu hafta işlenen konu…"
              className="h-8 w-full max-w-sm rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted"
            />
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-muted">
              Rapor durumu
            </span>
            <div className="flex flex-wrap gap-3">
              <StatusBadge status="draft" />
              <StatusBadge status="completed" />
              <StatusBadge status="sent" />
            </div>
          </div>

          <div className="text-sm">
            API durumu:{' '}
            {health ? (
              <span className="font-medium text-status-sent">
                çalışıyor (v{health.version})
              </span>
            ) : (
              <span className="font-medium text-att-absent">
                erişilemiyor — backend'i başlatın
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}