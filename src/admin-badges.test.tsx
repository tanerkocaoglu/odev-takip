/**
 * Paylaşılan rozet sözleşmeleri — durum ayrımları görsel olarak kaybolmasın.
 * Renkler token sınıflarıyla sınanır (jsdom CSS değişkenlerini çözmez).
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AttendanceBadge, StatusBadge } from './components/admin/ui';

function classOf(node: HTMLElement) {
  return node.firstElementChild?.className ?? '';
}

describe('AttendanceBadge', () => {
  it('dört devamsızlık durumu dört ayrı renk sınıfı taşır', () => {
    const present = render(<AttendanceBadge attendance="present" />).container;
    const late = render(<AttendanceBadge attendance="late" />).container;
    const absent = render(<AttendanceBadge attendance="absent" />).container;
    const excused = render(<AttendanceBadge attendance="excused" />).container;

    const classes = [classOf(present), classOf(late), classOf(absent), classOf(excused)];
    expect(new Set(classes).size).toBe(4);

    expect(classes[0]).toContain('text-status-draft'); // Geldi — nötr gri
    expect(classes[1]).toContain('text-att-late'); // Geç geldi — amber
    expect(classes[2]).toContain('text-danger'); // Gelmedi — kırmızı
    expect(classes[3]).toContain('text-status-completed'); // İzinli — mavi
  });
});

describe('StatusBadge', () => {
  it('Tamamlandı mavi, Gönderildi yeşil, Taslak gri kalır', () => {
    const completed = render(<StatusBadge status="completed" />).container;
    const sent = render(<StatusBadge status="sent" />).container;
    const draft = render(<StatusBadge status="draft" />).container;

    expect(classOf(completed)).toContain('text-status-completed');
    expect(classOf(sent)).toContain('text-status-sent');
    expect(classOf(draft)).toContain('text-status-draft');
    expect(classOf(completed)).not.toBe(classOf(sent));
  });
});
