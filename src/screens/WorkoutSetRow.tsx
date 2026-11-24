import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ComparedSet } from '../features/workouts/controller';
import { Colors, Radii, Spacing, Typography } from '../theme';
import { Chip, Row } from './ui';

export type SetInputs = Readonly<{ weight?: string; reps?: string }>;

/** Keep editable decimal loads exact, including half kilograms above 100. */
export function showNumber(value: number) {
  return String(value).replace('.', ',');
}

export function displayedWeight(set: ComparedSet) {
  if (set.completed || set.actualWeightKg !== null) return set.actualWeightKg;
  return set.suggestedWeightKg;
}

export function setLabel(weight: number | null, reps: number | null, bodyweight: boolean) {
  const load = bodyweight && weight === 0 ? 'свой вес' : weight === null ? '—' : showNumber(weight);
  return `${load} × ${reps ?? '—'}`;
}

type Props = Readonly<{
  position: number; set: ComparedSet; bodyweight: boolean; showRir: boolean;
  inputs: SetInputs;
  onInput: (field: keyof SetInputs, text: string) => void;
  onBlur: () => void; onCheck: () => void; onRir: (rir: number | null) => void;
}>;

export function WorkoutSetRow({ position, set, bodyweight, showRir, inputs, onInput, onBlur, onCheck, onRir }: Props) {
  const [addingLoad, setAddingLoad] = useState(false);
  const kg = displayedWeight(set);
  const weight = inputs.weight ?? (kg === null || (bodyweight && kg === 0) ? '' : showNumber(kg));
  const reps = inputs.reps ?? String(set.actualReps ?? set.plannedReps);
  const ownWeight = bodyweight && !addingLoad && (weight === '' || Number(weight.replace(',', '.')) === 0);
  const planned = set.plannedWeightKg;
  const previous = set.previous;
  return (
    <View style={styles.section}>
      <View style={styles.line}>
        <Text style={styles.number}>{position}</Text>
        {ownWeight ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Свой вес. Добавить отягощение"
            style={styles.field} onPress={() => setAddingLoad(true)}>
            <Text style={styles.ownWeight}>свой вес</Text>
          </Pressable>
        ) : <>
          <TextInput value={weight} onChangeText={(v) => onInput('weight', v)} onEndEditing={onBlur}
            style={[styles.field, styles.input]} keyboardType="decimal-pad" selectTextOnFocus
            placeholder="—" placeholderTextColor={Colors.muted} accessibilityLabel={`Вес в килограммах, подход ${position}`} />
          <Text style={styles.meta}>кг</Text>
        </>}
        <TextInput value={reps} onChangeText={(v) => onInput('reps', v)} onEndEditing={onBlur}
          style={[styles.field, styles.input]} keyboardType="number-pad" selectTextOnFocus
          placeholder="—" placeholderTextColor={Colors.muted} accessibilityLabel={`Повторения, подход ${position}`} />
        <Text style={styles.meta}>повт.</Text>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: set.completed }}
          accessibilityLabel={`Отметка подхода ${position}`} onPress={onCheck}
          style={[styles.check, set.completed && styles.checked]}>
          <SymbolView name="checkmark" size={18} tintColor={set.completed ? Colors.white : Colors.muted} />
        </Pressable>
      </View>
      <View style={styles.hints}>
        <Text style={styles.meta}>Прошлый раз: {previous
          ? setLabel(previous.actualWeightKg, previous.actualReps, bodyweight) : '—'}</Text>
        {!set.completed && kg === null && inputs.weight === undefined && planned !== null && planned > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Подставить плановый вес ${showNumber(planned)} кг`}
            onPress={() => onInput('weight', showNumber(planned))} hitSlop={4}>
            <Text style={styles.link}>Из плана · {showNumber(planned)} кг</Text>
          </Pressable>
        )}
      </View>
      {showRir && set.completed && <>
        <Text style={styles.meta}>Повторений в запасе (RIR)</Text>
        <Row>{[0, 1, 2, 3].map((r) => (
          <Chip key={r} active={set.rir === r} title={r === 3 ? '3+' : String(r)}
            onPress={() => onRir(set.rir === r ? null : r)} />
        ))}</Row>
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.xs, paddingTop: Spacing.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  number: { ...Typography.captionSemibold, color: Colors.muted, minWidth: 16 },
  field: { flex: 1, minHeight: 44, borderRadius: Radii.s, backgroundColor: Colors.bg, justifyContent: 'center' },
  input: { ...Typography.bodySemibold, color: Colors.ink, textAlign: 'center', paddingHorizontal: Spacing.xs },
  ownWeight: { ...Typography.captionSemibold, color: Colors.ink, textAlign: 'center' },
  meta: { ...Typography.caption, color: Colors.muted },
  hints: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.m },
  link: { ...Typography.captionSemibold, color: Colors.ink },
  check: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.s,
    borderWidth: 1, borderColor: Colors.muted, backgroundColor: Colors.card },
  checked: { backgroundColor: Colors.accent, borderColor: Colors.accent },
});
