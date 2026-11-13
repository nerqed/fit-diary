import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = Readonly<{
  title: string;
  description: string;
  children?: ReactNode;
}>;

/** Designer-owned placeholder. Only scrolling/safe-area layout is intentional. */
export function PlaceholderScreen({ title, description, children }: Props) {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text accessibilityRole="header">{title}</Text>
        <Text>Демонстрация. Примеры ниже не являются вашими записями.</Text>
        <Text>{description}</Text>
        <View style={{ gap: 12 }}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
