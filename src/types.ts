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
  /** Veli/öğrenci giriş anahtarı (admin/öğretmen için null). */
  username: string | null;
  /** Admin/öğretmen giriş anahtarı (veli/öğrenci için null). */
  email: string | null;
  /** İlk girişte zorunlu şifre değiştirme (yalnızca öğrenci/veli). */
  must_change_password: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

/** Tek giriş noktası — admin/öğretmen e-posta, veli/öğrenci username gönderir. */
export interface LoginRequest {
  identifier: string;
  password: string;
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
  is_active: number;
}

export interface Guardian {
  id: string;
  user_id: string;
  full_name: string;
  username: string;
  whatsapp_phone: string;
  phone_secondary: string | null;
  /** KVKK açık rızası zaman damgası; null ise onay alınmamış. */
  consent_at: string | null;
  child_count?: number;
}

export interface Student {
  id: string;
  student_id: string;
  full_name: string;
  username: string;
  guardian_id: string | null;
  guardian_name: string | null;
  class_id: string;
  class_name: string;
  school_id: string | null;
  school_name: string | null;
  grade_level: string | null;
}

/** Okul (migration #6) — arayüzde "Okul"; `classes` (dershane grubu) ile karışmaz. */
export interface School {
  id: string;
  name: string;
  name_normalized?: string;
}

/** Sınıf seviyesi sabit kümesi — spec §3.1. */
export const GRADE_LEVELS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'Hazırlık', 'Mezun',
] as const;

export const GRADE_LEVEL_LABELS: Record<string, string> = {
  '1': '1. sınıf',
  '2': '2. sınıf',
  '3': '3. sınıf',
  '4': '4. sınıf',
  '5': '5. sınıf',
  '6': '6. sınıf',
  '7': '7. sınıf',
  '8': '8. sınıf',
  '9': '9. sınıf',
  '10': '10. sınıf',
  '11': '11. sınıf',
  '12': '12. sınıf',
  Hazırlık: 'Hazırlık',
  Mezun: 'Mezun',
};

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
  /** Bu hafta günü geçmiş taslak rapor sayısı — iç hatırlatma banner'ı için. */
  overdue_count: number;
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

// ---------- Veli raporu / haftalık gönderim (Aşama 5) ----------

export interface DigestSnapshotEntry {
  student_id: string;
  student_name: string;
  attendance: Attendance;
  homework_score: number | null;
  interest_score: number | null;
  teacher_note: string | null;
}

export interface DigestSnapshotCourse {
  class_course_id: string;
  course_name: string;
  teacher_name: string;
  day_of_week: number;
  lesson_time: string | null;
  status: 'completed' | 'sent' | 'missing';
  topic_covered: string | null;
  prev_homework_text: string | null;
  homework: { description: string; due_date: string } | null;
  entry: DigestSnapshotEntry | null;
}

export interface DigestSnapshot {
  week: { id: string; week_no: number; start_date: string; end_date: string; label: string };
  class: { id: string; name: string };
  student: { id: string; name: string };
  guardian_name: string | null;
  courses: DigestSnapshotCourse[];
}

/** GET /public/digests/:token — `/r/{token}` sayfasını besler. */
export interface PublicDigestResponse {
  snapshot: DigestSnapshot;
  sent_at: string | null;
}

/** Admin panel — spec.md §5.5 (özet + eksik + matris + digest sayaçları). */
export interface AdminDashboardMissingItem {
  class_course_id: string;
  class_id: string;
  class_name: string;
  course_name: string;
  teacher_id: string;
  teacher_name: string;
  day_of_week: number;
  lesson_time: string | null;
  status: 'draft' | 'not_started';
  report_id: string | null;
  is_overdue: boolean;
}

export interface AdminDashboardMatrixCourse {
  class_course_id: string;
  course_name: string;
  teacher_name: string;
  day_of_week: number;
  lesson_time: string | null;
  status: string | null;
  report_id: string | null;
}

export interface AdminDashboardMatrixRow {
  class_id: string;
  class_name: string;
  courses: AdminDashboardMatrixCourse[];
}

