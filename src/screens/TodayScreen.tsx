import { StyleSheet, Text, View } from 'react-native';

import type { Goal, MealAddMethod, TodayScreenProps } from '../contracts/screens';
import { Card, CoverageBar, NutrientBar, RingChart, SectionHeader } from '../theme/components';
import { Colors, Spacing, Typography, fmt } from '../theme';
import { EmptyState, ScreenShell } from './ScreenShell';
import { Chip, MealRow, PrimaryButton, Row } from './ui';

const goalLabel: Record<Goal, string> = { gain: 'Набор массы', cut: 'Сушка', maintain: 'Поддержание' };
const addMethods: readonly Readonly<{ method: MealAddMethod; title: string }>[] = [
  { method: 'text', title: 'Текстом' }, { method: 'label', title: 'Этикетка' }, { method: 'manual', title: 'Вручную' },
];

export function TodayScreen({
  isDemo, goal, dayNutrition, meals, workout, onOpenDiary, onOpenWorkouts, onAddMeal, onOpenMeal,
}: TodayScreenProps) {
  const energy = dayNutrition.summary.energy;
  const eaten = energy.amount ?? energy.knownAmount ?? 0;
  const target = energy.target;
  const left = target === null ? null : Math.max(0, target - eaten);
  const sets = workout.exercises.flatMap((e) => e.sets);
  const doneSets = sets.filter((s) => s.completed).length;
  const cov = dayNutrition.dataCoverage;

  return (
    <ScreenShell title="Сегодня" subtitle={workout.weekdayLabel} isDemo={isDemo}>
      <Card>
        {goal !== null && <Text style={styles.goal}>{goalLabel[goal]}</Text>}
        <View style={styles.ringRow}>
          <RingChart value={eaten} maxValue={target ?? 0} size={128} strokeWidth={12}>
            <Text style={styles.ringValue}>{left === null ? fmt(eaten) : fmt(left)}</Text>
            <Text style={styles.ringCaption}>{left === null ? 'ккал съедено' : 'ккал осталось'}</Text>
          </RingChart>
          <View style={styles.macros}>
            <NutrientBar nutrient={dayNutrition.summary.protein} compact />
            <NutrientBar nutrient={dayNutrition.summary.fat} compact />
            <NutrientBar nutrient={dayNutrition.summary.carbohydrate} compact />
            <NutrientBar nutrient={dayNutrition.summary.fiber} compact />
          </View>
        </View>
        <CoverageBar complete={cov.completeNutrients} partial={cov.partialNutrients} missing={cov.missingNutrients} />
      </Card>

      <PrimaryButton title="Сфоткать еду" onPress={() => onAddMeal('photo')} />
      <Row>{addMethods.map((m) => <Chip key={m.method} title={m.title} onPress={() => onAddMeal(m.method)} />)}</Row>

      <SectionHeader title="Приёмы пищи" />
      <Card>
        {meals.length === 0
          ? <EmptyState text="Пока ничего не записано. Сфоткай первую тарелку." />
          : meals.map((m, i) => <MealRow key={m.id} meal={m} first={i === 0} onPress={() => onOpenMeal(m.id)} />)}
        <Text style={styles.link} onPress={onOpenDiary} accessibilityRole="link">Весь дневник</Text>
      </Card>

      <SectionHeader title="Тренировка" />
      <Card>
        <Text style={styles.wName}>{workout.name}</Text>
        <Text style={styles.wMeta}>{workout.exercises.length} упражнений · {doneSets} из {sets.length} подходов</Text>
        <View style={styles.gap} />
        <PrimaryButton title={doneSets > 0 ? 'Продолжить' : 'Начать'} secondary onPress={onOpenWorkouts} />
      </Card>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  goal: { ...Typography.captionSemibold, color: Colors.muted, marginBottom: Spacing.m },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.l },
  ringValue: { ...Typography.h2, color: Colors.ink },
  ringCaption: { ...Typography.micro, color: Colors.muted },
  macros: { flex: 1, gap: Spacing.s },
  link: { ...Typography.subheadSemibold, color: Colors.accent, paddingTop: Spacing.m },
  wName: { ...Typography.h3, color: Colors.ink },
  wMeta: { ...Typography.caption, color: Colors.muted, marginTop: 2 },
  gap: { height: Spacing.m },
});
