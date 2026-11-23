import { useRef, useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useWorkout } from '../features/workouts/WorkoutContext';
import type { Exercise, WorkoutTemplate } from '../features/workouts/model';
import { isBodyweightExercise } from '../features/workouts/progression';
import { formatDay, localDay, sessionDay } from '../features/workouts/workoutDates';
import type { RootStackParamList } from '../navigation/types';
import { Colors, Radii, Spacing, Typography } from '../theme';
import { Card } from '../theme/components';
import { ExercisePicker } from './ExercisePicker';
import { EmptyState, ScreenShell } from './ScreenShell';
import { Chip, PrimaryButton, Row } from './ui';

type DraftSet = { id: string; reps: string; weight: string };
type DraftEntry = { id: string; exerciseId: string; sets: DraftSet[] };

function decimalText(value: number | null) {
  return value === null ? '' : String(value).replace('.', ',');
}

function move<T>(items: T[], index: number, delta: number): T[] {
  const copy = items.slice();
  const [item] = copy.splice(index, 1);
  if (item === undefined) return items;
  copy.splice(index + delta, 0, item);
  return copy;
}

function nextTemplateName(templates: readonly WorkoutTemplate[]) {
  const names = new Set(templates.map((item) => item.name));
  let number = 1;
  while (names.has(`Тренировка ${number}`)) number++;
  return `Тренировка ${number}`;
}

function toTemplate(template: WorkoutTemplate, name: string, entries: DraftEntry[], catalog: Map<string, Exercise>): WorkoutTemplate {
  return {
    ...template,
    name: name.trim() || template.name,
    exercises: entries.map((entry) => ({
      ...entry,
      sets: entry.sets.map((set, index) => {
        const field = `${catalog.get(entry.exerciseId)?.name ?? 'Упражнение'} · подход ${index + 1}`;
        const reps = Number(set.reps.trim());
        if (!/^\d+$/.test(set.reps.trim()) || reps < 1 || reps > 10000) {
          throw new Error(`${field}. Введите от 1 до 10 000 повторений.`);
        }
        const text = set.weight.trim().replace(',', '.');
        const weightKg = text ? Number(text) : null;
        if (weightKg !== null && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) || weightKg > 10000)) {
          throw new Error(`${field}. Вес можно пропустить или указать числом от 0 до 10 000 кг.`);
        }
        return { id: set.id, reps, weightKg };
      }),
    })),
  };
}

function IconAction({ name, label, onPress }: { name: SFSymbol; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.icon}>
      <SymbolView name={name} tintColor={Colors.ink} size={20} />
    </Pressable>
  );
}

function SetInputs({ set, index, name, bodyweight, onChange }: {
  set: DraftSet; index: number; name: string; bodyweight: boolean; onChange: (set: DraftSet) => void;
}) {
  const [focused, setFocused] = useState(false);
  const showBodyweight = bodyweight && !focused && Number(set.weight.replace(',', '.')) === 0;
  const label = `${name}, подход ${index + 1}`;

  return (
    <View style={styles.fields}>
      <Text style={styles.hint}>{index + 1}</Text>
      <TextInput value={set.reps} onChangeText={(reps) => onChange({ ...set, reps })}
        style={styles.number} keyboardType="number-pad" maxLength={5}
        selectTextOnFocus accessibilityLabel={`Повторения, ${label}`} />
      <Text style={styles.hint}>повт.</Text>
      <TextInput value={showBodyweight ? '' : set.weight} onChangeText={(weight) => onChange({ ...set, weight })}
        style={styles.number} keyboardType="decimal-pad" maxLength={12}
        selectTextOnFocus accessibilityLabel={`Вес в килограммах, ${label}`}
        placeholder={showBodyweight ? 'свой вес' : '—'} placeholderTextColor={Colors.muted}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      {!showBodyweight && <Text style={styles.hint}>кг</Text>}
    </View>
  );
}