export interface AdminDashboard {
  week: TeacherDashboardWeek | null;
  summary: { total: number; completed: number };
  missing: AdminDashboardMissingItem[];
  matrix: AdminDashboardMatrixRow[];
  digests: { pending: number; ready: number; sent: number };
}

// ---------- Riskli öğrenciler (Aşama 6) ----------

export type RiskFlag = 'low_score' | 'missing_submission' | 'consecutive_absence';

export const RISK_FLAG_LABELS: Record<RiskFlag, string> = {
  low_score: 'Düşük ortalama',
  missing_submission: 'Teslim etmeme',
  consecutive_absence: 'Devamsızlık',
};

export interface RiskStudent {
  student_id: string;
  student_name: string;
  class_name: string | null;
  school_name: string | null;
  grade_level: string | null;
  /** Nedenler ayrı ayrı gösterilir (tek "riskli" etiketi yeterli değildir). */
  risk_flags: RiskFlag[];
  avg_score: number | null;
  missing_submission_count: number;
}

export interface RiskList {
  weeks: Array<{ id: string; week_no: number; start_date: string; end_date: string; label: string }>;
  items: RiskStudent[];
}

/** Haftalık gönderim listesi satırı — GET /admin/digests. */
export interface AdminDigestItem {
  id: string;
  student_id: string;
  student_name: string;
  guardian_name: string;
  week: { id: string; week_no: number; start_date: string; label: string };
  class: { id: string | null; name: string | null };
  status: 'pending' | 'ready' | 'sent';
  send_count: number;
  sent_at: string | null;
  is_revoked: boolean;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  missing_course_count: number;
  total_courses: number;
}

export interface AdminDigestList {
  week_id: string | null;
  items: AdminDigestItem[];
}

/** POST /admin/digests/:id/send yanıtı — wa.me linki "gönder ve sonraki" akışını besler. */
export interface DigestSendResponse {
  id: string;
  status: 'sent';
  send_count: number;
  sent_at: string;
  token: string;
  snapshot: DigestSnapshot;
  message: string;
  wa_me_url: string;
}

/** Veli paneli — GET /guardian/students. */
export interface GuardianChild {
  student_id: string;
  student_name: string;
  username: string;
  class_name: string | null;
}

/** Veli paneli — GET /guardian/reports satırı. */
export interface GuardianReportItem {
  id: string;
  week: { id: string; week_no: number; start_date: string; end_date: string; label: string };
  /** Gösterim etiketi: bu sınıftaki "N. rapor haftası" (enrollment bazlı). */
  relative_week_no: number;
  class_id: string | null;
  class_name: string | null;
  courses: string[];
  sent_at: string;
  send_count: number;
  course_count: number;
}

/** Veli paneli — GET /guardian/reports/:id. */
export interface GuardianReportDetail {
  digest: {
    id: string;
    week: { week_no: number; start_date: string; end_date: string; label: string };
    sent_at: string;
    send_count: number;
  };
  snapshot: DigestSnapshot;
  submissions: Array<{
    course_name: string;
    description: string;
    due_date: string;
    submission: {
      id: string;
      note: string | null;
      submitted_at: string;
      is_late: boolean;
      status: 'submitted' | 'reviewed';
      reviewed_at: string | null;
      files: SubmissionFile[];
    } | null;
  }>;
}

// ---------- CSV toplu öğrenci içe aktarma (spec §5.6) ----------

export interface StudentImportIssue {
  /** CSV'deki satır numarası (başlık = 1, ilk veri satırı = 2). */
  row: number;
  field: string;
  message: string;
}

export interface StudentImportSummary {
  new_students: number;
  new_guardians: number;
  new_schools: number;
  matched_guardians: number;
  matched_schools: number;
}

export interface StudentImportResponse {
  dry_run: boolean;
  ok: boolean;
  committed: boolean;
  summary: StudentImportSummary;
  errors: StudentImportIssue[];
  warnings: StudentImportIssue[];
  created?: {
    created_students: number;
    created_guardians: number;
    created_schools: number;
  };
}

