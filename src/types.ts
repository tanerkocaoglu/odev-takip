// Global tip tanımları — Aşama 0 iskeleti
// Sonraki aşamalarda spec.md'deki veri modeliyle genişletilecek.

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
  is_active: boolean;
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