function TemplateForm({ existing, day }: { existing?: WorkoutTemplate; day?: string }) {
  const { controller, data, pending } = useWorkout();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [template] = useState(() => existing ?? { ...controller.newTemplate(), name: nextTemplateName(data.templates) });
  const [name, setName] = useState(template.name);
  const [entries, setEntries] = useState<DraftEntry[]>(() => template.exercises.map((entry) => ({
    ...entry,
    sets: entry.sets.map((set) => ({ id: set.id, reps: String(set.reps), weight: decimalText(set.weightKg) })),
  })));
  const [picker, setPicker] = useState<'add' | { replaceId: string } | null>(existing ? null : 'add');
  const [reordering, setReordering] = useState(false);
  const saving = useRef(false);
  const startId = useRef<string | null>(null);
  const catalog = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));
  const hasActiveSession = data.sessions.some((session) => session.status === 'active');
  const pastDay = day !== undefined && day < localDay();
  const canStart = !hasActiveSession || pastDay;
  const canReorder = entries.length > 1 || entries.some((entry) => entry.sets.length > 1);

  function updateEntry(id: string, update: (entry: DraftEntry) => DraftEntry) {
    setEntries((current) => current.map((entry) => entry.id === id ? update(entry) : entry));
  }

  function selectExercise(exercise: Exercise) {
    if (picker && picker !== 'add' && entries.find((entry) => entry.id === picker.replaceId)?.exerciseId === exercise.id) {
      setPicker(null);
      return;
    }
    const targetDay = day ?? localDay();
    const previous = data.sessions.find((session) => session.status === 'completed' && sessionDay(session) <= targetDay
      && session.exercises.some((entry) => entry.exerciseId === exercise.id));
    const previousEntry = previous?.exercises.find((entry) => entry.exerciseId === exercise.id);
    const sets = previousEntry?.sets.map((set) => ({
      id: controller.newId(), reps: String(set.actualReps || set.plannedReps),
      weight: decimalText(set.actualWeightKg ?? set.plannedWeightKg),
    })) ?? [{ id: controller.newId(), reps: '8', weight: '' }];

    if (picker && picker !== 'add') {
      updateEntry(picker.replaceId, (entry) => ({ ...entry, exerciseId: exercise.id, sets }));
    } else {
      const entry = { id: controller.newId(), exerciseId: exercise.id, sets };
      setEntries((current) => [...current, entry]);
    }
    setPicker(null);
  }

  async function createExercise(exerciseName: string) {
    const exercise = { ...controller.newExercise(), name: exerciseName };
    await controller.saveExercise(exercise);
    return exercise;
  }

  function addSet(entry: DraftEntry) {
    const last = entry.sets[entry.sets.length - 1];
    const set = { id: controller.newId(), reps: last?.reps || '8', weight: last?.weight ?? '' };
    updateEntry(entry.id, (current) => ({ ...current, sets: [...current.sets, set] }));
  }

  async function save(andStart: boolean) {
    if (saving.current || pending || !entries.length) return;
    saving.current = true;
    try {
      await controller.saveTemplate(toTemplate(template, name, entries, catalog));
      if (andStart) {
        startId.current ??= controller.newId();
        const session = await controller.startSession(template.id, startId.current, day);
        navigation.replace('WorkoutSession', session.backdated && session.status === 'completed'
          ? { sessionId: session.id, edit: true } : { sessionId: session.id });
      } else {
        navigation.popTo('Main', { screen: 'Workouts', params: { day } });
      }
    } catch (error) {
      Alert.alert('Не удалось сохранить тренировку', error instanceof Error ? error.message : 'Попробуйте ещё раз.');
    } finally {
      saving.current = false;
    }
  }

  return (
    <>
      <ScreenShell title={existing ? 'Изменить тренировку' : 'Новая тренировка'} subtitle={day && formatDay(day)}>
        <Card style={styles.card}>
          <Text style={styles.hint}>Название</Text>
          <TextInput style={styles.nameInput} value={name} onChangeText={setName}
            selectTextOnFocus maxLength={200} placeholder="Тренировка" placeholderTextColor={Colors.muted}
            accessibilityLabel="Название тренировки" />
        </Card>
        {canReorder && <Row><Chip title={reordering ? 'Готово' : 'Изменить порядок'} active={reordering}
          onPress={() => setReordering(!reordering)} /></Row>}
        {entries.map((entry, index) => {
          const exercise = catalog.get(entry.exerciseId);
          const exerciseName = exercise?.name ?? 'Упражнение';
          const bodyweight = isBodyweightExercise(entry.exerciseId, exerciseName);
          return (
            <Card key={entry.id} style={styles.card}>
              <View style={styles.heading}>
                <Text style={styles.exerciseName}>{exerciseName}</Text>
                <IconAction name="arrow.triangle.2.circlepath" label={`Заменить упражнение «${exerciseName}»`}
                  onPress={() => setPicker({ replaceId: entry.id })} />
                <IconAction name="trash" label={`Убрать упражнение «${exerciseName}» из шаблона`}
                  onPress={() => setEntries((current) => current.filter((item) => item.id !== entry.id))} />
              </View>
              {data.settings?.showNotes && exercise?.note ? <Text style={styles.hint}>{exercise.note}</Text> : null}
              {reordering && <Row>
                {index > 0 && <Chip title="Упражнение выше" onPress={() => setEntries((current) => move(current, index, -1))} />}
                {index < entries.length - 1 && <Chip title="Упражнение ниже" onPress={() => setEntries((current) => move(current, index, 1))} />}
              </Row>}
              {entry.sets.map((set, n) => (
                <View key={set.id}>
                  <View style={styles.setRow}>
                    <SetInputs set={set} index={n} name={exerciseName} bodyweight={bodyweight} onChange={(changed) =>
                      updateEntry(entry.id, (current) => ({ ...current, sets: current.sets.map((item) => item.id === set.id ? changed : item) }))
                    } />
                    {entry.sets.length > 1 && <IconAction name="minus.circle" label={`Убрать подход ${n + 1}, ${exerciseName}`}
                      onPress={() => updateEntry(entry.id, (current) => ({ ...current, sets: current.sets.filter((item) => item.id !== set.id) }))} />}
                  </View>
                  {reordering && <Row>
                    {n > 0 && <Chip title="Подход выше" onPress={() => updateEntry(entry.id, (current) => ({ ...current, sets: move(current.sets, n, -1) }))} />}
                    {n < entry.sets.length - 1 && <Chip title="Подход ниже" onPress={() => updateEntry(entry.id, (current) => ({ ...current, sets: move(current.sets, n, 1) }))} />}
                  </Row>}
                </View>
              ))}
              {entry.sets.length < 100 && <PrimaryButton secondary title="Добавить подход" onPress={() => addSet(entry)} />}
            </Card>
          );
        })}
        {entries.length < 100 && <PrimaryButton secondary={entries.length > 0} title="Добавить упражнение" onPress={() => setPicker('add')} />}
        {entries.length > 0 && <>
          {canStart && <PrimaryButton title={pastDay ? `Сохранить и заполнить за ${formatDay(day)}` : 'Сохранить и начать'}
            disabled={pending} onPress={() => { void save(true); }} />}
          <PrimaryButton title="Сохранить шаблон" secondary={canStart} disabled={pending} onPress={() => { void save(false); }} />
        </>}
      </ScreenShell>
      {picker && <ExercisePicker exercises={data.exercises} onPick={selectExercise} onCancel={() => setPicker(null)} onCreate={createExercise} />}
    </>
  );
}

export function WorkoutEditorScreen() {
  const { data } = useWorkout();
  const { params } = useRoute<RouteProp<RootStackParamList, 'WorkoutEditor'>>();
  const templateId = params?.templateId;
  const existing = data.templates.find((template) => template.id === templateId);
  if (templateId && !existing) {
    return <ScreenShell title="Шаблон"><EmptyState text="Шаблон удалён." /></ScreenShell>;
  }
  return <TemplateForm key={templateId ?? 'new'} existing={existing} day={params?.day} />;
}

const styles = StyleSheet.create({
  card: { gap: Spacing.s },
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  exerciseName: { flex: 1, ...Typography.bodySemibold, color: Colors.ink },
  nameInput: { ...Typography.body, color: Colors.ink, padding: Spacing.m, borderRadius: Radii.s, backgroundColor: Colors.bg },
  hint: { ...Typography.caption, color: Colors.muted },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center' },
  fields: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  number: { minWidth: 0, flex: 1, ...Typography.subheadSemibold, color: Colors.ink, textAlign: 'center',
    minHeight: 44, paddingHorizontal: Spacing.xs, borderRadius: Radii.s, backgroundColor: Colors.bg },
});
