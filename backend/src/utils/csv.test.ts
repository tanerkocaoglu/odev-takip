import { describe, expect, it } from 'vitest';
import { csvToRecords, parseCsv, toCsv, UTF8_BOM } from './csv.js';

describe('toCsv', () => {
  interface Row {
    ad: string;
    not: string | null;
    sayi: number;
  }
  const columns = [
    { header: 'Ad', value: (r: Row) => r.ad },
    { header: 'Not', value: (r: Row) => r.not },
    { header: 'Sayı', value: (r: Row) => r.sayi },
  ];

  it('başlık + satırları CRLF ile üretir', () => {
    const csv = toCsv([{ ad: 'Ayşe', not: null, sayi: 3 }], columns);
    expect(csv).toBe('Ad,Not,Sayı\r\nAyşe,,3\r\n');
  });

  it('virgül, tırnak ve satır sonu içeren alanları kaçırır', () => {
    const csv = toCsv(
      [{ ad: 'Yılmaz, Ayşe "A"', not: 'satır1\nsatır2', sayi: 1 }],
      columns,
    );
    expect(csv).toBe(
      'Ad,Not,Sayı\r\n"Yılmaz, Ayşe ""A""","satır1\nsatır2",1\r\n',
    );
  });

  it('bom:true başa UTF-8 BOM ekler', () => {
    const csv = toCsv([], columns, { bom: true });
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv.slice(1)).toBe('Ad,Not,Sayı\r\n');
  });
});

describe('parseCsv', () => {
  it('BOM ve CRLF ile tırnaklı alanı ayrıştırır', () => {
    const rows = parseCsv(UTF8_BOM + 'Ad,Sınıf\r\n"Ayşe, A.",7\r\n');
    expect(rows).toEqual([
      ['Ad', 'Sınıf'],
      ['Ayşe, A.', '7'],
    ]);
  });

  it('LF satır sonunu ve kaçırılmış tırnağı destekler', () => {
    const rows = parseCsv('a,b\n"x ""y""",z');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x "y"', 'z'],
    ]);
  });

  it('alan içi satır sonunu korur', () => {
    const rows = parseCsv('a\n"satır1\nsatır2"');
    expect(rows).toEqual([['a'], ['satır1\nsatır2']]);
  });

  it('boş girdi boş dizi döner', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('csvToRecords', () => {
  it('başlıkları trim edip kayıtları eşler; eksik hücre boş olur', () => {
    const { headers, records } = csvToRecords(
      'ogrenci_adi, dershane_sinifi ,veli_adi\nAli,ÖKLİD\n',
    );
    expect(headers).toEqual(['ogrenci_adi', 'dershane_sinifi', 'veli_adi']);
    expect(records).toEqual([
      { ogrenci_adi: 'Ali', dershane_sinifi: 'ÖKLİD', veli_adi: '' },
    ]);
  });
});
