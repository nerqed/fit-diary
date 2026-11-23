import { Alert } from 'react-native';

import type { WorkoutController } from '../features/workouts/controller';
import type { WorkoutSession } from '../features/workouts/model';
import { formatDay, sessionDay } from '../features/workouts/workoutDates';

export function confirmDeleteSession(controller: WorkoutController, session: WorkoutSession, onDeleted?: () => void) {
  const day = formatDay(sessionDay(session));
  Alert.alert('Удалить тренировку?', `«${session.name}» за ${day}. Подходы этой тренировки будут удалены, прогресс пересчитается.`, [
    { text: 'Отмена', style: 'cancel' },
    { text: 'Удалить', style: 'destructive', onPress: () => {
      void controller.deleteSession(session.id).then(onDeleted).catch((error: unknown) => {
        Alert.alert('Не удалось удалить тренировку', error instanceof Error ? error.message : 'Попробуйте ещё раз.');
      });
    } },
  ]);
}
