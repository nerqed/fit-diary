import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { AssistantConnectionState, AssistantScreenProps } from '../contracts/screens';
import { Card } from '../theme/components';
import { Colors, Radii, Spacing, Typography } from '../theme';
import { ScreenShell } from './ScreenShell';
import { PrimaryButton } from './ui';

const stateText: Record<AssistantConnectionState, string> = {
  'not-configured': 'Помощник не подключён. Укажи провайдера в настройках.',
  offline: 'Нет связи с помощником. Запросы подождут в очереди.',
  ready: 'На связи',
  thinking: 'Думает…',
};

export function AssistantScreen({ isDemo, connectionState, messages, onSendMessage, onOpenSettings, onRetry }: AssistantScreenProps) {
  const [text, setText] = useState('');
  const canSend = connectionState === 'ready' && text.trim() !== '';
  return (
    <ScreenShell title="Помощник" subtitle={stateText[connectionState]} isDemo={isDemo}>
      {connectionState === 'not-configured' && (
        <Card><Text style={styles.note}>{stateText['not-configured']}</Text><View style={styles.gap} /><PrimaryButton title="Настройки" onPress={onOpenSettings} /></Card>
      )}
      {connectionState === 'offline' && (
        <Card><Text style={styles.note}>{stateText.offline}</Text><View style={styles.gap} /><PrimaryButton title="Повторить" secondary onPress={onRetry} /></Card>
      )}
      {messages.map((m) => (
        <View key={m.id} style={[styles.bubble, m.role === 'user' ? styles.user : m.role === 'system' ? styles.system : styles.bot]}>
          <Text style={[styles.msg, m.role === 'user' && styles.msgUser]}>{m.text}</Text>
        </View>
      ))}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input} value={text} onChangeText={setText} multiline
          placeholder="Спроси про питание или тренировку" placeholderTextColor={Colors.muted}
          editable={connectionState !== 'not-configured'}
        />
        <View style={styles.send}>
          <PrimaryButton title="↑" disabled={!canSend} onPress={() => { onSendMessage(text.trim()); setText(''); }} />
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  note: { ...Typography.subhead, color: Colors.ink },
  gap: { height: Spacing.m },
  bubble: { maxWidth: '85%', borderRadius: Radii.m, padding: Spacing.m },
  user: { alignSelf: 'flex-end', backgroundColor: Colors.accent },
  bot: { alignSelf: 'flex-start', backgroundColor: Colors.card },
  system: { alignSelf: 'center', backgroundColor: Colors.accentSurface },
  msg: { ...Typography.subhead, color: Colors.ink },
  msgUser: { color: Colors.white },
  inputRow: { flexDirection: 'row', gap: Spacing.s, alignItems: 'flex-end', marginTop: Spacing.m },
  input: { flex: 1, ...Typography.body, color: Colors.ink, backgroundColor: Colors.card, borderRadius: Radii.m, padding: 12, maxHeight: 120 },
  send: { width: 56 },
});
