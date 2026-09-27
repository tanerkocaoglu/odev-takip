import { describe, it, expect } from 'vitest';
import { normalizeTurkish } from './text.js';

describe('normalizeTurkish', () => {
  it('temel Türkçe karakterleri ASCII\'ye çevirir', () => {
    expect(normalizeTurkish('Öğrenci')).toBe('ogrenci');
    expect(normalizeTurkish('ŞÜKRÜ ÇAKIR')).toBe('sukru cakir');
    expect(normalizeTurkish('İstanbul')).toBe('istanbul');
  });

  it('İIıi davranışı: hepsi i olur', () => {
    expect(normalizeTurkish('İIıi')).toBe('iiii');
    expect(normalizeTurkish('I')).toBe('i');
    expect(normalizeTurkish('ı')).toBe('i');
  });

  it('karışık cümlede tam ASCII çıktısı üretir', () => {
    expect(normalizeTurkish('ĞÜŞİÖÇ ğüşıöç')).toBe('gusioc gusioc');
  });

  it('ASCII girişi değiştirmez', () => {
    expect(normalizeTurkish('Ornek Kisi 8 123')).toBe('ornek kisi 8 123');
  });

  it('boş giriş boş döner', () => {
    expect(normalizeTurkish('')).toBe('');
  });

  it('sonuç arama sorgusuyla birebir eşleşir (yardımcı kullanım)', () => {
    // Yazma ve arama aynı fonksiyondan geçtiği için eşitlik garanti.
    const stored = normalizeTurkish('Öğrenci Adı');
    const searchQuery = normalizeTurkish('OGRENCİ ADI');
    expect(stored).toBe(searchQuery);
  });
});