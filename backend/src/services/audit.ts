/**
 * Audit log — hassas yönetim işlemlerinin kaydı (spec.md §2, §9).
 * Aşama 2b kapsamı: user.create (admin ekleme), teacher.delete,
 * teacher.password_reset, student.class_change, guardian.delete.
 */

import { randomUUID } from 'node:crypto';
import { db } from '../db/index.js';

export interface AuditLogInput {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  diff?: unknown;
}

export function writeAuditLog(input: AuditLogInput): void {
  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, diff, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.actorId,
    input.action,
    input.entityType,
    input.entityId,
    input.diff === undefined ? null : JSON.stringify(input.diff),
    new Date().toISOString(),
  );
}

/**
 * SQLite UNIQUE ihlali mi? (node:sqlite hata kodu SQLITE_CONSTRAINT_*)
 * Admin CRUD'da çakışmaları 409 CONFLICT'e çevirmek için kullanılır.
 */
export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT');
}
