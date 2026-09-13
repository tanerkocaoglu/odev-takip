/**
 * `resolveBaseUrl` — veliye giden /r/{token} linki için taban URL önceliği.
 * Üretimde `BASE_URL` girilmese bile Render'ın `RENDER_EXTERNAL_URL`'i
 * kullanılmalı; localhost'a düşmemeli.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { resolveBaseUrl } from './env.js';

const KEYS = ['BASE_URL', 'RENDER_EXTERNAL_URL'] as const;
const original: Record<string, string | undefined> = {
  BASE_URL: process.env.BASE_URL,
  RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL,
};

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe('resolveBaseUrl', () => {
  it('açık BASE_URL varsa onu kullanır ve sondaki / temizler', () => {
    process.env.BASE_URL = 'https://okul.example.com/';
    process.env.RENDER_EXTERNAL_URL = 'https://odev-takip.example.com';
    expect(resolveBaseUrl()).toBe('https://okul.example.com');
  });

  it('BASE_URL yoksa Render RENDER_EXTERNAL_URL değerine düşer', () => {
    delete process.env.BASE_URL;
    process.env.RENDER_EXTERNAL_URL = 'https://odev-takip.example.com/';
    expect(resolveBaseUrl()).toBe('https://odev-takip.example.com');
  });

  it('ikisi de yoksa geliştirme varsayılanı localhost', () => {
    delete process.env.BASE_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    expect(resolveBaseUrl()).toBe('http://localhost:5173');
  });

  it('boş/whitespace BASE_URL yok sayılır', () => {
    process.env.BASE_URL = '   ';
    process.env.RENDER_EXTERNAL_URL = 'https://odev-takip.example.com';
    expect(resolveBaseUrl()).toBe('https://odev-takip.example.com');
  });
});
