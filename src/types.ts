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

// ---------- Öğretmen raporları (Aşama 3) ----------

export type Attendance = 'present' | 'absent' | 'late' | 'excused';

export const ATTENDANCE_LABELS: Record<Attendance, string> = {
  present: 'Geldi',
  late: 'Geç kaldı',
  absent: 'Gelmedi',
  excused: 'İzinli',
};

export interface TeacherDashboardWeek {
  id: string;
  week_no: number;
  start_date: string;
  end_date: string;
  label: string;
}

export interface TeacherDashboardItem {
  class_course_id: string;
  class_name: string;
  course_name: string;
  day_of_week: number;
  lesson_time: string | null;
  report_id: string | null;
  status: string | null;
  is_overdue: boolean;
}

export interface TeacherDashboard {
  week: TeacherDashboardWeek | null;
  items: TeacherDashboardItem[];
}

export interface ReportEntry {
  student_id: string;
  student_name: string;
  attendance: Attendance;
  homework_score: number | null;
  interest_score: number | null;
  teacher_note: string | null;
  /** Geçen haftanın ödevine teslim durumu — rozet + dosya önizleme (Aşama 4). */
  submission: {
    is_late: number;
    status: string;
    files: Array<{ key: string; filename: string }>;
  } | null;
}

export interface TeacherReportHeader {
  id: string;
  class_course_id: string;
  week_id: string;
  status: 'draft' | 'completed' | 'sent';
  completed_at: string | null;
  updated_at: string;
  topic_covered: string | null;
  prev_homework_text: string | null;
  homework: { description: string | null; due_date: string } | null;
  week: { week_no: number; start_date: string; end_date: string; label: string };
  class_name: string;
  course_name: string;
  teacher_name: string;
  day_of_week: number;
  lesson_time: string | null;
}

export interface TeacherReportPayload {
  report: TeacherReportHeader;
  entries: ReportEntry[];
}

export interface ReportEntryInput {
  student_id: string;
  attendance: Attendance;
  homework_score: number | null;
  interest_score: number | null;
  teacher_note: string | null;
}

export interface ReportSaveInput {
  topic_covered?: string | null;
  prev_homework_text?: string | null;
  homework_description?: string | null;
  due_date?: string | null;
  entries?: ReportEntryInput[];
}

/** Geçmiş raporlarım — GET /teacher/reports yanıtı (spec.md §6). */
export interface TeacherReportHistoryItem {
  id: string;
  class_course_id: string;
  week_id: string;
  status: 'draft' | 'completed' | 'sent';
  completed_at: string | null;
  updated_at: string;
  day_of_week: number;
  lesson_time: string | null;
  class_name: string;
  course_name: string;
  week_no: number;
  week_start: string;
  week_end: string;
  week_label: string;
  student_count: number;
}

export interface TeacherReportHistory {
  items: TeacherReportHistoryItem[];
}

// ---------- Ödev ve teslim (Aşama 4) ----------

export interface SubmissionFile {
  key: string;
  filename: string;
  size: number;
  mime: string;
  ext: string;
}

export interface HomeworkSubmission {
  id: string;
  submitted_at: string;
  is_late: boolean;
  status: 'submitted' | 'reviewed';
  files: SubmissionFile[];
}

export interface StudentHomework {
  id: string;
  description: string;
  due_date: string;
  course_name: string;
  teacher_name: string;
  class_name: string;
  week: { week_no: number; start_date: string; end_date: string; label: string };
  submission: HomeworkSubmission | null;
}

export interface StudentHomeworkList {
  items: StudentHomework[];
}

export interface TeacherSubmission {
  id: string;
  student_id: string;
  student_name: string;
  note: string | null;
  submitted_at: string;
  is_late: boolean;
  status: 'submitted' | 'reviewed';
  reviewed_at: string | null;
  files: SubmissionFile[];
}

export interface TeacherHomeworkWithSubmissions {
  id: string;
  due_date: string;
  course_name: string;
  class_name: string;
  week_no: number;
  week_start: string;
  week_label: string;
  submission_count: number;
}
