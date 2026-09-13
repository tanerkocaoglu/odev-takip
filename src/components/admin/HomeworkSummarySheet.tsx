/**
 * Haftalık ödev özeti görseli — WhatsApp grubuna paylaşılacak **dışa dönük**
 * belge. Admin arayüzünün teal kimliği yerine marka mavisi (`.brand-scope`)
 * taşır; ekranda render edilen hâli `html-to-image` ile birebir PNG'ye çevrilir.
 *
 * Sabit genişlik (720px) sayesinde çıktı, adminin ekran boyutundan bağımsız ve
 * tutarlıdır. Eksik ders satırı atlanmaz → "Rapor girilmedi".
 */

import BrandLogo from '../BrandLogo';
import type { HomeworkSummary } from '../../types';

export default function HomeworkSummarySheet({ summary }: { summary: HomeworkSummary }) {
  return (
    <div className="brand-scope w-[720px] flex-none overflow-hidden rounded-2xl border border-border bg-surface">
      <header className="brand-panel px-8 py-6 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded bg-white p-1">
            <BrandLogo className="h-10 w-10 object-contain" />
          </span>
          <p className="text-sm font-semibold uppercase tracking-wide">
            Ödev Takip
          </p>
        </div>
      </header>

      <div className="px-8 pb-4 pt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          {summary.class.name}
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-text">
          {summary.relative_week_no}. Haftanın Ödevleri
        </h2>
        <p className="tabular mt-1 text-sm text-muted">{summary.week.label}</p>
      </div>

      <table className="w-full border-t border-border text-sm">
        <thead>
          <tr className="bg-bg text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <th className="w-[22%] px-8 py-2.5">Öğretmen</th>
            <th className="w-[20%] px-2 py-2.5">Ders</th>
            <th className="px-8 py-2.5">Yapılacak ödev</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((row) => (
            <tr key={row.class_course_id} className="border-t border-border align-top">
              <td className="px-8 py-3 font-medium text-text">{row.teacher_name}</td>
              <td className="px-2 py-3 text-text">{row.course_name}</td>
              <td className="px-8 py-3 text-text">
                {row.status === 'missing' || !row.homework_description ? (
                  <span className="italic text-muted">Rapor girilmedi</span>
                ) : (
                  <span className="whitespace-pre-wrap">{row.homework_description}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="px-8 py-4 text-right text-xs text-muted">
        Bu görsel ödev takip sisteminden oluşturulmuştur.
      </footer>
    </div>
  );
}
