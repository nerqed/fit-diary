import { Text } from 'react-native';

import type { AssistantScreenProps } from '../contracts/screens';
import { PlaceholderScreen } from './PlaceholderScreen';

export function AssistantScreen({ connectionState }: AssistantScreenProps) {
  return (
    <PlaceholderScreen title="Помощник" description="Здесь появится чат с помощником.">
      {connectionState === 'not-configured' && <Text>Помощник пока не подключён.</Text>}
    </PlaceholderScreen>
  );
}
