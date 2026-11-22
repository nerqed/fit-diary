import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DemoNotice } from '../theme/components';
import { Colors, Spacing, Typography } from '../theme';

type Props = Readonly<{
  title: string;
  subtitle?: string;
  isDemo?: boolean;
  right?: ReactNode;
  children?: ReactNode;
}>;

/** Common page frame: large title, optional demo badge, scrolling content. */
export function ScreenShell({ title, subtitle, isDemo = false, right, children }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <View style={styles.headText}>
            {subtitle !== undefined && <Text style={styles.sub}>{subtitle}</Text>}
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
          </View>
          {isDemo && <DemoNotice />}
          {right}
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
  sub: { ...Typography.caption, color: Colors.muted },
  title: { ...Typography.h1, color: Colors.ink },
  empty: { ...Typography.subhead, color: Colors.muted, textAlign: 'center', paddingVertical: Spacing.xl },
});
