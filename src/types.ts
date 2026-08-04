// Global tip tanımları — backend API'sinin birebir karşılığı.

export type Role = 'admin' | 'teacher' | 'guardian' | 'student';

export interface JwtPayload {
  id: string;
  role: Role;
  teacher_id?: string;
  student_id?: string;
  guardian_id?: string;
  tv: number;
}

export interface User {
  id: string;
  full_name: string;
  role: Role;
  phone: string;
  email: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface OtpRequestInput {
  phone: string;
}

export interface OtpVerifyInput {
  phone: string;
  code: string;
}

/** API hata formatı — CLAUDE.md: Tüm hata yanıtları tek biçimdedir */
export interface ApiError {
  error: {
    code:
      | 'VALIDATION_ERROR'
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'RATE_LIMITED'
      | 'INTERNAL'
      | 'GONE';
    message: string;
    fields?: Record<string, string>;
  };
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  timestamp: string;
}

// ---------- Admin CRUD (Aşama 2b) ----------

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: number;
}

export interface Week {
  id: string;
  academic_year_id: string;
  week_no: number;
  start_date: string;
  end_date: string;
  label: string;
}

export interface ClassItem {
  id: string;
  academic_year_id: string;
  name: string;
  academic_year_name?: string;
}

export interface Course {
  id: string;
  name: string;
}

export interface ClassCourse {
  id: string;
  class_id: string;
  course_id: string;
  teacher_id: string;
  day_of_week: number;
  lesson_time: string | null;
  class_name?: string;
  course_name?: string;
  teacher_name?: string;
}

export interface Teacher {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  is_active: number;
}

export interface Guardian {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  whatsapp_phone: string | null;
  phone_secondary: string | null;
  child_count?: number;
}

export interface Student {
  id: string;
  student_id: string;
  full_name: string;
  phone: string;
  guardian_id: string | null;
  guardian_name: string | null;
  class_id: string;
  class_name: string;
}

export const DAY_LABELS = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'] as const;
