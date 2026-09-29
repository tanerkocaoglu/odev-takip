import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DataTable, ListState, RowMenu } from './components/ui';

const items = (spy = vi.fn(), del = vi.fn()) => [
  { label: 'Düzenle', onSelect: spy },
  { label: 'Şifre sıfırla', onSelect: vi.fn(), disabled: true },
  { label: 'Sil', onSelect: del, danger: true },
];

/** Odaktaki öğeye tuş gönderir (user-event bağımlılığı yok). */
function key(k: string) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: k });
}
const click = (el: HTMLElement) => fireEvent.click(el);

describe('RowMenu', () => {
  it('düğme adı satırı söyler ve menü kapalı başlar', () => {
    render(<RowMenu label="Ali Yılmaz" items={items()} />);
    const trigger = screen.getByRole('button', { name: 'Ali Yılmaz için işlemler' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Enter ile açılır, ilk etkin öğeye odaklanır; ↓ devre dışı öğeyi atlar', async () => {
    render(<RowMenu label="Ali" items={items()} />);
    click(screen.getByRole('button', { name: 'Ali için işlemler' }));
    expect(await screen.findByRole('menuitem', { name: 'Düzenle' })).toHaveFocus();
    key('ArrowDown');
    expect(screen.getByRole('menuitem', { name: 'Sil' })).toHaveFocus();
    key('ArrowDown');
    expect(screen.getByRole('menuitem', { name: 'Düzenle' })).toHaveFocus();
    key('End');
    expect(screen.getByRole('menuitem', { name: 'Sil' })).toHaveFocus();
  });

  it('↑ ile açılınca sonuncuya odaklanır', async () => {
    render(<RowMenu label="Ali" items={items()} />);
    screen.getByRole('button', { name: 'Ali için işlemler' }).focus();
    key('ArrowUp');
    expect(await screen.findByRole('menuitem', { name: 'Sil' })).toHaveFocus();
  });

  it('Escape kapatır ve odak tetikleyiciye döner', async () => {
    render(<RowMenu label="Ali" items={items()} />);
    const trigger = screen.getByRole('button', { name: 'Ali için işlemler' });
    click(trigger);
    await screen.findByRole('menu');
    key('Escape');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('eylem seçilince çağrılır, menü kapanır, odak tetikleyicide', async () => {
    const spy = vi.fn();
    render(<RowMenu label="Ali" items={items(spy)} />);
    const trigger = screen.getByRole('button', { name: 'Ali için işlemler' });
    click(trigger);
    click(await screen.findByRole('menuitem', { name: 'Düzenle' }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('devre dışı öğe seçilemez; yıkıcı öğe ayırıcıdan sonra gelir', async () => {
    render(<RowMenu label="Ali" items={items()} />);
    click(screen.getByRole('button', { name: 'Ali için işlemler' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Şifre sıfırla' })).toBeDisabled();
    expect(within(menu).getByRole('separator')).toBeInTheDocument();
  });

  it('harf tuşu ilk eşleşen öğeye atlar (Türkçe büyük/küçük)', async () => {
    render(<RowMenu label="Ali" items={items()} />);
    click(screen.getByRole('button', { name: 'Ali için işlemler' }));
    await screen.findByRole('menu');
    key('s');
    expect(screen.getByRole('menuitem', { name: 'Sil' })).toHaveFocus();
  });

  it('dışarı tıklayınca kapanır', async () => {
    render(
      <div>
        <button>dış</button>
        <RowMenu label="Ali" items={items()} />
      </div>,
    );
    click(screen.getByRole('button', { name: 'Ali için işlemler' }));
    await screen.findByRole('menu');
    fireEvent.mouseDown(screen.getByRole('button', { name: 'dış' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

interface Row {
  id: string;
  name: string;
  no: number;
}
const rows: Row[] = [
  { id: '1', name: 'İbrahim Şükrü Ğüneş', no: 12 },
  { id: '2', name: 'Işıl Öztürk', no: 7 },
];
const cols = [
  { key: 'name', header: 'Ad', cell: (r: Row) => r.name, card: 'title' as const },
  { key: 'no', header: 'Numara', cell: (r: Row) => r.no, className: 'tabular' },
];

function mockMatchMedia(mobile: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (q: string) =>
      ({
        matches: mobile,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

describe('DataTable', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('masaüstünde tablo + satır menüsü', () => {
    render(
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(r) => r.id}
        rowLabel={(r) => r.name}
        actions={() => items()}
      />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Ad',
      'Numara',
      'İşlemler',
    ]);
    expect(screen.getByRole('button', { name: 'Işıl Öztürk için işlemler' })).toBeInTheDocument();
  });

  it('dar ekranda kart listesi (tablo yok), etiketli alanlar ve menü', () => {
    mockMatchMedia(true);
    render(
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(r) => r.id}
        rowLabel={(r) => r.name}
        actions={() => items()}
      />,
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('İbrahim Şükrü Ğüneş')).toBeInTheDocument();
    expect(screen.getAllByText('Numara')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'İbrahim Şükrü Ğüneş için işlemler' }),
    ).toBeInTheDocument();
  });

  it('mobile="scroll" dar ekranda da tablo kalır', () => {
    mockMatchMedia(true);
    render(
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(r) => r.id}
        rowLabel={(r) => r.name}
        mobile="scroll"
      />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

describe('ListState', () => {
  const base = { empty: false, emptyMessage: 'Kayıt yok.' };
  it('hata > yükleniyor > boş > içerik sırası', () => {
    const { rerender } = render(
      <ListState {...base} loading={false} error="Bağlantı koptu." onRetry={() => {}}>
        <p>içerik</p>
      </ListState>,
    );
    expect(screen.getByText('Bağlantı koptu.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yeniden dene/i })).toBeInTheDocument();
    rerender(
      <ListState {...base} loading>
        <p>içerik</p>
      </ListState>,
    );
    expect(screen.queryByText('içerik')).toBeNull();
    rerender(
      <ListState {...base} loading={false} empty>
        <p>içerik</p>
      </ListState>,
    );
    expect(screen.getByText('Kayıt yok.')).toBeInTheDocument();
    rerender(
      <ListState {...base} loading={false}>
        <p>içerik</p>
      </ListState>,
    );
    expect(screen.getByText('içerik')).toBeInTheDocument();
  });
});
