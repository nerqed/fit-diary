import { randomUUID } from 'expo-crypto';
import { openWorkoutRepository } from '../../data/sqlite/expoDatabase';
import { createWorkoutController, type WorkoutController } from './controller';

let opening: Promise<WorkoutController> | null = null;

/** All workout screens share one controller and one serialized SQLite connection. */
export function openWorkoutController(): Promise<WorkoutController> {
  if (!opening) {
    opening = (async () => {
      const repository = await openWorkoutRepository();
      const controller = createWorkoutController(repository, {
        id: randomUUID,
        now: () => new Date().toISOString(),
        timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      await controller.load();
      return controller;
    })().catch((error: unknown) => { opening = null; throw error; });
  }
  return opening;
}
