import { Text } from 'react-native';

import type { ProgressScreenProps } from '../contracts/screens';
import { PlaceholderScreen } from './PlaceholderScreen';

export function ProgressScreen({ metrics }: ProgressScreenProps) {
  return (
    <PlaceholderScreen title="Прогресс" description="Здесь появятся измерения и итоги недели.">
      {metrics.map((metric) => <Text key={metric.id}>{metric.name}: {metric.description}</Text>)}
    </PlaceholderScreen>
  );
}
