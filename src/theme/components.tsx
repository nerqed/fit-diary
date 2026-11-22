/**
 * Designer-owned shared UI components.
 * Import only from src/screens — never from logic, services or mocks.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { NutrientValue } from '../contracts/screens';
import { Colors, Radii, Spacing, Typography, fmt, nutrientDisplay, sourceLabel } from './index';

// ---------------------------------------------------------------------------
// RingChart — progress arc without react-native-svg (half-circle clip trick)
// ---------------------------------------------------------------------------

interface RingChartProps {
  value: number;
  maxValue: number;
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
}

export function RingChart({ value, maxValue, size = 200, strokeWidth = 14, children }: RingChartProps) {
  const pct = maxValue > 0 ? Math.min(1, Math.max(0, value / maxValue)) : 0;
  const angle = pct * 360;
  const r = size / 2;

  const rightRot = `${Math.min(angle, 180) - 135}deg`;
  const leftRot = `${Math.max(0, angle - 180) + 45}deg`;

  const arcStyle: (extra?: object) => object = (extra) => ({
    position: 'absolute' as const,
    top: 0,
    width: size,
    height: size,
    borderRadius: r,
    borderWidth: strokeWidth,
    // Half-ring: only top+right borders are painted, then rotated into the clip window.
    borderColor: 'transparent',
    borderTopColor: Colors.accent,
    borderRightColor: Colors.accent,
    ...extra,
  });

  return (
    <View style={{ width: size, height: size }}>
      {/* Track */}
      <View style={[
        StyleSheet.absoluteFill,
        { borderRadius: r, borderWidth: strokeWidth, borderColor: Colors.track },
      ]} />
      {/* Right fill (0–180°) */}
      <View style={{ position: 'absolute', top: 0, right: 0, width: r, height: size, overflow: 'hidden' }}>
        <View style={arcStyle({ left: -r, transform: [{ rotate: rightRot }] })} />
      </View>
      {/* Left fill (180–360°) */}
      {angle > 180 && (
        <View style={{ position: 'absolute', top: 0, left: 0, width: r, height: size, overflow: 'hidden' }}>
          <View style={arcStyle({ left: 0, transform: [{ rotate: leftRot }] })} />
        </View>
      )}
      {/* Centre content */}
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        {children}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------

export function SectionHeader({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.secRow}>
      <Text style={styles.secTitle}>{title}</Text>
      {action !== undefined && <Text style={styles.secAction}>{action}</Text>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// NutrientBar  — single BЖУ row with label, value and progress bar
// ---------------------------------------------------------------------------

interface NutrientBarProps {
  nutrient: NutrientValue;
  compact?: boolean;
}

export function NutrientBar({ nutrient, compact = false }: NutrientBarProps) {
  const { label, unit, amount, knownAmount, target, coverage, approximate } = nutrient;
  const displayVal = nutrientDisplay(amount, knownAmount, approximate, coverage.state, unit);
  const filled = target !== null && target > 0
    ? Math.min(1, (amount ?? knownAmount ?? 0) / target)
    : 0;
  const isPartial = coverage.state === 'partial';

  return (
    <View style={compact ? styles.barRowCompact : styles.barRow}>
      <View style={styles.barLabelRow}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={[styles.barValue, isPartial && styles.barValueAmber]}>
          {displayVal}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[
          styles.barFill,
          isPartial && styles.barFillAmber,
          { width: `${Math.round(filled * 100)}%` },
        ]} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// CoverageBar — three-segment bar (complete / partial / missing)
// ---------------------------------------------------------------------------

interface CoverageBarProps {
  complete: number;
  partial: number;
  missing: number;
}

export function CoverageBar({ complete, partial, missing }: CoverageBarProps) {
  const total = complete + partial + missing;
  if (total === 0) return null;
  const pC = complete / total;
  const pP = partial / total;
  const pM = missing / total;
  return (
    <View>
      <View style={styles.covBar}>
        <View style={[styles.covSeg, styles.covComplete, { flex: pC }]} />
        <View style={[styles.covSeg, styles.covPartial, { flex: pP }]} />
        <View style={[styles.covSeg, styles.covMissing, { flex: pM }]} />
      </View>
      <Text style={styles.covText}>
        Нутриенты: {complete} полных · {partial} частично · {missing} нет данных
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SourceTag — small chip showing data source
// ---------------------------------------------------------------------------

export function SourceTag({ source, approximate }: { source: string; approximate?: boolean }) {
  const label = approximate ? 'примерно' : (sourceLabel[source] ?? source);
  const isApprox = approximate === true;
  return (
    <View style={[styles.tag, isApprox && styles.tagAmber]}>
      <Text style={[styles.tagText, isApprox && styles.tagTextAmber]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// NoData — "нет данных" with dashed underline
// ---------------------------------------------------------------------------

export function NoData() {
  return (
    <Text style={styles.noData}>нет данных</Text>
  );
}

// ---------------------------------------------------------------------------
// DemoNotice — subtle "демо" badge
// ---------------------------------------------------------------------------

export function DemoNotice() {
  return (
    <View style={styles.demoTag}>
      <Text style={styles.demoText}>демо</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// NumericValue — formatted number with unit
// ---------------------------------------------------------------------------

export function NumericValue({ value, unit, approximate }: {
  value: number | null; unit: string; approximate?: boolean;
}) {
  if (value === null) return <NoData />;
  return (
    <Text>
      {approximate === true ? '≈\u202F' : ''}{fmt(value)}{'\u202F'}{unit}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.l,
    padding: Spacing.l,
  },
  secRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.s,
    marginHorizontal: 2,
  },
  secTitle: {
    ...Typography.subheadSemibold,
    color: Colors.muted,
  },
  secAction: {
    ...Typography.subheadSemibold,
    color: Colors.accent,
  },
  barRow: { gap: Spacing.xs },
  barRowCompact: { gap: 2 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { ...Typography.caption, color: Colors.muted },
  barValue: { ...Typography.captionSemibold, color: Colors.ink },
  barValueAmber: { color: Colors.amber },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.track, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  barFillAmber: { backgroundColor: Colors.amber },
  covBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: Spacing.m },
  covSeg: { height: 8 },
  covComplete: { backgroundColor: Colors.accent },
  covPartial: { backgroundColor: Colors.amber },
  covMissing: { backgroundColor: Colors.track },
  covText: { ...Typography.micro, color: Colors.muted, marginTop: Spacing.xs },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: '#E9EDE9',
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.s,
    paddingVertical: 3,
  },
  tagAmber: { backgroundColor: Colors.amberSurface },
  tagText: { ...Typography.micro, color: Colors.muted },
  tagTextAmber: { color: Colors.amber },
  noData: {
    ...Typography.caption,
    color: Colors.muted,
    textDecorationLine: 'underline',
    textDecorationStyle: 'dashed',
    textDecorationColor: Colors.muted,
  },
  demoTag: {
    backgroundColor: Colors.accentSurface,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.s,
    paddingVertical: 2,
  },
  demoText: { ...Typography.micro, color: Colors.muted },
});
