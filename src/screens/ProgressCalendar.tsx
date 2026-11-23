import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatDay } from '../features/workouts/workoutDates';
import { Colors, Radii, Spacing, Typography } from '../theme';
import { PrimaryButton } from './ui';

const weekdays = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const months = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const earliestMonth = '0001-01';

function adjacentMonth(month: string, step: number) {
  const first = new Date(`${month}-01T12:00:00Z`);
  first.setUTCMonth(first.getUTCMonth() + step);
  return first.toISOString().slice(0, 7);
}

export function ProgressCalendar({ selectedDay, today, markedDays, markLabel, openFutureMarks = false, onSelect }: {
  selectedDay: string;
  today: string;
  markedDays: ReadonlySet<string>;
  markLabel: string;
  openFutureMarks?: boolean;
  onSelect: (day: string) => void;
}) {
  const [month, setMonth] = useState(selectedDay.slice(0, 7));
  const [jump, setJump] = useState<string | null>(null);
  const lastMonth = useMemo(() => {
    let lastDay = today;
    if (openFutureMarks) {
      for (const date of markedDays) if (date > lastDay) lastDay = date;
    }
    return lastDay.slice(0, 7);
  }, [today, markedDays, openFutureMarks]);
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const dayCount = last.getUTCDate();
  const monthTitle = months.format(first);
  const target = jump?.replace(/^(\d{2})[. /-]?(\d{4})$/, '$2-$1');
  const validTarget = !!target && /^\d{4}-(0[1-9]|1[0-2])$/.test(target)
    && target >= earliestMonth && target <= lastMonth;
  const move = (value: string) => { setMonth(value); setJump(null); };

  return (
    <View style={styles.calendar}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Предыдущий месяц" disabled={month <= earliestMonth}
          style={styles.arrow} onPress={() => move(adjacentMonth(month, -1))}>
          <SymbolView name="chevron.left" size={18} tintColor={month <= earliestMonth ? Colors.line : Colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${monthTitle}, выбрать месяц и год`}
          style={styles.titleButton} onPress={() => setJump(jump === null ? `${month.slice(5)}.${month.slice(0, 4)}` : null)}>
          <Text style={styles.title}>{monthTitle}</Text>
          <SymbolView name="chevron.down" size={12} tintColor={Colors.muted} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Следующий месяц" disabled={month >= lastMonth}
          style={styles.arrow} onPress={() => move(adjacentMonth(month, 1))}>
          <SymbolView name="chevron.right" size={18} tintColor={month >= lastMonth ? Colors.line : Colors.ink} />
        </Pressable>
      </View>
      {jump !== null && <View style={styles.jump}>
        <TextInput autoFocus selectTextOnFocus style={styles.input} value={jump} onChangeText={setJump}
          keyboardType="numbers-and-punctuation" accessibilityLabel="Месяц и год в формате ММ.ГГГГ"
          placeholder="ММ.ГГГГ" placeholderTextColor={Colors.muted} />
        <View style={styles.jumpAction}>
          <PrimaryButton title="Перейти" secondary disabled={!validTarget} onPress={() => { if (validTarget) move(target); }} />
        </View>
      </View>}
      <View style={styles.week}>
        {weekdays.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}
      </View>
      {Array.from({ length: Math.ceil((dayCount + offset) / 7) }, (_, week) => (
        <View key={week} style={styles.week}>
          {weekdays.map((weekday, column) => {
            const number = week * 7 + column - offset + 1;
            if (number < 1 || number > dayCount) return <View key={weekday} style={styles.cell} />;
            const day = `${month}-${String(number).padStart(2, '0')}`;
            const marked = markedDays.has(day);
            const disabled = day > today && !(openFutureMarks && marked);
            const selected = day === selectedDay;
            return (
              <Pressable key={weekday} style={styles.cell} accessibilityRole="button"
                accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => onSelect(day)}
                accessibilityLabel={`${formatDay(day)} ${month.slice(0, 4)}${day === today ? ', сегодня' : ''}${marked ? ', ' + markLabel : ''}`}>
                <View style={[styles.tile, (selected || day === today) && styles.selected]}>
                  <View style={[styles.tileFill, marked && styles.marked]}>
                    <Text style={[styles.day, day === today && styles.todayText, marked && styles.markedText, disabled && styles.disabled]}>{number}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: { gap: Spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  titleButton: { flexDirection: 'row', gap: Spacing.xs, alignItems: 'center', minHeight: 44 },
  title: { ...Typography.bodySemibold, color: Colors.ink },
  week: { flexDirection: 'row', gap: Spacing.xs },
  weekday: { flex: 1, ...Typography.micro, color: Colors.muted, textAlign: 'center' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 36 },
  tile: {
    width: '100%', maxWidth: 36, height: 32, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radii.s, padding: 2, borderWidth: 2, borderColor: 'transparent',
  },
  tileFill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  marked: { backgroundColor: Colors.accent },
  selected: { borderWidth: 2, borderColor: Colors.ink },
  day: { ...Typography.captionSemibold, color: Colors.ink },
  todayText: { fontWeight: '700' },
  markedText: { color: Colors.white },
  disabled: { color: Colors.muted, opacity: 0.6 },
  jump: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  jumpAction: { flex: 1 },
  input: { flex: 1, ...Typography.body, color: Colors.ink, backgroundColor: Colors.bg,
    borderRadius: Radii.s, padding: Spacing.m, textAlign: 'center' },
});
