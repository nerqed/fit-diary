import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { type CompositeNavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { Alert, AppState, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getExerciseListProgress, getWeightTrend } from '../features/workouts/analytics';
import type { WorkoutSession } from '../features/workouts/model';
import { useWorkout } from '../features/workouts/WorkoutContext';
import { formatDay, localDay, sessionDay } from '../features/workouts/workoutDates';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { Colors, Radii, Spacing, Typography } from '../theme';
import { Card, SectionHeader } from '../theme/components';
import { ProgressCalendar } from './ProgressCalendar';
import { ExerciseTrend, formatProgressValue, ProgressChart } from './ProgressChart';
import { ScreenShell } from './ScreenShell';
import { WorkoutDaySheet } from './WorkoutDaySheet';
import { PrimaryButton } from './ui';

type ProgressNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Progress'>, NativeStackNavigationProp<RootStackParamList>
>;

function WeightEntry({ day, suggested, recorded }: {
  day: string; suggested?: number; recorded?: number;
}) {
  const { controller, pending } = useWorkout();
  const [input, setInput] = useState<string>();
  const text = input ?? (suggested === undefined ? '' : String(suggested).replace('.', ','));
  const value = Number(text.trim().replace(',', '.'));
  const valid = /^\d*(?:[.,]\d*)?$/.test(text.trim()) && Number.isFinite(value) && value > 0;
  const saved = recorded !== undefined && recorded === value;

  async function save() {
    try {
      await controller.saveBodyWeight(day, value);
      Keyboard.dismiss();
      setInput(undefined);
    } catch (error) {
      Alert.alert('Не удалось записать вес', error instanceof Error ? error.message : 'Попробуй ещё раз.');
    }
  }

  return (
    <View style={styles.entry}>
      <View style={styles.field}>
        <TextInput value={text} style={styles.input} onChangeText={setInput} keyboardType="decimal-pad"
          selectTextOnFocus placeholder="—" placeholderTextColor={Colors.muted} accessibilityLabel="Вес тела в килограммах" />
        <Text style={styles.label}>кг</Text>
      </View>
      <View style={styles.entryButton}>
        <PrimaryButton title={saved ? 'Записано' : 'Записать'} secondary={saved} disabled={!valid || saved || pending}
          onPress={() => void save()} />
      </View>
    </View>
  );
}

function BodyWeightCard({ today }: { today: string }) {
  const { data } = useWorkout();
  const [chosen, setChosen] = useState<string | null>(null);
  const [chooseDate, setChooseDate] = useState(false);
  const day = chosen ?? today;
  const trend = useMemo(() => getWeightTrend(data.bodyWeights ?? [], day), [data.bodyWeights, day]);
  const last = trend.points.at(-1);
  const dateLabel = day === today ? 'Сегодня' : formatDay(day);
  const change = trend.weeklyChangeKg === null ? null : Number(trend.weeklyChangeKg.toFixed(2));
  const recordedDays = useMemo(() => new Set(data.bodyWeights?.map((weight) => weight.date)), [data.bodyWeights]);

  return (
    <Card style={styles.contents}>
      <Text style={styles.heading} accessibilityRole="header">Вес тела</Text>
      {last && <>
        <Text style={styles.value}>{formatProgressValue(last.weightKg)} кг</Text>
        <Text style={styles.label}>Замер за {formatDay(last.date)}</Text>
        <ProgressChart points={trend.points.map((point) => ({
          date: point.date, time: Date.parse(point.date), value: point.weightKg, average: point.averageKg,
        }))} label="Вес тела и среднее за 7 дней" unit="кг" />
        <View style={styles.legend}>
          <View style={styles.legendDot} />
          <Text style={styles.label}>Замер</Text>
          <View style={styles.legendLine} />
          <Text style={styles.label}>Среднее за 7 дней</Text>
        </View>
        <Text style={styles.stat}>Изменение тренда за неделю {change === null ? '—' :
          `${change > 0 ? '+' : ''}${formatProgressValue(change || 0)} кг`}</Text>
      </>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Дата взвешивания, ${dateLabel}. Выбрать день`}
        accessibilityState={{ expanded: chooseDate }} onPress={() => setChooseDate(!chooseDate)} style={styles.dateChoice}>
        <SymbolView name="calendar" size={18} tintColor={Colors.ink} />
        <Text style={styles.stat}>{dateLabel}</Text>
        <SymbolView name={chooseDate ? 'chevron.up' : 'chevron.down'} size={12} tintColor={Colors.muted} />
      </Pressable>
      {chooseDate && <ProgressCalendar today={today} selectedDay={day} markedDays={recordedDays}
        markLabel="есть взвешивание" onSelect={(date) => { setChosen(date === today ? null : date); setChooseDate(false); }} />}
      <WeightEntry key={day} day={day} suggested={last?.weightKg} recorded={last?.date === day ? last.weightKg : undefined} />
    </Card>
  );
}

export function ProgressScreen() {
  const { data } = useWorkout();
  const navigation = useNavigation<ProgressNavigation>();
  const [today, setToday] = useState(() => localDay());
  const [sheetDay, setSheetDay] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    setToday(localDay());
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') setToday(localDay()); });
    return () => subscription.remove();
  }, []));

  const sessionsByDay = useMemo(() => {
    const result = new Map<string, WorkoutSession[]>();
    for (const session of data.sessions) {
      if (session.status === 'abandoned') continue;
      const date = sessionDay(session);
      const existing = result.get(date);
      if (existing) existing.push(session);
      else result.set(date, [session]);
    }
    return result;
  }, [data.sessions]);
  const markedDays = useMemo(() => new Set(sessionsByDay.keys()), [sessionsByDay]);
  const exercises = useMemo(() => {
    const latest = new Map<string, WorkoutSession>();
    for (const session of data.sessions) {
      if (session.status !== 'completed') continue;
      for (const entry of session.exercises) {
        const old = latest.get(entry.exerciseId);
        if (!old || Date.parse(old.startedAt) < Date.parse(session.startedAt)) latest.set(entry.exerciseId, session);
      }
    }
    return data.exercises.flatMap((exercise) => {
      const session = latest.get(exercise.id);
      return session ? [{ exercise, session }] : [];
    }).sort((a, b) => Date.parse(b.session.startedAt) - Date.parse(a.session.startedAt)
      || a.exercise.name.localeCompare(b.exercise.name, 'ru'))
      .map(({ exercise }) => ({ exercise, progress: getExerciseListProgress(data.sessions, exercise.id) }));
  }, [data.exercises, data.sessions]);

  return (
    <ScreenShell title="Прогресс">
      <BodyWeightCard today={today} />
      {exercises.length > 0 && <>
        <SectionHeader title="Упражнения" />
        <Card>
          {exercises.map(({ exercise, progress }) => {
            const { latest, best, bodyweight, direction, trend } = progress;
            const fact = (set: typeof latest) => {
              if (!set) return '—';
              const weight = bodyweight && set.weightKg === 0 ? 'свой вес' : formatProgressValue(set.weightKg);
              return `${weight} × ${set.reps}`;
            };
            const change = direction === 'up' ? 'выше' : direction === 'down' ? 'ниже' : 'без изменений';
            return <Pressable key={exercise.id} accessibilityRole="button"
              accessibilityLabel={`${exercise.name}. Последний подход: ${fact(latest)}. Лучший: ${fact(best)}.${direction ? ' По сравнению с прошлой тренировкой: ' + change : ''}`}
              onPress={() => navigation.navigate('ExerciseHistory', { exerciseId: exercise.id })} style={styles.item}>
              <View style={styles.itemBody}>
                <Text style={styles.stat}>{exercise.name}</Text>
                <Text style={styles.label}>Последний: {fact(latest)} {direction === 'up' ? '↑' : direction === 'down' ? '↓' : direction === 'same' ? '→' : ''}</Text>
                <Text style={styles.label}>Лучший: {fact(best)}</Text>
              </View>
              <ExerciseTrend values={trend} />
              <SymbolView name="chevron.right" size={16} tintColor={Colors.muted} />
            </Pressable>;
          })}
        </Card>
      </>}
      <SectionHeader title="Календарь тренировок" />
      <Card style={styles.contents}>
        <ProgressCalendar today={today} selectedDay={sheetDay ?? today} markedDays={markedDays} openFutureMarks
          markLabel="есть тренировка" onSelect={setSheetDay} />
      </Card>
      {sheetDay !== null && <WorkoutDaySheet key={sheetDay} day={sheetDay} today={today}
        sessions={sessionsByDay.get(sheetDay) ?? []} onClose={() => setSheetDay(null)}
        onOpen={(session, edit) => {
          setSheetDay(null);
          navigation.navigate('WorkoutSession', { sessionId: session.id, edit });
        }}
        onCreate={() => {
          setSheetDay(null);
          navigation.navigate('WorkoutEditor', { day: sheetDay });
        }} />}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  contents: { gap: Spacing.s },
  heading: { ...Typography.bodySemibold, color: Colors.ink },
  value: { ...Typography.h2, color: Colors.ink },
  label: { ...Typography.caption, color: Colors.muted },
  stat: { ...Typography.subheadSemibold, color: Colors.ink },
  legend: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.s },
  legendDot: { width: Spacing.s, height: Spacing.s, borderRadius: Radii.full, borderWidth: 1.5, borderColor: Colors.ink },
  legendLine: { width: Spacing.l, height: 3, borderRadius: Radii.full, backgroundColor: Colors.ink },
  dateChoice: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  entry: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  input: { flex: 1, minWidth: 0, ...Typography.body, color: Colors.ink, backgroundColor: Colors.bg,
    borderRadius: Radii.s, padding: Spacing.m, textAlign: 'center' },
  entryButton: { flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, minHeight: 44, paddingVertical: Spacing.s },
  itemBody: { flex: 1 },
});
