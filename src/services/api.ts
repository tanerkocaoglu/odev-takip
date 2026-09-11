/**
 * API istemcisi — tek fetch sarmalayıcı.
 * - Authorization header'ı localStorage'daki token'dan okunur
 * - Hata yanıtları ApiClientError (ApiError biçimi) olarak fırlatılır
 * - 401'de oturum temizlenir (token geçersiz/süresi dolmuş)
 */

import type {
  AcademicYear,
  AdminDashboard,
  AdminDigestList,
  ApiError,
  AuthResponse,
  ClassCourse,
  ClassItem,
  Course,
  DigestSendResponse,
  DigestSnapshot,
  Guardian,
  GuardianChild,
  GuardianReportDetail,
  GuardianReportItem,
  LoginRequest,
  Paged,
  PublicDigestResponse,
  ReportFilterOptions,
  ReportSaveInput,
  RiskList,
  School,
  Student,
  StudentHomework,
  StudentHomeworkList,
  StudentImportResponse,
  Teacher,
  TeacherDashboard,
  TeacherHomeworkWithSubmissions,
  TeacherReportHistoryItem,
  TeacherReportPayload,
  TeacherSubmission,
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
  // FormData (dosya yükleme) gönderilirken Content-Type set edilmez — tarayıcı
  // boundary'i kendisi koyar; elle set edilirse multipart bozulur.
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
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
  /** Tek giriş noktası: admin/öğretmen e-posta, veli/öğrenci username. */
  login(input: LoginRequest): Promise<AuthResponse> {
    return apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  me(): Promise<{ user: User }> {
    return apiFetch<{ user: User }>('/auth/me');
  },
  /** Kendi şifresini belirle (zorunlu ilk değişim dahil); yeni token döner. */
  changePassword(input: { current_password: string; new_password: string }): Promise<AuthResponse> {
    return apiFetch<AuthResponse>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(input),
    });
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
    /** İki atamanın öğretmenlerini tek transaction'da takas eder. */
    swap: (cc_id_a: string, cc_id_b: string) =>
      apiFetch<{ items: ClassCourse[] }>('/admin/class-courses/swap', {
        method: 'POST',
        body: JSON.stringify({ cc_id_a, cc_id_b }),
      }),
  },
  teachers: {
    list: (params: { q?: string; page?: number; pageSize?: number } = {}) =>
      apiFetch<Paged<Teacher>>(`/admin/teachers${query(params)}`),
    create: (input: { full_name: string; email: string; password: string }) =>
      apiFetch<Teacher>('/admin/teachers', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    patch: (id: string, input: { full_name?: string; email?: string }) =>
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
    /** Öğretmenin tüm atamalarını tek hedef öğretmene devreder. */
    transferAssignments: (id: string, target_teacher_id: string) =>
      apiFetch<{ reassigned: number }>(`/admin/teachers/${id}/transfer-assignments`, {
        method: 'POST',
        body: JSON.stringify({ target_teacher_id }),
      }),
  },
  guardians: {
    list: (params: { q?: string; page?: number; pageSize?: number } = {}) =>
      apiFetch<Paged<Guardian>>(`/admin/guardians${query(params)}`),
    create: (input: {
      full_name: string;
      whatsapp_phone: string;
      phone_secondary?: string | null;
      password: string;
    }) =>
      apiFetch<Guardian>('/admin/guardians', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    patch: (
      id: string,
      input: Partial<{
        full_name: string;
        whatsapp_phone: string;
        phone_secondary: string | null;
        /** KVKK açık rızası: true → zaman damgası yaz, false → null'a sıfırla */
        consent_at: boolean;
      }>,
    ) =>
      apiFetch<Guardian>(`/admin/guardians/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    resetPassword: (id: string, password: string) =>
      apiFetch<{ message: string }>(`/admin/guardians/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    remove: (id: string) =>
      apiFetch<void>(`/admin/guardians/${id}`, { method: 'DELETE' }),
  },
  students: {
    list: (params: { q?: string; page?: number; pageSize?: number; classId?: string } = {}) =>
      apiFetch<Paged<Student>>(`/admin/students${query(params)}`),
    create: (input: {
      full_name: string;
      guardian_id: string;
      class_id: string;
      password: string;
      school_id?: string | null;
      grade_level?: string | null;
    }) =>
      apiFetch<Student>('/admin/students', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    patch: (
      id: string,
      input: {
        full_name?: string;
        guardian_id?: string;
        school_id?: string | null;
        grade_level?: string | null;
      },
    ) =>
      apiFetch<Student>(`/admin/students/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    resetPassword: (id: string, password: string) =>
      apiFetch<{ message: string }>(`/admin/students/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    changeClass: (id: string, input: { class_id: string; week_id: string }) =>
      apiFetch<{ message: string }>(`/admin/students/${id}/change-class`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      apiFetch<void>(`/admin/students/${id}`, { method: 'DELETE' }),
    /** Boş CSV şablonunu indirir (spec §5.6). */
    downloadImportTemplate: () =>
      downloadCsv('/admin/students/import/template', 'ogrenci-ice-aktarma-sablonu.csv'),
    /** CSV'yi doğrular, hiçbir şey yazmaz; özet + hata/uyarı döner. */
    importPreview: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiFetch<StudentImportResponse>('/admin/students/import?dry_run=true', {
        method: 'POST',
        body: form,
      });
    },
    /** CSV'yi yeniden doğrulayıp tek transaction'da kaydeder (hepsi ya da hiçbiri). */
    importCommit: (file: File, password: string) => {
      const form = new FormData();
      form.append('file', file);
      form.append('password', password);
      return apiFetch<StudentImportResponse>('/admin/students/import?dry_run=false', {
        method: 'POST',
        body: form,
      });
    },
  },
  schools: {
    list: (q?: string) =>
      apiFetch<{ items: School[] }>(`/admin/schools${query({ q })}`),
    create: (input: { name: string }) =>
      apiFetch<School>('/admin/schools', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    patch: (id: string, input: { name?: string }) =>
      apiFetch<School>(`/admin/schools/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      apiFetch<void>(`/admin/schools/${id}`, { method: 'DELETE' }),
  },
  /** Admin panel — özet + eksik + matris (spec §5.5). */
  dashboard: (weekId?: string) =>
    apiFetch<AdminDashboard>(`/admin/dashboard${query({ week_id: weekId })}`),
  /** Riskli öğrenci listesi — son 3 hafta, üç kriter OR (spec §6). */
  risk: () => apiFetch<RiskList>('/admin/dashboard/risk'),
  /** Filtreli CSV dışa aktarma — ekranda görünen sütunlar + aktif filtre (spec §5.7). */
  exports: {
    reports: (params: { status?: string; class_id?: string; week_id?: string; q?: string } = {}) =>
      downloadCsv(`/admin/reports/export${query(params)}`, 'raporlar.csv'),
    students: (params: { q?: string; classId?: string } = {}) =>
      downloadCsv(`/admin/students/export${query(params)}`, 'ogrenciler.csv'),
    guardians: (params: { q?: string } = {}) =>
      downloadCsv(`/admin/guardians/export${query(params)}`, 'veliler.csv'),
  },
  digests: {
    /** Haftalık gönderim listesi (pending + ready + sent). */
    list: (params: { week_id?: string; class_id?: string; status?: string } = {}) =>
      apiFetch<AdminDigestList>(`/admin/digests${query(params)}`),
    preview: (id: string) =>
      apiFetch<{ preview: DigestSnapshot }>(`/admin/digests/${id}/preview`),
    send: (id: string) =>
      apiFetch<DigestSendResponse>(`/admin/digests/${id}/send`, { method: 'POST' }),
    revoke: (id: string) =>
      apiFetch<{ id: string; is_revoked: boolean }>(`/admin/digests/${id}/revoke`, {
        method: 'POST',
      }),
  },
};

// ---------- Öğretmen raporları (Aşama 3) ----------

export const teacherApi = {
  dashboard: () => apiFetch<TeacherDashboard>('/teacher/dashboard'),
  /** Geçmiş raporlarım / admin "Tüm raporlar" — durum + sınıf + hafta + arama, sayfalama. */
  history: (params: {
    status?: 'draft' | 'completed' | 'sent';
    class_id?: string;
    week_id?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  } = {}) => apiFetch<Paged<TeacherReportHistoryItem>>(`/teacher/reports${query(params)}`),
  /** Geçmiş rapor filtresi için kapsam-duyarlı sınıf + hafta seçenekleri. */
  reportFilters: () =>
    apiFetch<ReportFilterOptions>('/teacher/reports/filters'),
  /** Salt-okunur tek rapor — admin "Tüm raporlar" görünümü. */
  getReport: (reportId: string) =>
    apiFetch<TeacherReportPayload>(`/teacher/reports/${encodeURIComponent(reportId)}`),
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
  /** Teslimi olan ödevler (teslim kontrol seçici) — spec.md §6. */
  submissionHomeworks: () =>
    apiFetch<{ items: TeacherHomeworkWithSubmissions[] }>('/teacher/submissions'),
  /** Bir ödevin tüm teslimleri. */
  submissions: (homeworkId: string) =>
    apiFetch<{ items: TeacherSubmission[] }>(
      `/teacher/submissions?homework_id=${encodeURIComponent(homeworkId)}`,
    ),
  /** Teslimi "İncelendi" işaretler. */
  markReviewed: (submissionId: string) =>
    apiFetch<{ id: string; status: string; reviewed_by: string; reviewed_at: string }>(
      `/teacher/submissions/${submissionId}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'reviewed' }) },
    ),
};

// ---------- Öğrenci ödev ve teslim (Aşama 4) ----------

/**
 * Korumalı dosyayı Bearer token ile çekip yeni sekmede açar.
 *
 * `<a href>` doğrudan Authorization header gönderemediği için backend 401
 * dönerdi. Bu yardımcı fetch + blob + `URL.createObjectURL` kullanır:
 * token header'a konur, yanıt blob olarak alınır, geçici URL üretilip
 * `window.open` ile açılır. Hata durumunda ApiClientError fırlatılır
 * (401'de apiFetch gibi oturum temizlenir).
 */
export async function openProtectedFile(key: string): Promise<void> {
  const token = getToken();
  if (!token) {
    clearToken();
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Giriş yapmanız gerekiyor.');
  }

  const res = await fetch(`${BASE_URL}/files/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // JSON dışı yanıt — genel hata
    }
    const code = body?.error.code ?? 'INTERNAL';
    const message =
      body?.error.message ?? 'Bir hata oluştu, lütfen tekrar deneyin.';
    if (res.status === 401) {
      clearToken();
    }
    throw new ApiClientError(
      res.status,
      code,
      message,
      body?.error.fields,
    );
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noreferrer');
  // Blob URL'yi bir sonraki tick'te temizle; önce tarayıcı indirmeyi başlatsın.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const studentApi = {
  homeworks: () => apiFetch<StudentHomeworkList>('/student/homeworks'),
  submit: (homeworkId: string, files: File[], note?: string) => {
    const form = new FormData();
    for (const file of files) {
      form.append('files', file);
    }
    if (note) {
      form.append('note', note);
    }
    return apiFetch<{ item: StudentHomework }>(`/student/homeworks/${homeworkId}/submit`, {
      method: 'POST',
      body: form,
    });
  },
};

// ---------- Public /r/{token} + Veli paneli (Aşama 5) ----------

/** Auth gerektirmeyen public uçlar. 410 GONE: iptal/bilinmeyen token. */
export const publicApi = {
  digest: (token: string) =>
    apiFetch<PublicDigestResponse>(`/public/digests/${encodeURIComponent(token)}`),
};

export const guardianApi = {
  students: () => apiFetch<{ items: GuardianChild[] }>('/guardian/students'),
  reports: (studentId: string) =>
    apiFetch<{ items: GuardianReportItem[] }>(
      `/guardian/reports?student_id=${encodeURIComponent(studentId)}`,
    ),
  report: (id: string) =>
    apiFetch<GuardianReportDetail>(`/guardian/reports/${encodeURIComponent(id)}`),
};

/**
 * Bearer token ile bir CSV/dosya ucunu indirir (spec §5.7). `<a href>` token
 * gönderemediği için fetch + blob + `a[download]` kullanılır. Dosya adı
 * `Content-Disposition`'dan okunur.
 */
export async function downloadCsv(
  path: string,
  fallbackFilename: string,
): Promise<string> {
  const token = getToken();
  if (!token) {
    clearToken();
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Giriş yapmanız gerekiyor.');
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // JSON dışı yanıt — genel hata
    }
    const message = body?.error.message ?? 'Dosya indirilemedi.';
    if (res.status === 401) clearToken();
    throw new ApiClientError(res.status, body?.error.code ?? 'INTERNAL', message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const cd = res.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(cd);
  const filename = match?.[1] ?? fallbackFilename;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

/**
 * Admin yedek indir — `POST /admin/backup` CLI'ı spawn edip .zip'i döndürür.
 * Yanıt dosya olduğu için blob olarak alınır ve tarayıcı indirmesi tetiklenir
 * (openProtectedFile deseninin yedeğe uyarlanmış hâli).
 */
export async function downloadBackup(): Promise<string> {
  const token = getToken();
  if (!token) {
    clearToken();
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Giriş yapmanız gerekiyor.');
  }
  const res = await fetch(`${BASE_URL}/admin/backup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // JSON dışı yanıt — genel hata
    }
    const message = body?.error.message ?? 'Yedek oluşturulamadı.';
    throw new ApiClientError(res.status, body?.error.code ?? 'INTERNAL', message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const cd = res.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(cd);
  const filename = match?.[1] ?? 'dershane-yedek.zip';

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}
