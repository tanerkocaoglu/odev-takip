/**
 * ImageLightbox testleri — galeri gezinme, sayaç, klavye, focus trap ve blob
 * URL serbest bırakma (lazy pencere dışına çıkan URL revoke edilir).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImageLightbox, { type LightboxImage } from './components/ImageLightbox';
import { fetchProtectedFileUrl, releaseProtectedFileUrl } from './services/api';

vi.mock('./services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/api')>();
  return {
    ...actual,
    fetchProtectedFileUrl: vi.fn(),
    releaseProtectedFileUrl: vi.fn(),
  };
});

const IMAGES: LightboxImage[] = [
  { key: 'a.jpg', filename: 'a.jpg' },
  { key: 'b.jpg', filename: 'b.jpg' },
  { key: 'c.jpg', filename: 'c.jpg' },
  { key: 'd.jpg', filename: 'd.jpg' },
  { key: 'e.jpg', filename: 'e.jpg' },
];

beforeEach(() => {
  vi.mocked(fetchProtectedFileUrl).mockImplementation(async (key) => `blob:${key}`);
  vi.mocked(releaseProtectedFileUrl).mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('ImageLightbox', () => {
  it('aktif görseli ve sayacı gösterir', async () => {
    render(<ImageLightbox images={IMAGES} initialIndex={2} onClose={() => {}} />);

    expect(await screen.findByAltText('c.jpg')).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('ok butonlarıyla gezinir', async () => {
    render(<ImageLightbox images={IMAGES} initialIndex={0} onClose={() => {}} />);
    await screen.findByAltText('a.jpg');

    expect(screen.queryByRole('button', { name: 'Önceki görsel' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki görsel' }));
    expect(await screen.findByAltText('b.jpg')).toBeInTheDocument();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Önceki görsel' }));
    expect(await screen.findByAltText('a.jpg')).toBeInTheDocument();
  });

  it('klavye ok tuşlarıyla gezinir', async () => {
    render(<ImageLightbox images={IMAGES} initialIndex={0} onClose={() => {}} />);
    await screen.findByAltText('a.jpg');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(await screen.findByAltText('b.jpg')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(await screen.findByAltText('a.jpg')).toBeInTheDocument();
  });

  it('Esc tuşu ve kapatma butonu onClose çağırır', async () => {
    const onClose = vi.fn();
    render(<ImageLightbox images={IMAGES} initialIndex={0} onClose={onClose} />);
    await screen.findByAltText('a.jpg');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('odak modal içine taşınır ve kapanınca tetikleyiciye döner', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Tetikleyici';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <ImageLightbox images={IMAGES} initialIndex={0} onClose={() => {}} />,
    );
    await screen.findByAltText('a.jpg');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Kapat' }));

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('lazy pencere dışına çıkan blob URL serbest bırakılır', async () => {
    render(<ImageLightbox images={IMAGES} initialIndex={0} onClose={() => {}} />);
    await screen.findByAltText('a.jpg');
    // pencere [a,b] yüklendi
    await waitFor(() => expect(fetchProtectedFileUrl).toHaveBeenCalledWith('b.jpg'));

    fireEvent.click(screen.getByRole('button', { name: 'Sonraki görsel' }));
    await screen.findByAltText('b.jpg');

    fireEvent.click(screen.getByRole('button', { name: 'Sonraki görsel' }));
    await screen.findByAltText('c.jpg');
    // pencere [b,c,d] oldu → a dışarıda kaldı ve revoke edilmeli
    await waitFor(() => expect(releaseProtectedFileUrl).toHaveBeenCalledWith('blob:a.jpg'));
  });

  it('portal ile body altına render edilir (transformlu ata içinde fixed bozulmaz)', async () => {
    // `.card-interactive` hover'da `transform` alır; lightbox bu ağacın içinde
    // kalırsa fixed containing block değişir ve hover döngüsü oluşur.
    const { container } = render(
      <div className="card-interactive">
        <ImageLightbox images={IMAGES} initialIndex={0} onClose={() => {}} />
      </div>,
    );
    await screen.findByAltText('a.jpg');
    const dialog = screen.getByRole('dialog');
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.parentElement).toBe(document.body);
  });
});
