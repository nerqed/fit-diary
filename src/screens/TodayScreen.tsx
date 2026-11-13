import { Button, Text } from 'react-native';

import type { TodayScreenProps } from '../contracts/screens';
import { PlaceholderScreen } from './PlaceholderScreen';

export function TodayScreen({ meals, workout, onOpenDiary, onOpenWorkouts }: TodayScreenProps) {
  return (
    <PlaceholderScreen title="Сегодня" description="Здесь будут питание и тренировка выбранного дня.">
      {meals.map((meal) => (
        <Text key={meal.id}>{meal.name} · {meal.time} · {meal.foods.join(', ')}</Text>
      ))}
      <Button title="Открыть дневник" onPress={onOpenDiary} />
      <Text>{workout.name}</Text>
      <Button title="Открыть тренировки" onPress={onOpenWorkouts} />
    </PlaceholderScreen>
  );
}
