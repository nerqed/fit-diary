/** Designer-owned design tokens. All visual values live here. */

export const Colors = {
  bg: '#F4F4F4',
  card: '#FFFFFF',
  ink: '#1A1A1A',
  muted: '#6B6B6B',
  line: '#E5E5E5',
  /** Accent = monochromatic dark. Buttons, active tab, ring fill. */
  accent: '#1A1A1A',
  accentSurface: '#EBEBEB',
  /** Amber: approximate values, warnings. */
  amber: '#7A5600',
  amberSurface: '#FBF0D2',
  /** Red: errors, failures. */
  red: '#A63B2A',
  redSurface: '#FBE9E5',
  /** Ring/chart track (unfilled). */
  track: '#E1E6E2',
  white: '#FFFFFF',
  /** Tab bar background (semi-transparent). */
  tabBg: 'rgba(255,255,255,0.88)',
} as const;

export const Typography = {
  h1: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.4, lineHeight: 37 },
  h2: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.2, lineHeight: 28 },
  h3: { fontSize: 20, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 17, fontWeight: '400' as const, lineHeight: 22 },
  bodySemibold: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
  subhead: { fontSize: 15, fontWeight: '400' as const, lineHeight: 20 },
  subheadSemibold: { fontSize: 15, fontWeight: '600' as const, lineHeight: 20 },
  caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  captionSemibold: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  micro: { fontSize: 11, fontWeight: '400' as const, lineHeight: 16 },
} as const;

export const Spacing = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 20,
  xxl: 24,
  page: 20,
} as const;

export const Radii = {
  s: 12,
  m: 16,
  l: 24,
  xl: 28,
  full: 9999,
} as const;

/** Formats a number for display: 1 decimal for <100, integer for ≥100, thousands separator. */
export function fmt(v: number): string {
  const a = Math.abs(v);
  const r = a >= 100 ? Math.round(v) : a >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  if (Math.abs(r) >= 1000) {
    const thousands = Math.floor(Math.abs(r) / 1000);
    const rest = String(Math.abs(r) % 1000).padStart(3, '0');
    return `${r < 0 ? '-' : ''}${thousands} ${rest}`;
  }
  return String(r).replace('.', ',');
}

/** Returns a display string for a nutrient value, respecting null and partial coverage. */
export function nutrientDisplay(amount: number | null, knownAmount: number | null, approximate: boolean, state: 'complete' | 'partial' | 'missing', unit: string): string {
  if (state === 'missing') return 'нет данных';
  if (state === 'partial' && knownAmount !== null) return `не менее ${fmt(knownAmount)} ${unit}`;
  if (amount !== null) return `${approximate ? '≈\u202F' : ''}${fmt(amount)} ${unit}`;
  return 'нет данных';
}

/** Short label for NutritionSource. */
export const sourceLabel: Record<string, string> = {
  label: 'этикетка',
  off: 'OFF',
  reference: 'справочник',
  recipe: 'рецепт',
  ai: 'примерно',
  store: 'магазин',
};

/** Short label for MealType. */
export const mealTypeLabel: Record<string, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};

/** Weekday label map (matches WorkoutWeekday). */
export const weekdayLabel: Record<string, string> = {
  monday: 'пн', tuesday: 'вт', wednesday: 'ср',
  thursday: 'чт', friday: 'пт', saturday: 'сб', sunday: 'вс',
};

/** Russian unit label for NutrientUnit. */
export function unitLabel(unit: string): string {
  return ({ kcal: 'ккал', g: 'г', mg: 'мг', 'µg': 'мкг' } as Record<string, string>)[unit] ?? unit;
}
