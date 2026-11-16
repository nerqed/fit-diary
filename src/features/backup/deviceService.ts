import { openWorkoutRepository } from '../../data/sqlite/expoDatabase';
import { openWorkoutController } from '../workouts/device';
import { exportWorkoutBackup, importWorkoutBackup } from './core';
import { deviceBackupWriter, listDeviceBackups, pickWorkoutBackup, shareWorkoutBackup, type SelectedBackup } from './deviceFiles';

/** Ready-to-bind actions; selecting a document and confirming replacement remain separate. */
export async function openWorkoutBackupService() {
  const repository = await openWorkoutRepository();
  return {
    list: listDeviceBackups,
    selectImport: pickWorkoutBackup,
    share: shareWorkoutBackup,
    async exportAndShare() {
      const file = await exportWorkoutBackup(repository, deviceBackupWriter, new Date().toISOString());
      const delivery = await shareWorkoutBackup(file);
      return { file, delivery };
    },
    async restore(selected: SelectedBackup, confirmation: 'replace-all') {
      const result = await importWorkoutBackup(repository, deviceBackupWriter, selected.text, confirmation, new Date().toISOString());
      const workouts = await openWorkoutController();
      await workouts.refresh();
      return result;
    },
  };
}
