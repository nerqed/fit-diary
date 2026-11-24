import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getSessionSummary } from '../features/workouts/analytics';
import { useWorkout } from '../features/workouts/WorkoutContext';
import { formatDay, sessionDay } from '../features/workouts/workoutDates';
import type { ComparedSet, SessionView } from '../features/workouts/controller';
import type { RootStackParamList } from '../navigation/types';
import { Colors, Radii, Spacing, Typography } from '../theme';
import { Card } from '../theme/components';
import { confirmDeleteSession } from './deleteWorkoutSession';
import { ExercisePicker } from './ExercisePicker';
import { EmptyState, ScreenShell } from './ScreenShell';
import { PrimaryButton } from './ui';
import { WorkoutRestBanner } from './WorkoutRestTimer';
import { displayedWeight, setLabel, showNumber, WorkoutSetRow, type SetInputs } from './WorkoutSetRow';

const restSeconds = 90;
const formatVolume = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
type SessionEntry = SessionView['exercises'][number];
type InputDraft = SetInputs & { exerciseId: string; hideWeightHint?: boolean; hideRepsHint?: boolean };
function rowInputs(draft: InputDraft | undefined, exerciseId: string, set: ComparedSet): SetInputs {
  if (draft?.exerciseId !== exerciseId) return {};
  return {
    weight: draft.weight ?? (draft.hideWeightHint && set.actualWeightKg === null ? '' : undefined),
    reps: draft.reps ?? (draft.hideRepsHint && set.actualReps === null ? '' : undefined),
  };
}
type SetAction = { completed?: boolean; rir?: number | null };

function readNumber(text: string, field: keyof SetInputs) {
  const value = text.trim().replace(',', '.');
  if (!value) return null;
  const number = Number(value);
  const valid = field === 'reps' ? /^\d+$/.test(value) : /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value);
  const maximum = field === 'reps' ? 300 : 600;
  if (!valid || !Number.isFinite(number) || number > maximum) {
    throw new Error(field === 'reps' ? 'Укажите целое число повторений от 0 до 300.'
      : 'Укажите вес от 0 до 600 кг или оставьте поле пустым.');
  }
  return number;
}

function reportError(error: unknown) {
  Alert.alert('Тренировка', error instanceof Error ? error.message : 'Не удалось сохранить изменение.');
}

export function WorkoutSessionScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'WorkoutSession'>>();
  return <SessionDetails key={route.params.sessionId} id={route.params.sessionId} initialEdit={route.params.edit === true} />;
}

