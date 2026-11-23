import { type RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getExerciseHistory } from '../features/workouts/analytics';
import type { PerformedSet } from '../features/workouts/model';
import { isBodyweightExercise } from '../features/workouts/progression';
import { useWorkout } from '../features/workouts/WorkoutContext';
import { formatDay, sessionDay } from '../features/workouts/workoutDates';
import type { RootStackParamList } from '../navigation/types';
import { Colors, Spacing, Typography } from '../theme';
import { Card, SectionHeader } from '../theme/components';
import { formatProgressValue, ProgressChart } from './ProgressChart';
import { EmptyState, ScreenShell } from './ScreenShell';
import { Chip, Row } from './ui';

function describeSet(set: PerformedSet, bodyweight: boolean) {
  const reps = set.actualReps ?? '—';
  if (bodyweight && !set.actualWeightKg) return `свой вес × ${reps}`;
  if (set.actualWeightKg === null) return `${reps} повт.`;
  return `${formatProgressValue(set.actualWeightKg)} кг × ${reps}`;
}

export function ExerciseHistoryScreen() {
  const { controller, data } = useWorkout();
  const { params: { exerciseId } } = useRoute<RouteProp<RootStackParamList, 'ExerciseHistory'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const exercise = data.exercises.find((item) => item.id === exerciseId);
  const history = useMemo(() => getExerciseHistory(data.sessions, exerciseId), [data.sessions, exerciseId]);
  const name = exercise?.name ?? history.at(-1)?.exerciseNames[0] ?? 'Упражнение';
  const bodyweight = isBodyweightExercise(exerciseId, name);
  const recordedReps = new Set<number>();
  let hasExternalLoad = false;
  let recentReps = 0;
  for (const row of history) {
    for (const set of row.sets) {
      if (!set.completed || set.actualReps === null || set.actualWeightKg === null) continue;
      if (set.actualWeightKg > 0) hasExternalLoad = true;
      recordedReps.add(set.actualReps);
      recentReps = set.actualReps;
    }
  }

  const [chosenReps, setChosenReps] = useState<number>();
  const reps = chosenReps !== undefined && recordedReps.has(chosenReps) ? chosenReps : recentReps || 1;
  const ownWeightOnly = bodyweight && !hasExternalLoad;
  const { records, bestWeights } = useMemo(() => controller.getProgress(exerciseId, reps),
    [controller, data.sessions, exerciseId, reps]);
  const points = ownWeightOnly
    ? history.map((row) => {
      let value: number | null = null;
      for (const set of row.sets) {
        if (set.completed && set.actualReps !== null) value = Math.max(value ?? 0, set.actualReps);
      }
      return { date: sessionDay(row), time: Date.parse(row.startedAt), value };
    })
    : bestWeights.map((point) => ({ date: sessionDay(point), time: Date.parse(point.startedAt), value: point.bestWeightKg }));
  const weightRecord = records.bestWeightAtReps;
  const volumeRecord = records.bestCompleteVolume;
  const bestReps = points.reduce<number | null>((best, point) =>
    point.value === null ? best : Math.max(best ?? 0, point.value), null);

  return (
    <ScreenShell title={name} subtitle="История упражнения">
      {history.length === 0 ? <Card><EmptyState text="История появится после первой тренировки с этим упражнением." /></Card> : <>
        <Card style={styles.card}>
          <Text style={styles.heading}>{ownWeightOnly ? 'Лучший подход · свой вес' : 'Лучший вес при фиксированных повторениях'}</Text>
          {!ownWeightOnly && recordedReps.size > 0 && <Row>
            {[...recordedReps].sort((a, b) => a - b).map((count) => <Chip key={count}
              title={`${count} повт.`} active={count === reps} onPress={() => setChosenReps(count)} />)}
          </Row>}
          {ownWeightOnly && bestReps !== null && <Text style={styles.value}>{formatProgressValue(bestReps)} повт.</Text>}
          {!ownWeightOnly && weightRecord && <>
            <Text style={styles.value}>{bodyweight && weightRecord.weightKg === 0
              ? 'Свой вес' : `${formatProgressValue(weightRecord.weightKg)} кг`}</Text>
            <Text style={styles.label}>{formatDay(sessionDay(weightRecord))} · {weightRecord.fixedReps} повт.</Text>
          </>}
          {points.some((point) => point.value !== null)
            ? <ProgressChart points={points} unit={ownWeightOnly ? 'повт.' : 'кг'}
              label={ownWeightOnly ? 'Повторения со своим весом' : `Вес на ${reps} повт.`} />
            : <EmptyState text={ownWeightOnly ? 'Пока нет отмеченных подходов.' : 'Пока нет подходов с записанным весом.'} />}
        </Card>
        {!ownWeightOnly && <Card style={styles.card}>
          <Text style={styles.heading}>Лучший объём за тренировку</Text>
          {volumeRecord ? <>
            <Text style={styles.value}>{formatProgressValue(volumeRecord.volumeKgReps)} кг × повт.</Text>
            <Text style={styles.label}>{formatDay(sessionDay(volumeRecord))}</Text>
          </> : <Text style={styles.label}>Появится, когда вес будет записан во всех выполненных подходах.</Text>}
        </Card>}
        <SectionHeader title="Тренировки" />
        <Card>
          {history.slice().reverse().map((row) => {
            const completed = row.sets.filter((set) => set.completed);
            return <Pressable key={row.sessionId} accessibilityRole="button" style={styles.item}
              onPress={() => navigation.navigate('WorkoutSession', { sessionId: row.sessionId })}>
              <View style={styles.details}>
                <Text style={styles.heading}>{row.sessionName}</Text>
                <Text style={styles.label}>{formatDay(sessionDay(row))} · Подходы {completed.length}/{row.sets.length}</Text>
                {completed.length > 0 && <Text style={styles.label}>{completed.map((set) => describeSet(set, bodyweight)).join(' · ')}</Text>}
              </View>
              <SymbolView name="chevron.right" size={16} tintColor={Colors.muted} />
            </Pressable>;
          })}
        </Card>
      </>}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.s },
  heading: { ...Typography.bodySemibold, color: Colors.ink },
  value: { ...Typography.h2, color: Colors.ink },
  label: { ...Typography.caption, color: Colors.muted },
  item: { flexDirection: 'row', gap: Spacing.s, alignItems: 'center', paddingVertical: Spacing.m },
  details: { flex: 1, gap: Spacing.xs },
});
