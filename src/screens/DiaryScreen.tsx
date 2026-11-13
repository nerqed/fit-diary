import { Text } from 'react-native';

import type { DiaryScreenProps } from '../contracts/screens';
import { PlaceholderScreen } from './PlaceholderScreen';

export function DiaryScreen({ dateLabel, meals }: DiaryScreenProps) {
  return (
    <PlaceholderScreen title="Дневник" description="Здесь появятся календарь и приёмы пищи.">
      <Text>{dateLabel}</Text>
      {meals.map((meal) => (
        <Text key={meal.id}>{meal.time} · {meal.name}: {meal.foods.join(', ')}</Text>
      ))}
    </PlaceholderScreen>
  );
}
