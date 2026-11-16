import { Text, View } from 'react-native';

import type { WorkoutsScreenProps } from '../contracts/screens';
import { PlaceholderScreen } from './PlaceholderScreen';

export function WorkoutsScreen({ workouts }: WorkoutsScreenProps) {
  return (
    <PlaceholderScreen title="Тренировки" description="Здесь появятся план и запись выполненных подходов.">
      {workouts.map((workout) => (
        <View key={workout.id}>
          <Text>{workout.name}</Text>
          {workout.exercises.map((exercise) => <Text key={exercise.id}>{exercise.name}</Text>)}
        </View>
      ))}
    </PlaceholderScreen>
  );
}
