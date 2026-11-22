import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { ProgressScreenProps } from '../contracts/screens';
import { Card, SectionHeader } from '../theme/components';
import { Colors, Radii, Spacing, Typography, fmt } from '../theme';
import { EmptyState, ScreenShell } from './ScreenShell';
import { PrimaryButton } from './ui';

/** Simple bar chart on plain Views (no react-native-svg yet). */
function Bars({ values, labels }: { values: readonly number[]; labels: readonly string[] }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const floor = min > 0 ? min * 0.9 : 0;
  return (
    <View style={styles.chart}>
      {values.map((v, i) => (
        <View key={`${labels[i] ?? i}-${i}`} style={styles.barCol}>
          <Text style={styles.barVal}>{fmt(v)}</Text>
          <View style={[styles.bar, { height: 8 + ((v - floor) / Math.max(max - floor, 1)) * 92 }]} />
          <Text style={styles.barLabel}>{(labels[i] ?? '').slice(5)}</Text>
        </View>
      ))}
    </View>
  );
}

export function ProgressScreen({ isDemo, weightHistory, exerciseBests, onAddWeight }: ProgressScreenProps) {
  const [weight, setWeight] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const parsed = Number(weight.replace(',', '.'));
  const valid = weight.trim() !== '' && Number.isFinite(parsed) && parsed > 20 && parsed < 400;
  const last = weightHistory[weightHistory.length - 1];

  return (
    <ScreenShell title="Прогресс" isDemo={isDemo}>
      <Card>
        <Text style={styles.label}>Вес тела</Text>
        <Text style={styles.big}>{last === undefined ? '—' : `${fmt(last.weightKg)} кг`}</Text>
        {weightHistory.length > 0
          ? <Bars values={weightHistory.map((p) => p.weightKg)} labels={weightHistory.map((p) => p.date)} />
          : <EmptyState text="Добавь первое взвешивание." />}
        <View style={styles.addRow}>
          <TextInput
            style={styles.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad"
            placeholder="Вес, кг" placeholderTextColor={Colors.muted} accessibilityLabel="Вес тела в килограммах"
          />
          <View style={styles.addBtn}>
            <PrimaryButton title="Добавить" disabled={!valid} onPress={() => { onAddWeight(today, parsed); setWeight(''); }} />
          </View>
        </View>
      </Card>

      <SectionHeader title="Рекорды по упражнениям" />
      {exerciseBests.length === 0 && <EmptyState text="Рекорды появятся после первых тренировок." />}
      {exerciseBests.map((s) => {
        const best = s.points.reduce<number | null>((m, p) => (m === null || p.weightKg > m ? p.weightKg : m), null);
        return (
          <Card key={s.exerciseId}>
            <Text style={styles.ex}>{s.exerciseName}</Text>
            <Text style={styles.label}>Лучший вес на {s.fixedReps} повт. · не 1ПМ</Text>
            <Text style={styles.big}>{best === null ? 'нет данных' : `${fmt(best)} кг`}</Text>
            {s.points.length > 0 && <Bars values={s.points.map((p) => p.weightKg)} labels={s.points.map((p) => p.date)} />}
          </Card>
        );
      })}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  label: { ...Typography.caption, color: Colors.muted },
  big: { ...Typography.h2, color: Colors.ink, marginTop: 2 },
  ex: { ...Typography.bodySemibold, color: Colors.ink },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: Spacing.l, minHeight: 130 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  bar: { width: '100%', maxWidth: 28, borderRadius: 6, backgroundColor: Colors.accent },
  barVal: { ...Typography.micro, color: Colors.muted },
  barLabel: { ...Typography.micro, color: Colors.muted },
  addRow: { flexDirection: 'row', gap: Spacing.s, marginTop: Spacing.l, alignItems: 'center' },
  input: { flex: 1, ...Typography.body, color: Colors.ink, backgroundColor: Colors.bg, borderRadius: Radii.s, padding: 12 },
  addBtn: { width: 130 },
});
