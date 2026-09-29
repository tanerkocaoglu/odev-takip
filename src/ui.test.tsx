/**
 * Ortak UI bileşenleri — Modal odak yönetimi, onay diyaloğu, toast, wordmark.
 */

import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  Badge,
  Button,
  ConfirmDialog,
  CountChip,
  LoadingState,
  Modal,
  SearchBox,
  ToastProvider,
  useToast,
} from './components/ui';
import BrandLogo from './components/BrandLogo';

function ModalHost() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Aç</button>
      <Modal open={open} title="Örnek" onClose={() => setOpen(false)}>
        <input aria-label="Ad" />
        <Button>Bitir</Button>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('açılınca odak diyaloğa girer, Tab içeride döner, Escape kapatıp odağı geri verir', () => {
    render(<ModalHost />);
    const opener = screen.getByRole('button', { name: 'Aç' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Örnek' });
    // İlk odak gövdedeki ilk alan (kapat düğmesi değil)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Ad' }));
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Son öğeden Tab → ilke (kapat düğmesi) döner
    screen.getByRole('button', { name: 'Bitir' }).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Kapat' }));

    // İlk öğeden Shift+Tab → sona döner
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bitir' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('ConfirmDialog', () => {
  it('eylemi adıyla söyler; onay ve vazgeç çağrılarını iletir', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Öğrenciyi sil"
        confirmLabel="Öğrenciyi sil"
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        Bu işlem geri alınamaz.
      </ConfirmDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Öğrenciyi sil' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('Toast', () => {
  function Trigger() {
    const toast = useToast();
    return <button onClick={() => toast.success('Kaydedildi.')}>Tetikle</button>;
  }

  it('canlı bölgede gösterilir ve süre dolunca kaybolur', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Tetikle'));
    expect(screen.getByRole('status')).toHaveTextContent('Kaydedildi.');
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.getByRole('status')).not.toHaveTextContent('Kaydedildi.');
    vi.useRealTimers();
  });

  it('sağlayıcı olmadan çağrılınca hata fırlatmaz', () => {
    render(<Trigger />);
    expect(() => fireEvent.click(screen.getByText('Tetikle'))).not.toThrow();
  });
});

describe('BrandLogo', () => {
  it('her varyantta erişilebilir adı "Ödev Takip"tir', () => {
    const { rerender } = render(<BrandLogo />);
    expect(screen.getByRole('img', { name: 'Ödev Takip' })).toBeInTheDocument();
    rerender(<BrandLogo variant="mark" />);
    expect(screen.getByRole('img', { name: 'Ödev Takip' })).toBeInTheDocument();
  });
});

describe('LoadingState', () => {
  it('ekran okuyucuya "Yükleniyor…" duyurur', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('Yükleniyor…');
  });
});

describe('CountChip', () => {
  it('yalnızca sayıyı gösterir: ikon yok (durum rozetinden ayrı)', () => {
    const { container } = render(<CountChip value={14} />);
    expect(container).toHaveTextContent('14');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('nötr durum rozeti çizgi (eksi) ikonu taşımaz', () => {
    const { container } = render(<Badge tone="neutral">Taslak</Badge>);
    expect(container.querySelector('svg.lucide-minus')).toBeNull();
  });
});

describe('SearchBox', () => {
  function Host() {
    const [q, setQ] = useState('');
    return <SearchBox value={q} onChange={setQ} placeholder="Ara…" label="Öğrenci ara" />;
  }

  it('boşken temizleme düğmesi yok; yazınca çıkar, tıklayınca temizler ve odağı kutuya verir', () => {
    render(<Host />);
    const box = screen.getByRole('searchbox', { name: 'Öğrenci ara' });
    expect(screen.queryByRole('button', { name: /temizle/ })).toBeNull();
    fireEvent.change(box, { target: { value: 'şükrü' } });
    const clear = screen.getByRole('button', { name: 'Öğrenci ara kutusunu temizle' });
    fireEvent.click(clear);
    expect(box).toHaveValue('');
    expect(box).toHaveFocus();
    expect(screen.queryByRole('button', { name: /temizle/ })).toBeNull();
  });

  it('yerel tarayıcı "×" düğmesi gizlenir', () => {
    render(<Host />);
    expect(screen.getByRole('searchbox').className).toContain(
      '[&::-webkit-search-cancel-button]:hidden',
    );
  });
});
