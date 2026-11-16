import { WORKOUT_SCHEMA_VERSION } from '../../data/sqlite/migrations';
import type { WorkoutData, WorkoutRepository } from '../workouts/model';
import { validateWorkoutData, validateWorkoutTimestamp } from '../workouts/validation';

export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 16 * 1024 * 1024;
export type WorkoutBackup = Readonly<{
  kind: 'forma-workouts'; formatVersion: 1; schemaVersion: number; exportedAt: string; data: WorkoutData;
}>;
export type BackupPreview = Readonly<{
  exportedAt: string; exercises: number; templates: number; sessions: number;
}>;
export type BackupFile = Readonly<{ uri: string; name: string }>;
export interface BackupWriter {
  /** Resolve only after durable write and readback; a cache file is insufficient. */
  write(text: string, reason: 'export' | 'before-import'): Promise<BackupFile>;
}

/** UTF-8 size without Node Buffer (also runs in Hermes). Lone surrogates encode as U+FFFD. */
function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4; index += 1;
    } else bytes += 3;
    if (bytes > MAX_BACKUP_BYTES) return bytes;
  }
  return bytes;
}

export function serializeWorkoutBackup(data: WorkoutData, exportedAt: string): string {
  validateWorkoutTimestamp(exportedAt, 'exportedAt');
  const backup: WorkoutBackup = {
    kind: 'forma-workouts', formatVersion: BACKUP_FORMAT_VERSION, schemaVersion: WORKOUT_SCHEMA_VERSION,
    exportedAt, data: validateWorkoutData(data),
  };
  const text = JSON.stringify(backup, null, 2);
  if (utf8Bytes(text) > MAX_BACKUP_BYTES) throw new Error('Резервная копия превышает допустимый размер.');
  return text;
}

/** Pure validation: no file writes and no database modifications. */
export function parseWorkoutBackup(text: string): WorkoutBackup {
  if (utf8Bytes(text) > MAX_BACKUP_BYTES) throw new Error('Файл резервной копии слишком большой.');
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('Файл не является корректным JSON.'); }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Неверный формат резервной копии.');
  const record = value as Record<string, unknown>;
  const keys = ['kind', 'formatVersion', 'schemaVersion', 'exportedAt', 'data'];
  if (Object.keys(record).length !== keys.length || Object.keys(record).some((key) => !keys.includes(key))
    || record.kind !== 'forma-workouts' || record.formatVersion !== BACKUP_FORMAT_VERSION
    || record.schemaVersion !== WORKOUT_SCHEMA_VERSION) {
    throw new Error('Версия или структура копии не поддерживается. База не изменена.');
  }
  return {
    kind: 'forma-workouts', formatVersion: BACKUP_FORMAT_VERSION, schemaVersion: WORKOUT_SCHEMA_VERSION,
    exportedAt: validateWorkoutTimestamp(record.exportedAt, 'exportedAt'), data: validateWorkoutData(record.data),
  };
}

export function previewWorkoutBackup(backup: WorkoutBackup): BackupPreview {
  return { exportedAt: backup.exportedAt, exercises: backup.data.exercises.length,
    templates: backup.data.templates.length, sessions: backup.data.sessions.length };
}

export async function exportWorkoutBackup(repository: WorkoutRepository, writer: BackupWriter, now: string): Promise<BackupFile> {
  return writer.write(serializeWorkoutBackup(await repository.exportData(), now), 'export');
}

/** UI must show the preview and receive explicit replacement confirmation before calling this. */
export async function importWorkoutBackup(
  repository: WorkoutRepository, writer: BackupWriter, text: string,
  confirmation: 'replace-all', now: string,
): Promise<Readonly<{ restored: BackupPreview; recoveryFile: BackupFile }>> {
  if (confirmation !== 'replace-all') throw new Error('Для восстановления нужно подтверждение замены данных.');
  const backup = parseWorkoutBackup(text);
  let recoveryFile: BackupFile | null = null;
  await repository.replaceAll(backup.data, async (current) => {
    recoveryFile = await writer.write(serializeWorkoutBackup(current, now), 'before-import');
  });
  if (!recoveryFile) throw new Error('Резервная копия перед восстановлением не создана.');
  return { restored: previewWorkoutBackup(backup), recoveryFile };
}