function SessionDetails({ id, initialEdit }: { id: string; initialEdit: boolean }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { controller, data } = useWorkout();
  const view = useMemo(() => controller.getSessionView(id, Date.now()), [controller, data, id]);
  const session = view?.session;
  const [editingHistory, setEditingHistory] = useState(initialEdit);
  const summary = useMemo(() => session?.status === 'completed' && !editingHistory ? getSessionSummary(session, data.sessions) : null,
    [session, data.sessions, editingHistory]);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const inFlightChecks = useRef(new Set<string>());
  const [inputs, setInputs] = useState<Record<string, InputDraft>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const inputRef = useRef(inputs);
  const noteRef = useRef(notes);
  const dirtySets = useRef(new Set<string>());
  const dirtyNotes = useRef(new Set<string>());
  const writes = useRef(Promise.resolve());

  // An iOS keyboard can send its blur after the checkbox tap. Both edits merge
  // into the latest saved set so delayed input cannot undo its completion.
  const enqueue = useCallback((action: () => Promise<void>) => {
    const next = writes.current.then(action);
    writes.current = next.catch(() => {});
    return next;
  }, []);

  const saveSet = useCallback(async (setId: string, exerciseId: string, action: SetAction = {}) => {
    const current = controller.getSessionView(id, Date.now());
    const entry = current?.exercises.find((e) => e.exerciseId === exerciseId && e.sets.some((s) => s.id === setId));
    const set = entry?.sets.find((s) => s.id === setId);
    if (!current || !entry || !set) return;
    const draft = inputRef.current[setId];
    const matching = draft?.exerciseId === exerciseId ? draft : undefined;
    const values = rowInputs(matching, exerciseId, set);
    const confirming = action.completed === true && !set.completed;
    let actualReps = confirming ? set.actualReps ?? set.plannedReps : set.actualReps;
    let actualWeightKg = confirming ? displayedWeight(set) : set.actualWeightKg;
    if (values.weight !== undefined) actualWeightKg = readNumber(values.weight, 'weight');
    if (values.reps !== undefined) actualReps = readNumber(values.reps, 'reps');
    if (confirming && entry.bodyweight && actualWeightKg === null) actualWeightKg = 0;
    if (confirming && !actualReps) throw new Error('Для отметки подхода укажите число выполненных повторений.');
    if (confirming && !entry.bodyweight && actualWeightKg === null) throw new Error('Укажите вес перед отметкой подхода.');
    const completed = action.completed ?? (set.completed && actualReps !== null && actualReps > 0);
    const rir = action.rir === undefined ? set.rir ?? null : action.rir;
    const editedFields = { weight: matching?.weight !== undefined, reps: matching?.reps !== undefined };
    const editedSuggestion = (editedFields.weight && set.copiedWeight) || (editedFields.reps && set.copiedReps);
    if (editedSuggestion || actualReps !== set.actualReps || actualWeightKg !== set.actualWeightKg || completed !== set.completed || rir !== (set.rir ?? null)) {
      const rest = confirming && current.session.status === 'active' && !current.session.backdated ? restSeconds : undefined;
      await controller.updateSet(id, setId, { actualReps, actualWeightKg, completed, rir, editedFields }, rest);
    }
    if (matching && inputRef.current[setId] === matching) {
      dirtySets.current.delete(setId);
      const next = { ...inputRef.current };
      // Keep a deliberately cleared field blank while the database still has no value.
      // A later set completion can supply a fresh value for that field.
      const hideWeightHint = values.weight?.trim() === '' && actualWeightKg === null;
      const hideRepsHint = values.reps?.trim() === '' && actualReps === null;
      if (hideWeightHint || hideRepsHint) next[setId] = { exerciseId, hideWeightHint, hideRepsHint };
      else delete next[setId];
      inputRef.current = next;
      setInputs(next);
    }
  }, [controller, id]);

  const saveNote = useCallback(async (exerciseId: string) => {
    const text = noteRef.current[exerciseId];
    if (text === undefined) return;
    const exercise = controller.getSnapshot().data?.exercises.find((e) => e.id === exerciseId);
    if (exercise && text.trim() !== (exercise.note ?? '')) {
      await controller.saveExercise({ ...exercise, note: text.trim() });
    }
    if (noteRef.current[exerciseId] === text) dirtyNotes.current.delete(exerciseId);
  }, [controller]);

  const flush = useCallback(async () => {
    for (const setId of [...dirtySets.current]) {
      const draft = inputRef.current[setId];
      if (draft) await saveSet(setId, draft.exerciseId);
    }
    for (const exerciseId of [...dirtyNotes.current]) await saveNote(exerciseId);
  }, [saveSet, saveNote]);
  useFocusEffect(useCallback(() => {
    const savePending = () => {
      if (dirtySets.current.size || dirtyNotes.current.size) void enqueue(flush).catch(reportError);
    };
    const listener = AppState.addEventListener('change', (state) => { if (state === 'background') savePending(); });
    return () => { listener.remove(); savePending(); };
  }, [enqueue, flush]));

  if (!view || !session) return <ScreenShell title="Тренировка"><EmptyState text="Тренировка не найдена." /></ScreenShell>;
  const showEditor = session.status === 'active' || (session.status === 'completed' && editingHistory);
  const day = formatDay(sessionDay(session));
  const entries = view.exercises;
  const allSets = entries.flatMap((entry) => entry.sets);
  const count = allSets.filter((set) => set.completed).length;
  const volume = summary?.volume;
  const load = volume?.knownAmountKgReps;
  const openHistory = (exerciseId: string) => navigation.navigate('ExerciseHistory', { exerciseId });

  function editSet(setId: string, exerciseId: string, field: keyof SetInputs, text: string) {
    const current = inputRef.current[setId];
    inputRef.current = { ...inputRef.current, [setId]: {
      ...(current?.exerciseId === exerciseId ? current : {}), exerciseId, [field]: text,
    } };
    dirtySets.current.add(setId);
    setInputs(inputRef.current);
  }
  function check(setId: string, exerciseId: string, completed: boolean) {
    if (inFlightChecks.current.has(setId)) return;
    inFlightChecks.current.add(setId);
    void enqueue(() => saveSet(setId, exerciseId, { completed })).catch(reportError)
      .finally(() => inFlightChecks.current.delete(setId));
  }
  function finish() {
    setFinishing(true);
    Keyboard.dismiss();
    void enqueue(async () => {
      await flush();
      if (session?.status === 'active') await controller.finishSession(id, 'completed');
      setEditingHistory(false);
    }).catch(reportError).finally(() => setFinishing(false));
  }
  function chooseReplacement(entry: SessionEntry) {
    const open = () => setReplacement(entry.id);
    if (entry.sets.some((s) => s.completed || s.actualWeightKg !== null || s.actualReps !== null || dirtySets.current.has(s.id))) {
      Alert.alert('Заменить упражнение?', 'Фактические значения подходов будут очищены при выборе другого упражнения.', [
        { text: 'Отмена', style: 'cancel' }, { text: 'Выбрать', onPress: open },
      ]);
    } else open();
  }

  return (
    <View style={styles.page}>
      <ScreenShell title={summary ? `Итог · ${day}` : session.name} subtitle={summary ? session.name : day}>
        <Card style={styles.gap}>
          <Text style={styles.metric}>{count} из {allSets.length} подходов</Text>
          {summary && <>
            <Text style={styles.text}>Тоннаж {load == null ? '—' :
              `${volume?.state === 'partial' ? 'не менее ' : ''}${formatVolume.format(load)} кг`}</Text>
            {summary.bodyweightReps > 0 && <Text style={styles.text}>+ {summary.bodyweightReps} повт. со своим весом</Text>}
            {summary.durationMinutes !== null && <Text style={styles.text}>Длительность {summary.durationMinutes} мин</Text>}
          </>}
        </Card>
        {!!summary?.records.length && <Card style={styles.gap}>
          <Text style={styles.metric}>{summary.records.length === 1 ? 'Новый рекорд' : 'Новые рекорды'}</Text>
          {summary.records.map((record) => (
            <Text key={`${record.exerciseId}-${record.kind}-${record.kind === 'weight' ? record.reps : ''}`} style={styles.text}>
              {record.exerciseName}: {record.kind === 'weight'
                ? `${showNumber(record.weightKg)} × ${record.reps} (было ${showNumber(record.previousWeightKg)} × ${record.reps})`
                : `тоннаж ${formatVolume.format(record.volumeKgReps)} кг (было ${formatVolume.format(record.previousVolumeKgReps)} кг)`}
            </Text>
          ))}
        </Card>}
        {entries.map((entry) => {
          const exercise = data.exercises.find((e) => e.id === entry.exerciseId);
          return (
            <Card key={entry.id} style={styles.gap}>
              <View style={styles.heading}>
                <Text style={styles.name}>{entry.name}</Text>
                {showEditor && <Pressable accessibilityRole="button" accessibilityLabel={`Заменить упражнение ${entry.name}`}
                  style={styles.icon} onPress={() => chooseReplacement(entry)}>
                  <SymbolView name="arrow.triangle.2.circlepath" size={22} tintColor={Colors.ink} />
                </Pressable>}
              </View>
              {!showEditor && data.settings?.showNotes && !!exercise?.note && <Text style={styles.text}>{exercise.note}</Text>}
              {showEditor && data.settings?.showNotes && exercise && <TextInput
                style={styles.note} value={notes[exercise.id] ?? exercise.note ?? ''}
                placeholder="Заметка к упражнению" placeholderTextColor={Colors.muted} maxLength={1000}
                accessibilityLabel={`Заметка к упражнению ${entry.name}`} returnKeyType="done"
                onChangeText={(value) => {
                  noteRef.current = { ...noteRef.current, [exercise.id]: value };
                  dirtyNotes.current.add(exercise.id);
                  setNotes(noteRef.current);
                }} onEndEditing={() => { void enqueue(() => saveNote(exercise.id)).catch(reportError); }} />}
              {showEditor ? entry.sets.map((set, index) => (
                <WorkoutSetRow key={`${entry.exerciseId}-${set.id}`} set={set} position={index + 1}
                  bodyweight={entry.bodyweight} showRir={!!data.settings?.showRir}
                  inputs={rowInputs(inputs[set.id], entry.exerciseId, set)}
                  onInput={(field, text) => editSet(set.id, entry.exerciseId, field, text)}
                  onBlur={() => { if (dirtySets.current.has(set.id)) void enqueue(() => saveSet(set.id, entry.exerciseId)).catch(reportError); }}
                  onCheck={() => check(set.id, entry.exerciseId, !set.completed)}
                  onRir={(rir) => { void enqueue(() => saveSet(set.id, entry.exerciseId, { rir })).catch(reportError); }} />
              )) : entry.sets.map((set, index) => (
                <Text key={set.id} style={styles.text}>
                  {index + 1}. {setLabel(set.copiedWeight ? null : set.actualWeightKg, set.copiedReps ? null : set.actualReps, entry.bodyweight)}{!set.completed && ' · без отметки'}
                  {data.settings?.showRir && set.completed && set.rir != null ? ` · RIR ${set.rir === 3 ? '3+' : set.rir}` : ''}
                </Text>
              ))}
              <Pressable accessibilityRole="button" accessibilityLabel={`История упражнения ${entry.name}`}
                style={styles.history} onPress={() => openHistory(entry.exerciseId)}>
                <Text style={styles.link}>История упражнения</Text>
              </Pressable>
            </Card>
          );
        })}
        {showEditor ? <PrimaryButton title={session.status === 'active' ? 'Завершить' : 'Готово'} disabled={finishing} onPress={finish} />
          : session.status === 'completed' && <PrimaryButton title="Изменить подходы" secondary onPress={() => setEditingHistory(true)} />}
        <PrimaryButton title="Удалить тренировку" secondary disabled={finishing} onPress={() => {
          confirmDeleteSession(controller, session, () => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.replace('Main', { screen: 'Workouts' });
          });
        }} />
      </ScreenShell>
      {session.status === 'active' && !session.backdated && session.restEndsAt && <WorkoutRestBanner deadline={session.restEndsAt}
        onExtend={() => { void controller.extendRest(id, 15).catch(reportError); }}
        onSkip={() => { void controller.stopRest(id, session.restEndsAt!).catch(reportError); }} />}
      {replacement && <ExercisePicker exercises={data.exercises} onCancel={() => setReplacement(null)}
        onPick={async (exercise) => {
          await enqueue(async () => {
            await controller.replaceSessionExercise(id, replacement, exercise.id);
            const before = entries.find((entry) => entry.id === replacement);
            if (before && before.exerciseId !== exercise.id) {
              const next = { ...inputRef.current };
              for (const set of before.sets) { delete next[set.id]; dirtySets.current.delete(set.id); }
              inputRef.current = next;
              setInputs(next);
            }
          });
          setReplacement(null);
        }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  gap: { gap: Spacing.s },
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  name: { flex: 1, ...Typography.h3, color: Colors.ink },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  metric: { ...Typography.h3, color: Colors.ink },
  text: { ...Typography.subhead, color: Colors.ink },
  note: { ...Typography.subhead, color: Colors.ink, backgroundColor: Colors.bg, padding: Spacing.m, borderRadius: Radii.s },
  history: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 },
  link: { ...Typography.captionSemibold, color: Colors.ink },
});
