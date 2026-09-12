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
  openProtectedFile,
  fetchProtectedThumbUrl,
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

    const res = await authApi.login({ identifier: 'a@b.c', password: 'x' });

    expect(res).toMatchObject({ token: 't' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/auth/login`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ identifier: 'a@b.c', password: 'x' });
    vi.unstubAllGlobals();
  });

  it('me ucu tanımlıdır', () => {
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

describe('openProtectedFile', () => {
  it('token yokken 401 fırlatır ve fetch çağrılmaz', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(openProtectedFile('k.jpg')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('Bearer token ile dosyayı çeker, blob URL üretip yeni sekmede açar', async () => {
    setToken('abc');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['x'], { type: 'image/jpeg' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    const OriginalURL = globalThis.URL;
    vi.stubGlobal(
      'URL',
      class extends OriginalURL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      },
    );
    const open = vi.spyOn(window, 'open').mockImplementation(() => null as unknown as Window);
    vi.useFakeTimers();

    await openProtectedFile('abc.jpg');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/files/abc.jpg`);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer abc' });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('blob:fake', '_blank', 'noreferrer');

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('401 yanıtında token temizlenir ve ApiClientError fırlatılır', async () => {
    setToken('abc');
    vi.stubGlobal(
      'fetch',
      mockFetch(401, { error: { code: 'UNAUTHORIZED', message: 'Oturum geçersiz.' } }),
    );

    await expect(openProtectedFile('k.jpg')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Oturum geçersiz.',
    });
    expect(getToken()).toBeNull();
    vi.unstubAllGlobals();
  });

  it('hata yanıtındaki sunucu mesajı kullanılır', async () => {
    setToken('abc');
    vi.stubGlobal(
      'fetch',
      mockFetch(403, { error: { code: 'FORBIDDEN', message: 'Erişim yok.' } }),
    );

    const err = await openProtectedFile('k.jpg').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ status: 403, message: 'Erişim yok.' });
    vi.unstubAllGlobals();
  });
});

describe('fetchProtectedThumbUrl', () => {
  it('thumbnail ucuna (/files/:key/thumb) gider ve blob URL döner', async () => {
    setToken('abc');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['x'], { type: 'image/jpeg' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn(() => 'blob:thumb');
    const OriginalURL = globalThis.URL;
    vi.stubGlobal(
      'URL',
      class extends OriginalURL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = vi.fn();
      },
    );

    const url = await fetchProtectedThumbUrl('abc.jpg');
    expect(url).toBe('blob:thumb');
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(`${BASE_URL}/files/abc.jpg/thumb`);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer abc' });
    vi.unstubAllGlobals();
  });
});
