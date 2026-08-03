import { useParams } from 'react-router-dom';

export default function TokenReportPage() {
  const { token } = useParams<{ token: string }>();

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-8">
        <div className="rounded-md border border-border bg-surface p-6 text-center">
          <h1 className="text-2xl font-semibold text-text">Haftalık rapor</h1>
          <p className="mt-2 text-sm text-muted">
            Veli rapor sayfası Aşama 5'te eklenecek. Token:{' '}
            <span className="tabular font-medium text-text">
              {token ? token.slice(0, 12) + '…' : '(yok)'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}