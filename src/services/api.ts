/**
 * API istemcisi — tek fetch sarmalayıcı.
 * - Authorization header'ı localStorage'daki token'dan okunur
 * - Hata yanıtları ApiClientError (ApiError biçimi) olarak fırlatılır
 * - 401'de oturum temizlenir (token geçersiz/süresi dolmuş)
 */

import type {
  ApiError,
  AuthResponse,
  LoginRequest,
  OtpRequestInput,
  OtpVerifyInput,
  User,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';
const TOKEN_KEY = 'ds_token';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // JSON dışı yanıt (ağ hatası vb.) — genel hata
    }
    const code = body?.error.code ?? 'INTERNAL';
    const message = body?.error.message ?? 'Bir hata oluştu, lütfen tekrar deneyin.';
    if (res.status === 401) {
      clearToken();
    }
    throw new ApiClientError(res.status, code, message, body?.error.fields);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const authApi = {
  login(input: LoginRequest): Promise<AuthResponse> {
    return apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  requestOtp(input: OtpRequestInput): Promise<{ message: string }> {
    return apiFetch<{ message: string }>('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  verifyOtp(input: OtpVerifyInput): Promise<AuthResponse> {
    return apiFetch<AuthResponse>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  me(): Promise<{ user: User }> {
    return apiFetch<{ user: User }>('/auth/me');
  },
};
