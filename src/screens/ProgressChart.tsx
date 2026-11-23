import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { formatDay } from '../features/workouts/workoutDates';
import { Colors, Spacing, Typography } from '../theme';

export type ProgressChartPoint = Readonly<{
  date: string;
  time: number;
  value: number | null;
  average?: number;
}>;

const chartHeight = 124;
const inset = Spacing.s;
const dayMs = 86_400_000;
const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
export const formatProgressValue = (value: number) => numberFormat.format(value);

/** A missing result at a given rep count breaks the line. Weights have a second, seven-day series. */
export function ProgressChart({ points, label, unit }: {
  points: readonly ProgressChartPoint[];
  label: string;
  unit: string;
}) {
  const [width, setWidth] = useState(0);
  const first = points[0];
  const last = points[points.length - 1];
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    if (point.value !== null) {
      min = Math.min(min, point.value);
      max = Math.max(max, point.value);
    }
    if (point.average !== undefined) {
      min = Math.min(min, point.average);
      max = Math.max(max, point.average);
    }
  }
  if (!first || !last || !Number.isFinite(min)) return null;

  const x = (time: number) => last.time === first.time ? width / 2
    : inset + (time - first.time) / (last.time - first.time) * (width - 2 * inset);
  const y = (value: number) => min === max ? chartHeight / 2
    : inset + (max - value) / (max - min) * (chartHeight - 2 * inset);
  const hasAverage = points.some((point) => point.average !== undefined);
  const raw: string[] = [];
  const average: string[] = [];
  let previousValue: number | null = null;
  let previousAverageTime: number | null = null;
  for (const point of points) {
    if (point.value !== null) {
      raw.push(`${previousValue === null ? 'M' : 'L'}${x(point.time)},${y(point.value)}`);
    }
    previousValue = point.value;
    if (point.average !== undefined) {
      const adjacent = previousAverageTime !== null && point.time - previousAverageTime <= 7 * dayMs;
      average.push(`${adjacent ? 'L' : 'M'}${x(point.time)},${y(point.average)}`);
      previousAverageTime = point.time;
    }
  }
  const startLabel = formatDay(first.date);
  const endLabel = formatDay(last.date);

  return (
    <View accessible accessibilityRole="image"
      accessibilityLabel={`${label}. ${startLabel} — ${endLabel}. От ${formatProgressValue(min)} до ${formatProgressValue(max)} ${unit}.`}>
      <View style={styles.plotRow}>
        <View style={[styles.scale, min === max && styles.flatScale]}>
          <Text style={styles.axis}>{formatProgressValue(max)}</Text>
          {min !== max && <Text style={styles.axis}>{formatProgressValue(min)}</Text>}
        </View>
        <View style={styles.plot} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          {width > 2 * inset && <Svg width={width} height={chartHeight}>
            <Line x1={0} x2={width} y1={y(max)} y2={y(max)} stroke={Colors.line} />
            {min !== max && <Line x1={0} x2={width} y1={y(min)} y2={y(min)} stroke={Colors.line} />}
            <Path d={raw.join(' ')} fill="none" stroke={hasAverage ? Colors.muted : Colors.ink}
              strokeWidth={hasAverage ? 1 : 2} strokeLinejoin="round" />
            {hasAverage && <Path d={average.join(' ')} fill="none" stroke={Colors.ink}
              strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />}
            {points.map((point, index) => point.value !== null && (
              <Circle key={index} cx={x(point.time)} cy={y(point.value)} r={3}
                fill={Colors.card} stroke={Colors.ink} strokeWidth={1.5} />
            ))}
          </Svg>}
        </View>
      </View>
      <View style={styles.dateRow}>
        <Text style={styles.axis}>{startLabel}</Text>
        {first.date !== last.date && <Text style={styles.axis}>{endLabel}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plotRow: { flexDirection: 'row', gap: Spacing.s },
  scale: { justifyContent: 'space-between' },
  flatScale: { justifyContent: 'center' },
  plot: { flex: 1, height: chartHeight },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between' },
  axis: { ...Typography.micro, color: Colors.muted },
});

export function ExerciseTrend({ values }: { values: readonly (number | null)[] }) {
  const recorded = values.filter((value): value is number => value !== null);
  if (!recorded.length) return null;
  const min = Math.min(...recorded);
  const max = Math.max(...recorded);
  const points = values.map((value, index) => value === null ? null : {
    x: values.length === 1 ? 24 : 3 + index * 42 / (values.length - 1),
    y: min === max ? 13 : 3 + (max - value) * 20 / (max - min),
  });
  const path = points.map((point, index) => point
    ? `${points[index - 1] ? 'L' : 'M'}${point.x},${point.y}` : '').join(' ');
  return <Svg width={48} height={26} accessible={false}>
    <Path d={path} fill="none" stroke={Colors.muted} strokeWidth={1.5} />
    {points.map((point, index) => point && <Circle key={index} cx={point.x} cy={point.y} r={2} fill={Colors.ink} />)}
  </Svg>;
}
