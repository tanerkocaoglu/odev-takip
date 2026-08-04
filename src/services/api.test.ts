/**
 * API istemcisi birim testleri — fetch mock'lu.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  apiFetch,
  authApi,
  ApiClientError,
  getToken,
  setToken,
  clearToken,
} from './api';

const BASE_URL = '/api/v1';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiFetch', () => {
  it('token varsa Authorization header ekler', async () => {
    setToken('abc');
    const fetchMock = mockFetch(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/auth/me');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer abc' });
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    vi.unstubAllGlobals();
  });

  it('hata yanıtını ApiClientError olarak fırlatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(401, {
        error: { code: 'UNAUTHORIZED', message: 'Oturum geçersiz.' },
      }),
    );

    await expect(apiFetch('/auth/me')).rejects.toThrow(ApiClientError);
    await expect(apiFetch('/auth/me')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Oturum geçersiz.',
    });
    vi.unstubAllGlobals();
  });

  it('401 yanıtında token temizlenir', async () => {
    setToken('abc');
    vi.stubGlobal(
      'fetch',
      mockFetch(401, {
        error: { code: 'UNAUTHORIZED', message: 'Oturum geçersiz.' },
      }),
    );

    await apiFetch('/auth/me').catch(() => undefined);
    expect(getToken()).toBeNull();
    vi.unstubAllGlobals();
  });

  it('validasyon hataları fields ile gelir', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Girilen bilgiler geçersiz.',
          fields: { email: 'Geçerli bir e-posta adresi girin.' },
        },
      }),
    );

    const err = await apiFetch('/auth/login', { method: 'POST' }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).fields).toEqual({
      email: 'Geçerli bir e-posta adresi girin.',
    });
    vi.unstubAllGlobals();
  });
});

describe('authApi', () => {
  it('login doğru endpoint ve gövdeyle çağırır', async () => {
    const fetchMock = mockFetch(200, { token: 't', user: { id: '1' } });
    vi.stubGlobal('fetch', fetchMock);

    const res = await authApi.login({ email: 'a@b.c', password: 'x' });

    expect(res).toMatchObject({ token: 't' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/auth/login`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'a@b.c', password: 'x' });
    vi.unstubAllGlobals();
  });

  it('requestOtp / verifyOtp / me uçları tanımlıdır', () => {
    expect(typeof authApi.requestOtp).toBe('function');
    expect(typeof authApi.verifyOtp).toBe('function');
    expect(typeof authApi.me).toBe('function');
  });
});

describe('token yardımcıları', () => {
  it('set/get/clear döngüsü çalışır', () => {
    expect(getToken()).toBeNull();
    setToken('tok');
    expect(getToken()).toBe('tok');
    clearToken();
    expect(getToken()).toBeNull();
  });
});
