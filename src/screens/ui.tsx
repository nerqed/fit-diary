import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MealPreview } from '../contracts/screens';
import { SourceTag } from '../theme/components';
import { Colors, Radii, Spacing, Typography, fmt, mealTypeLabel } from '../theme';

export function PrimaryButton({ title, onPress, disabled = false, secondary = false }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }) => [
        styles.btn, secondary && styles.btnSecondary, disabled && styles.btnDisabled,
        pressed && styles.btnPressed,
      ]}
    >
      <Text style={[styles.btnText, secondary && styles.btnTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ title, active = false, onPress }: { title: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{title}</Text>
    </Pressable>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

/** One meal line: time, type, foods, kcal and source/approximate tag. */
export function MealRow({ meal, onPress, first }: { meal: MealPreview; onPress: () => void; first: boolean }) {
  const kcal = meal.nutrition.energy;
  const firstDish = meal.dishes[0];
  return (
    <Pressable
      accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [styles.meal, !first && styles.mealBorder, pressed && styles.btnPressed]}
    >
      <View style={styles.thumb}><Text style={styles.thumbText}>{meal.photoUri !== null ? 'фото' : meal.time}</Text></View>
      <View style={styles.mealBody}>
        <View style={styles.mealTitleRow}>
          <Text style={styles.mealTitle}>{mealTypeLabel[meal.type] ?? meal.name}</Text>
          {meal.approximate ? <SourceTag source="ai" approximate /> : firstDish !== undefined && <SourceTag source={firstDish.source} />}
        </View>
        <Text style={styles.mealFoods} numberOfLines={1}>{meal.time} · {meal.foods.join(', ')}</Text>
      </View>
      <View style={styles.kcal}>
        <Text style={styles.kcalValue}>{kcal.amount === null ? '—' : `${meal.approximate ? '≈' : ''}${fmt(kcal.amount)}`}</Text>
        <Text style={styles.kcalUnit}>{kcal.amount === null ? 'нет данных' : 'ккал'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: Colors.accent, borderRadius: Radii.m, paddingVertical: 15,
    alignItems: 'center', borderBottomWidth: 3, borderBottomColor: '#000',
  },
  btnSecondary: { backgroundColor: Colors.accentSurface, borderBottomColor: '#D6D6D6' },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { opacity: 0.75, transform: [{ translateY: 1 }] },
  btnText: { ...Typography.bodySemibold, color: Colors.white },
  btnTextSecondary: { color: Colors.ink },
  chip: { paddingHorizontal: Spacing.m, paddingVertical: 7, borderRadius: Radii.full, backgroundColor: Colors.card },
  chipActive: { backgroundColor: Colors.accent },
  chipText: { ...Typography.captionSemibold, color: Colors.ink },
  chipTextActive: { color: Colors.white },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  meal: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingVertical: Spacing.m },
  mealBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  thumb: { width: 44, height: 44, borderRadius: Radii.s, backgroundColor: Colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  thumbText: { ...Typography.micro, color: Colors.muted },
  mealBody: { flex: 1, minWidth: 0, gap: 2 },
  mealTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  mealTitle: { ...Typography.subheadSemibold, color: Colors.ink },
  mealFoods: { ...Typography.caption, color: Colors.muted },
  kcal: { alignItems: 'flex-end' },
  kcalValue: { ...Typography.subheadSemibold, color: Colors.ink },
  kcalUnit: { ...Typography.micro, color: Colors.muted },
});
