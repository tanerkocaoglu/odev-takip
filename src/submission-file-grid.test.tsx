/**
 * SubmissionFileGrid — daralt/ aç (collapsible) davranışı.
 * Eşik 4: >4 dosyada varsayılan daraltılır; `collapsible=false` iken hep açık.
 * PDF'ler de sayıma dahildir; local varyantta kaldırma yalnızca görünenlere.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SubmissionFileGrid from './components/SubmissionFileGrid';
import type { SubmissionFile } from './types';

vi.mock('./services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/api')>();
  return {
    ...actual,
    fetchProtectedThumbUrl: vi.fn(async (key: string) => `blob:thumb-${key}`),
    releaseProtectedFileUrl: vi.fn(),
  };
});

const img = (n: number): SubmissionFile => ({
  key: `k${n}.jpg`,
  filename: `görsel-${n}.jpg`,
  size: 1000,
  mime: 'image/jpeg',
  ext: 'jpg',
});
const pdf = (n: number): SubmissionFile => ({
  key: `p${n}.pdf`,
  filename: `belge-${n}.pdf`,
  size: 2000,
  mime: 'application/pdf',
  ext: 'pdf',
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('SubmissionFileGrid — collapsible', () => {
  it('4 veya daha az dosyada her zaman açık', () => {
    render(
      <SubmissionFileGrid
        variant="server"
        files={[img(1), img(2), img(3), img(4)]}
        collapsible
        onOpenPdf={() => {}}
      />,
    );
    expect(screen.getAllByRole('button', { name: /görselini aç/ })).toHaveLength(4);
    expect(
      screen.queryByRole('button', { name: /dosyanın tümünü göster/ }),
    ).not.toBeInTheDocument();
  });

  it('4\'ten fazlada daraltılır: ilk 4 + "+N daha (toplam M dosya)"; aç/kapa', () => {
    // Sıralı karışık: görsel, pdf, görsel, pdf, görsel, görsel (6)
    const files = [img(1), pdf(1), img(2), pdf(2), img(3), img(4)];
    render(
      <SubmissionFileGrid variant="server" files={files} collapsible onOpenPdf={() => {}} />,
    );

    // Daraltılmışta ilk 4 (2 görsel + 2 pdf)
    expect(screen.getAllByRole('button', { name: /görselini aç/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /PDF dosyasını aç/ })).toHaveLength(2);
    expect(screen.getByText('+2 daha')).toBeInTheDocument();
    expect(screen.getByText('(toplam 6 dosya)')).toBeInTheDocument();

    // Erişilebilirlik + dokunma hedefi
    const toggle = screen.getByRole('button', { name: '6 dosyanın tümünü göster' });
    expect(toggle.className).toContain('min-h-11');
    expect(toggle.className).toContain('min-w-11');

    // Aç → 6 dosya görünür
    fireEvent.click(toggle);
    expect(screen.getAllByRole('button', { name: /görselini aç/ })).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: /PDF dosyasını aç/ })).toHaveLength(2);
    expect(screen.queryByText('+2 daha')).not.toBeInTheDocument();

    // Tekrar daralt
    fireEvent.click(screen.getByRole('button', { name: 'Dosyaları daralt' }));
    expect(screen.getByText('+2 daha')).toBeInTheDocument();
  });

  it('collapsible=false (öğretmen ekranı) her zaman açık kalır', () => {
    const files = [img(1), img(2), img(3), img(4), img(5), pdf(1)];
    render(<SubmissionFileGrid variant="server" files={files} onOpenPdf={() => {}} />);
    expect(screen.getAllByRole('button', { name: /görselini aç/ })).toHaveLength(5);
    expect(screen.getAllByRole('button', { name: /PDF dosyasını aç/ })).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: /dosyanın tümünü göster/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dosyaları daralt' })).not.toBeInTheDocument();
  });

  it('local varyantta daraltmada yalnızca görünen 4 dosyanın kaldır butonu', () => {
    const files = Array.from(
      { length: 6 },
      (_, i) => new File(['x'], `sayfa-${i + 1}.png`, { type: 'image/png' }),
    );
    render(<SubmissionFileGrid variant="local" files={files} collapsible onRemove={() => {}} />);
    expect(screen.getAllByRole('button', { name: /dosyasını kaldır/ })).toHaveLength(4);
    expect(screen.getByText('+2 daha')).toBeInTheDocument();
  });
});
