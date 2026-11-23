import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../navigation/types';
import { DemoNotice } from '../theme/components';
import { Colors, Spacing, Typography } from '../theme';
import { tabIcons } from '../theme/tabIcons';

type Props = Readonly<{
  title: string;
  subtitle?: string;
  isDemo?: boolean;
  right?: ReactNode;
  children?: ReactNode;
}>;

/** Common page frame: large title, optional demo badge, scrolling content. */
export function ScreenShell({ title, subtitle, isDemo = false, right, children }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const isTab = Object.hasOwn(tabIcons, route.name);
  return (
    <SafeAreaView style={styles.safe} edges={isTab ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.head}>
          {!isTab && navigation.canGoBack() && (
            <Pressable accessibilityRole="button" accessibilityLabel="Назад" style={styles.iconButton} onPress={() => navigation.goBack()}>
              <SymbolView name="chevron.backward" size={24} tintColor={Colors.ink} />
            </Pressable>
          )}
          <View style={styles.headText}>
            {subtitle !== undefined && <Text style={styles.sub}>{subtitle}</Text>}
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
          </View>
          {isDemo && <DemoNotice />}
          {right}
          {isTab && (
            <Pressable accessibilityRole="button" accessibilityLabel="Открыть профиль" style={styles.iconButton}
              onPress={() => navigation.navigate('Profile')}>
              <SymbolView name="person.crop.circle" size={28} tintColor={Colors.ink} />
            </Pressable>
          )}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.page, paddingBottom: 120, gap: Spacing.m },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.s, marginBottom: Spacing.xs },
  headText: { flex: 1 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sub: { ...Typography.caption, color: Colors.muted },
  title: { ...Typography.h1, color: Colors.ink },
  empty: { ...Typography.subhead, color: Colors.muted, textAlign: 'center', paddingVertical: Spacing.xl },
});
