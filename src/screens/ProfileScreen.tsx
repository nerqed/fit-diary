import { Text } from 'react-native';

import type { ProfileScreenProps } from '../contracts/screens';
import { PlaceholderScreen } from './PlaceholderScreen';

export function ProfileScreen({ fields }: ProfileScreenProps) {
  return (
    <PlaceholderScreen title="Профиль" description="Личные сведения не заполнены и не сохранены.">
      {fields.map((field) => <Text key={field.key}>{field.label}: не указано</Text>)}
    </PlaceholderScreen>
  );
}
