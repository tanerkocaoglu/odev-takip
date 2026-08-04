/**
 * Backend ortak tipleri.
 *
 * `requireAuth` middleware'i `req.user`'ı kurar; Express Request arayüzü
 * aşağıdaki global bildirimle genişletilir.
 */

export type Role = 'admin' | 'teacher' | 'guardian' | 'student';

/**
 * JWT payload + `req.user` — CLAUDE.md: `{ id, role, teacher_id?,
 * student_id?, guardian_id?, tv }`. `tv` (token_version) JWT'de ayrıca
 * taşınır; `req.user`'da yoktur (DB ile her istekte karşılaştırılır).
 *
 * Öğretmenin `teacher_id`'si kendi `users.id`'sidir — `class_courses.teacher_id`
 * de `users.id`'ye referans verir.
 */
export interface AuthUser {
  id: string;
  role: Role;
  teacher_id: string | null;
  student_id: string | null;
  guardian_id: string | null;
}

// Express Request arayüzünü genişletmek için global bildirim zorunludur.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
