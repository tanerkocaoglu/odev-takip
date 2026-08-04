/**
 * API istemcisi — tek fetch sarmalayıcı.
 * - Authorization header'ı localStorage'daki token'dan okunur
 * - Hata yanıtları ApiClientError (ApiError biçimi) olarak fırlatılır
 * - 401'de oturum temizlenir (token geçersiz/süresi dolmuş)
 */

import type {
  AcademicYear,
  ApiError,
  AuthResponse,
  ClassCourse,
  ClassItem,
  Course,
  Guardian,
  LoginRequest,
  OtpRequestInput,
  OtpVerifyInput,
  Paged,
  ReportSaveInput,
  Student,
  Teacher,
  TeacherDashboard,
  TeacherReportHistory,
  TeacherReportPayload,
  User,
  Week,
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

// ---------- Admin CRUD (Aşama 2b) ----------

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const adminApi = {
  academicYears: {
    list: () => apiFetch<{ items: AcademicYear[] }>('/admin/academic-years'),
    create: (input: Omit<AcademicYear, 'id' | 'is_active'> & { is_active?: boolean }) =>
      apiFetch<AcademicYear>('/admin/academic-years', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    patch: (
      id: string,
      input: Partial<Omit<AcademicYear, 'id' | 'is_active'>> & { is_active?: boolean },
    ) =>
      apiFetch<AcademicYear>(`/admin/academic-years/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
  },
  weeks: {
    list: (academicYearId?: string) =>
      apiFetch<{ items: Week[] }>(
        `/admin/weeks${query({ academicYearId })}`,
      ),
    create: (input: Omit<Week, 'id'>) =>
      apiFetch<Week>('/admin/weeks', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    patch: (id: string, input: Partial<Omit<Week, 'id' | 'week_no'>>) =>
      apiFetch<Week>(`/admin/weeks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      apiFetch<void>(`/admin/weeks/${id}`, { method: 'DELETE' }),
  },
  classes: {
    list: (params: { academicYearId?: string; q?: string } = {}) =>
      apiFetch<{ items: ClassItem[] }>(`/admin/classes${query(params)}`),
    create: (input: { academic_year_id: string; name: string }) =>
      apiFetch<ClassItem>('/admin/classes', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    patch: (id: string, input: { name?: string }) =>
      apiFetch<ClassItem>(`/admin/classes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      apiFetch<void>(`/admin/classes/${id}`, { method: 'DELETE' }),
  },
  courses: {
    list: (q?: string) =>
      apiFetch<{ items: Course[] }>(`/admin/courses${query({ q })}`),
    create: (input: { name: string }) =>
      apiFetch<Course>('/admin/courses', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    patch: (id: string, input: { name?: string }) =>
      apiFetch<Course>(`/admin/courses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      apiFetch<void>(`/admin/courses/${id}`, { method: 'DELETE' }),
  },
  classCourses: {
    list: (classId?: string) =>
      apiFetch<{ items: ClassCourse[] }>(
        `/admin/class-courses${query({ classId })}`,
      ),
    create: (input: Omit<ClassCourse, 'id' | 'class_name' | 'course_name' | 'teacher_name'>) =>
      apiFetch<ClassCourse>('/admin/class-courses', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    patch: (
      id: string,
      input: Partial<Pick<ClassCourse, 'teacher_id' | 'day_of_week' | 'lesson_time'>>,
    ) =>
      apiFetch<ClassCourse>(`/admin/class-courses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      apiFetch<void>(`/admin/class-courses/${id}`, { method: 'DELETE' }),
  },
  teachers: {
    list: (params: { q?: string; page?: number; pageSize?: number } = {}) =>
      apiFetch<Paged<Teacher>>(`/admin/teachers${query(params)}`),
    create: (input: { full_name: string; email: string; phone: string; password: string }) =>
      apiFetch<Teacher>('/admin/teachers', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    patch: (id: string, input: { full_name?: string; email?: string; phone?: string }) =>
      apiFetch<Teacher>(`/admin/teachers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    resetPassword: (id: string, password: string) =>
      apiFetch<{ message: string }>(`/admin/teachers/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    remove: (id: string) =>
      apiFetch<void>(`/admin/teachers/${id}`, { method: 'DELETE' }),
  },
  guardians: {
    list: (params: { q?: string; page?: number; pageSize?: number } = {}) =>
      apiFetch<Paged<Guardian>>(`/admin/guardians${query(params)}`),
    create: (input: {
      full_name: string;
      phone: string;
      whatsapp_phone?: string | null;
      phone_secondary?: string | null;
    }) =>
      apiFetch<Guardian>('/admin/guardians', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    patch: (
      id: string,
      input: Partial<{
        full_name: string;
        phone: string;
        whatsapp_phone: string | null;
        phone_secondary: string | null;
      }>,
    ) =>
      apiFetch<Guardian>(`/admin/guardians/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      apiFetch<void>(`/admin/guardians/${id}`, { method: 'DELETE' }),
  },
  students: {
    list: (params: { q?: string; page?: number; pageSize?: number; classId?: string } = {}) =>
      apiFetch<Paged<Student>>(`/admin/students${query(params)}`),
    create: (input: { full_name: string; phone: string; guardian_id: string; class_id: string }) =>
      apiFetch<Student>('/admin/students', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    patch: (id: string, input: { full_name?: string; phone?: string; guardian_id?: string }) =>
      apiFetch<Student>(`/admin/students/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    changeClass: (id: string, input: { class_id: string; week_id: string }) =>
      apiFetch<{ message: string }>(`/admin/students/${id}/change-class`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      apiFetch<void>(`/admin/students/${id}`, { method: 'DELETE' }),
  },
};

// ---------- Öğretmen raporları (Aşama 3) ----------

export const teacherApi = {
  dashboard: () => apiFetch<TeacherDashboard>('/teacher/dashboard'),
  /** Geçmiş raporlarım — tüm durumlar (spec.md §6). */
  history: (status?: 'draft' | 'completed' | 'sent') =>
    apiFetch<TeacherReportHistory>(`/teacher/reports${status ? `?status=${status}` : ''}`),
  /** Get-or-create: rapor + satırlar + draft homeworks döner. */
  openReport: (classCourseId: string, weekId: string) =>
    apiFetch<TeacherReportPayload>('/teacher/reports', {
      method: 'POST',
      body: JSON.stringify({ class_course_id: classCourseId, week_id: weekId }),
    }),
  saveReport: (reportId: string, input: ReportSaveInput) =>
    apiFetch<TeacherReportPayload>(`/teacher/reports/${reportId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  completeReport: (reportId: string) =>
    apiFetch<TeacherReportPayload>(`/teacher/reports/${reportId}/complete`, {
      method: 'POST',
    }),
};
