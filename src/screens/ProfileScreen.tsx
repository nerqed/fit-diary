import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { Goal, NormCalculationParameters, ProfileField, ProfileFieldChange, ProfileScreenProps } from '../contracts/screens';
import { Card, SectionHeader } from '../theme/components';
import { Colors, Radii, Spacing, Typography, fmt } from '../theme';
import { ScreenShell } from './ScreenShell';
import { Chip, PrimaryButton, Row } from './ui';

const goals: readonly Readonly<{ value: Goal; title: string }>[] = [
  { value: 'gain', title: 'Набор' }, { value: 'maintain', title: 'Поддержание' }, { value: 'cut', title: 'Сушка' },
];

function FieldRow({ field, onChange }: { field: ProfileField; onChange: (c: ProfileFieldChange) => void }) {
  if (field.type === 'select') {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{field.label}</Text>
        <Row>{field.options.map((o) => (
          <Chip key={o.value} title={o.label} active={field.value === o.value}
            onPress={() => onChange({ key: field.key, type: 'select', value: o.value })} />
        ))}</Row>
      </View>
    );
  }
  const isNum = field.type === 'number';
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{field.label}{isNum && field.unit !== null ? `, ${field.unit}` : ''}</Text>
      <TextInput
        style={styles.input} defaultValue={field.value === null ? '' : String(field.value)}
        placeholder="не указано" placeholderTextColor={Colors.muted}
        keyboardType={isNum ? 'decimal-pad' : 'default'}
        onEndEditing={(e) => {
          const t = e.nativeEvent.text.trim();
          if (isNum) {
            const v = Number(t.replace(',', '.'));
            onChange({ key: field.key, type: 'number', value: t === '' || !Number.isFinite(v) ? null : v });
          } else {
            onChange({ key: field.key, type: 'text', value: t === '' ? null : t });
          }
        }}
      />
    </View>
  );
}

export function ProfileScreen({
  isDemo, fields, goal, calculationFields, calculatedBmrKcal, calculatedDailyKcal, onChangeField, onChangeGoal, onChangeCalculation, onSave,
}: ProfileScreenProps) {
  return (
    <ScreenShell title="Профиль" isDemo={isDemo}>
      <Card>
        <Text style={styles.label}>Цель</Text>
        <Row>{goals.map((g) => (
          <Chip key={g.value} title={g.title} active={goal === g.value} onPress={() => onChangeGoal(goal === g.value ? null : g.value)} />
        ))}</Row>
      </Card>
      <Card>{fields.map((f) => <FieldRow key={f.key} field={f} onChange={onChangeField} />)}</Card>

      <SectionHeader title="Расчёт нормы · Миффлин — Сан-Жеор" />
      <Card>
        {calculationFields.map((f) => (
          <FieldRow key={f.key} field={f} onChange={(c) => onChangeCalculation({ [c.key]: c.value } as unknown as Partial<NormCalculationParameters>)} />
        ))}
        <View style={styles.result}>
          <View><Text style={styles.label}>BMR</Text><Text style={styles.big}>{calculatedBmrKcal === null ? '—' : fmt(calculatedBmrKcal)}</Text></View>
          <View><Text style={styles.label}>Норма в день</Text><Text style={styles.big}>{calculatedDailyKcal === null ? '—' : `${fmt(calculatedDailyKcal)} ккал`}</Text></View>
        </View>
        <Text style={styles.hint}>Расчёт ориентировочный, не медицинская рекомендация.</Text>
      </Card>
      <PrimaryButton title="Сохранить" onPress={onSave} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.s, paddingVertical: Spacing.s },
  label: { ...Typography.caption, color: Colors.muted, marginBottom: Spacing.xs },
  input: { ...Typography.body, color: Colors.ink, backgroundColor: Colors.bg, borderRadius: Radii.s, padding: 12 },
  result: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.m },
  big: { ...Typography.h3, color: Colors.ink },
  hint: { ...Typography.micro, color: Colors.muted, marginTop: Spacing.m },
});
