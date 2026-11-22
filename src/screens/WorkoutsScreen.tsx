import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { WorkoutSet, WorkoutsScreenProps } from '../contracts/screens';
import { Card } from '../theme/components';
import { Colors, Radii, Spacing, Typography, fmt } from '../theme';
import { EmptyState, ScreenShell } from './ScreenShell';
import { PrimaryButton } from './ui';

function toNumber(text: string): number | null {
  const v = Number(text.replace(',', '.'));
  return text.trim() === '' || !Number.isFinite(v) || v < 0 ? null : v;
}

type SetRowProps = Readonly<{
  index: number; set: WorkoutSet;
  onChange: (change: Readonly<{ actualReps: number | null; weightKg: number | null; completed: boolean }>) => void;
}>;

function SetRow({ index, set, onChange }: SetRowProps) {
  const [weight, setWeight] = useState(set.weightKg === null ? '' : String(set.weightKg));
  const [reps, setReps] = useState(set.actualReps === null ? '' : String(set.actualReps));
  const commit = (completed: boolean) => onChange({ actualReps: toNumber(reps), weightKg: toNumber(weight), completed });
  return (
    <View style={styles.set}>
      <Text style={styles.setNo}>{index + 1}</Text>
      <TextInput
        style={styles.input} value={weight} onChangeText={setWeight} onEndEditing={() => commit(set.completed)}
        keyboardType="decimal-pad" placeholder="кг" placeholderTextColor={Colors.muted} accessibilityLabel={`Вес, подход ${index + 1}`}
      />
      <Text style={styles.x}>×</Text>
      <TextInput
        style={styles.input} value={reps} onChangeText={setReps} onEndEditing={() => commit(set.completed)}
        keyboardType="number-pad" placeholder={String(set.plannedReps)} placeholderTextColor={Colors.muted}
        accessibilityLabel={`Повторения, подход ${index + 1}`}
      />
      <Pressable
        accessibilityRole="checkbox" accessibilityState={{ checked: set.completed }}
        accessibilityLabel={`Подход ${index + 1} выполнен`}
        onPress={() => commit(!set.completed)} style={[styles.check, set.completed && styles.checkOn]}
      >
        <Text style={styles.checkText}>{set.completed ? '✓' : ''}</Text>
      </Pressable>
    </View>
  );
}

export function WorkoutsScreen({ isDemo, workouts, onChangeSet, onReplaceExercise, onStartRest, onStopRest }: WorkoutsScreenProps) {
  return (
    <ScreenShell title="Тренировки" isDemo={isDemo}>
      {workouts.length === 0 && <EmptyState text="Нет тренировки на сегодня." />}
      {workouts.map((w) => {
        const all = w.exercises.flatMap((e) => e.sets);
        const done = all.filter((s) => s.completed).length;
        return (
          <View key={w.id} style={styles.gap}>
            <Card>
              <Text style={styles.day}>{w.weekdayLabel}</Text>
              <Text style={styles.name}>{w.name}</Text>
              <View style={styles.track}><View style={[styles.fill, { width: `${all.length ? (done / all.length) * 100 : 0}%` }]} /></View>
              <Text style={styles.meta}>{done} из {all.length} подходов</Text>
            </Card>
            {w.exercises.map((e) => (
              <Card key={e.id}>
                <View style={styles.exHead}>
                  <Text style={styles.exName}>{e.name}</Text>
                  <Text style={styles.replace} onPress={() => onReplaceExercise(w.id, e.id)} accessibilityRole="button">Заменить</Text>
                </View>
                <Text style={styles.meta}>План: {e.sets.map((s) => s.plannedReps).join(' / ')} повт.</Text>
                {e.sets.map((s, i) => (
                  <SetRow key={s.id} index={i} set={s} onChange={(c) => {
                    onChangeSet(w.id, e.id, s.id, c);
                    if (c.completed && !s.completed) onStartRest(w.id, w.restTimerSeconds);
                  }} />
                ))}
              </Card>
            ))}
            <Card>
              <Text style={styles.meta}>Отдых</Text>
              <Text style={styles.timer}>{fmt(Math.floor(w.restTimerSeconds / 60))}:{String(w.restTimerSeconds % 60).padStart(2, '0')}</Text>
              <PrimaryButton
                title={w.restTimerRunning ? 'Остановить отдых' : 'Запустить отдых'} secondary
                onPress={() => (w.restTimerRunning ? onStopRest(w.id) : onStartRest(w.id, w.restTimerSeconds))}
              />
            </Card>
          </View>
        );
      })}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.m },
  day: { ...Typography.captionSemibold, color: Colors.muted },
  name: { ...Typography.h2, color: Colors.ink, marginTop: 2 },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.track, marginTop: Spacing.m, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: Colors.accent },
  meta: { ...Typography.caption, color: Colors.muted, marginTop: Spacing.xs },
  exHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exName: { ...Typography.bodySemibold, color: Colors.ink, flex: 1 },
  replace: { ...Typography.captionSemibold, color: Colors.muted },
  set: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, marginTop: Spacing.s },
  setNo: { ...Typography.captionSemibold, color: Colors.muted, width: 18 },
  input: {
    flex: 1, ...Typography.bodySemibold, color: Colors.ink, backgroundColor: Colors.bg,
    borderRadius: Radii.s, paddingVertical: 10, textAlign: 'center',
  },
  x: { ...Typography.body, color: Colors.muted },
  check: { width: 44, height: 44, borderRadius: Radii.s, backgroundColor: Colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: Colors.accent },
  checkText: { ...Typography.bodySemibold, color: Colors.white },
  timer: { ...Typography.h1, color: Colors.ink, marginVertical: Spacing.s },
});
