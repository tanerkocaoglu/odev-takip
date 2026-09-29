/**
 * Haftalık ödev özeti görseli — WhatsApp grubuna paylaşılacak **dışa dönük** belge.
 * Ekranda render edilen hâli `html-to-image` ile birebir PNG'ye çevrilir.
 *
 * WhatsApp'ta telefon genişliğine (~375px) sığdırılarak gösterilir; bu yüzden sabit genişlik
 * 400px'tir (720px'te yazı ~%50 küçülüp okunmaz). Tablo yerine ders başına blok:
 * ders adı + öğretmen, altında ödev metni (16px). Eksik ders satırı atlanmaz → "Rapor girilmedi"
 * (italik DEĞİL: yalnızca 400/500/600 dik ağırlıklar yüklüdür, italik sahte eğim olurdu).
 * Zemin teal wordmark şeridi + beyaz gövde; kenar yarıçapı/kenarlık yok (PNG kenardan kenara).
 */

import { BookOpen } from 'lucide-react';
import BrandLogo from '../BrandLogo';
import type { HomeworkSummary } from '../../types';
import { Badge } from '../ui';

export default function HomeworkSummarySheet({ summary }: { summary: HomeworkSummary }) {
  return (
    <div className="w-[400px] flex-none overflow-hidden bg-surface">
      <header className="bg-accent px-6 py-4 text-accent-fg">
        <BrandLogo tone="inverse" size="md" />
      </header>

      <div className="px-6 pb-4 pt-5">
        <p className="text-sm font-semibold text-accent">{summary.class.name}</p>
        <h2 className="mt-1 text-2xl font-semibold text-text">
          {summary.relative_week_no}. Haftanın Ödevleri
        </h2>
        <p className="tabular mt-1 text-sm text-muted">{summary.week.label}</p>
      </div>

      <ul className="border-t border-border">
        {summary.rows.map((row) => (
          <li key={row.class_course_id} className="border-b border-border px-6 py-4">
            <div className="flex items-start gap-2">
              <BookOpen size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
              <div className="min-w-0">
                <p className="text-base font-semibold text-text">{row.course_name}</p>
                <p className="text-sm text-muted">{row.teacher_name}</p>
              </div>
            </div>
            <div className="mt-2 pl-[26px] text-base text-text">
              {row.status === 'missing' || !row.homework_description ? (
                <Badge tone="warning">Rapor girilmedi</Badge>
              ) : (
                <span className="whitespace-pre-wrap break-words">{row.homework_description}</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <footer className="px-6 py-3 text-right text-xs text-muted">
        Bu görsel ödev takip sisteminden oluşturulmuştur.
      </footer>
    </div>
  );
}
