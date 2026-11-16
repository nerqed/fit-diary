import { randomUUID } from 'expo-crypto';
import { getDocumentAsync } from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import { MAX_BACKUP_BYTES, parseWorkoutBackup, previewWorkoutBackup, type BackupFile, type BackupPreview, type BackupWriter } from './core';

function directory(): Directory {
  const value = new Directory(Paths.document, 'forma-backups');
  value.create({ intermediates: true, idempotent: true });
  return value;
}

export const deviceBackupWriter: BackupWriter = {
  async write(text, reason) {
    const name = `forma-${reason}-${Date.now()}-${randomUUID()}.json`;
    const file = new File(directory(), name);
    file.create({ overwrite: false });
    try {
      await file.write(text);
      if (!file.exists || await file.text() !== text) throw new Error('Не удалось проверить сохранённую копию.');
      return { uri: file.uri, name };
    } catch (error) {
      if (file.exists) file.delete();
      throw error;
    }
  },
};

export type SelectedBackup = Readonly<{ name: string; text: string; preview: BackupPreview }>;

/** Picker cancellation never implies an import. The returned preview still needs confirmation. */
export async function pickWorkoutBackup(): Promise<SelectedBackup | null> {
  const result = await getDocumentAsync({ type: ['application/json', 'text/plain'], multiple: false, copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error('Файл не выбран.');
  const file = new File(asset.uri);
  // The picker copies to cache. Remove only that temporary copy, never the user's original.
  const isCacheCopy = file.uri.startsWith(`${Paths.cache.uri.replace(/\/$/, '')}/`);
  try {
    if ((asset.size ?? file.size) > MAX_BACKUP_BYTES) throw new Error('Файл резервной копии слишком большой.');
    const text = await file.text();
    const backup = parseWorkoutBackup(text);
    return { name: asset.name, text, preview: previewWorkoutBackup(backup) };
  } finally {
    if (isCacheCopy && file.exists) file.delete();
  }
}

export function listDeviceBackups(): readonly BackupFile[] {
  return directory().list().filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.json'))
    .map((file) => ({ uri: file.uri, name: file.name })).sort((a, b) => b.name.localeCompare(a.name));
}

/** Opening/closing the share sheet cannot confirm that the user saved to Files. */
export async function shareWorkoutBackup(file: BackupFile): Promise<'share-sheet-closed'> {
  const managed = listDeviceBackups().some((entry) => entry.uri === file.uri && entry.name === file.name);
  if (!managed) throw new Error('Для экспорта выберите сохранённую копию приложения.');
  if (!await isAvailableAsync()) throw new Error('Меню экспорта недоступно на этом устройстве.');
  await shareAsync(file.uri, { UTI: 'public.json', mimeType: 'application/json', dialogTitle: 'Копия данных Форма' });
  return 'share-sheet-closed';
}
