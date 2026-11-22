import { StyleSheet, Text, View } from 'react-native';

import type { DiaryScreenProps, LocalDate } from '../contracts/screens';
import { Card, CoverageBar, SectionHeader } from '../theme/components';
import { Colors, Spacing, Typography, nutrientDisplay, unitLabel } from '../theme';
import { EmptyState, ScreenShell } from './ScreenShell';
import { Chip, MealRow, Row } from './ui';

function shift(date: LocalDate, days: number): LocalDate {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DiaryScreen({ isDemo, date, dateLabel, meals, dayNutrition, onSelectDate, onOpenMeal }: DiaryScreenProps) {
  const cov = dayNutrition.dataCoverage;
  return (
    <ScreenShell title="Дневник" subtitle={dateLabel} isDemo={isDemo}>
      <Row>
        <Chip title="← Вчера" onPress={() => onSelectDate(shift(date, -1))} />
        <Chip title={date} active onPress={() => onSelectDate(date)} />
        <Chip title="Завтра →" onPress={() => onSelectDate(shift(date, 1))} />
      </Row>

      <Card>
        {meals.length === 0
          ? <EmptyState text="В этот день записей нет." />
          : meals.map((m, i) => <MealRow key={m.id} meal={m} first={i === 0} onPress={() => onOpenMeal(m.id)} />)}
      </Card>

      <SectionHeader title="Нутриенты за день" />
      <Card>
        {dayNutrition.nutrients.map((n, i) => {
          const missing = n.coverage.state === 'missing';
          return (
            <View key={n.key} style={[styles.nRow, i > 0 && styles.nBorder]}>
              <Text style={styles.nLabel}>{n.label}</Text>
              <Text style={[styles.nValue, missing && styles.nMissing, n.approximate && styles.nApprox]}>
                {nutrientDisplay(n.amount, n.knownAmount, n.approximate, n.coverage.state, unitLabel(n.unit))}
              </Text>
            </View>
          );
        })}
        <CoverageBar complete={cov.completeNutrients} partial={cov.partialNutrients} missing={cov.missingNutrients} />
      </Card>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  nRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, gap: Spacing.m },
  nBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  nLabel: { ...Typography.subhead, color: Colors.ink, flex: 1 },
  nValue: { ...Typography.subheadSemibold, color: Colors.ink },
  nMissing: { color: Colors.muted, fontWeight: '400' },
  nApprox: { color: Colors.amber },
});
