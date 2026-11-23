import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { BackupFile } from '../features/backup/core';
import { listDeviceBackups, type SelectedBackup } from '../features/backup/deviceFiles';
import { openWorkoutBackupService } from '../features/backup/deviceService';
import { Colors, Spacing, Typography } from '../theme';
import { Card, SectionHeader } from '../theme/components';
import { ScreenShell } from './ScreenShell';
import { PrimaryButton } from './ui';

type BackupService = Awaited<ReturnType<typeof openWorkoutBackupService>>;
const dateTime = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function fileInfo(name: string) {
  const match = /^forma-(export|before-import)-(\d+)-/.exec(name);
  const timestamp = Number(match?.[2] ?? 0);
  const category = match?.[1] === 'before-import' ? 'Перед импортом' : 'Экспорт';
  return { title: match ? `${category} · ${dateTime.format(timestamp)}` : name, timestamp };
}

export function BackupsScreen() {
  const [files, setFiles] = useState<readonly BackupFile[]>([]);
  const [selected, setSelected] = useState<SelectedBackup | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  function refreshFiles() {
    setFiles(listDeviceBackups().slice().sort((a, b) => fileInfo(b.name).timestamp - fileInfo(a.name).timestamp));
  }

  useEffect(() => {
    try { refreshFiles(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось прочитать список копий.'); }
  }, []);

  async function run(action: (service: BackupService) => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    try {
      await action(await openWorkoutBackupService());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось выполнить действие с копией.');
    } finally {
      try { refreshFiles(); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось прочитать список копий.'); }
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <ScreenShell title="Резервные копии">
      <Card>
        <View style={styles.group}>
          <PrimaryButton title="Экспорт в «Файлы»" disabled={busy} onPress={() => void run(async (service) => {
            await service.exportAndShare();
            setMessage('Копия создана на устройстве.');
          })} />
          <PrimaryButton title="Импорт из «Файлов»" secondary disabled={busy} onPress={() => void run(async (service) => {
            setSelected(null);
            setSelected(await service.selectImport());
          })} />
        </View>
      </Card>
      {selected && <Card>
        <View style={styles.group}>
          <Text style={styles.title}>{selected.name}</Text>
          <Text style={styles.note}>{dateTime.format(new Date(selected.preview.exportedAt))}</Text>
          <Text style={styles.note}>Шаблонов: {selected.preview.templates} · Тренировок: {selected.preview.sessions} · Записей веса: {selected.preview.bodyWeights}</Text>
          <Text style={styles.body}>Восстановление заменит данные тренировок, вес и настройки данными из файла. Приложение сначала сохранит текущую копию на устройстве.</Text>
          <PrimaryButton title="Заменить данные из копии" disabled={busy} onPress={() => void run(async (service) => {
            await service.restore(selected, 'replace-all');
            setSelected(null);
            setMessage('Данные восстановлены. Предыдущая копия доступна ниже.');
          })} />
          <PrimaryButton title="Отмена" secondary disabled={busy} onPress={() => setSelected(null)} />
        </View>
      </Card>}
      {message !== '' && <Text accessibilityRole="alert" style={styles.body}>{message}</Text>}
      {files.length > 0 && <SectionHeader title="Копии на устройстве" />}
      {files.map((file) => <Card key={file.uri}>
        <View style={styles.group}>
          <Text style={styles.body}>{fileInfo(file.name).title}</Text>
          <PrimaryButton title="Поделиться копией" secondary disabled={busy}
            onPress={() => void run(async (service) => { await service.share(file); })} />
        </View>
      </Card>)}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.m },
  title: { ...Typography.h3, color: Colors.ink },
  body: { ...Typography.body, color: Colors.ink },
  note: { ...Typography.caption, color: Colors.muted },
});
