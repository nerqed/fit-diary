import type { SFSymbol } from 'expo-symbols';

import type { MainTabParamList } from '../navigation/types';

/** Designer-owned SF Symbol names for the bottom tab bar. */
export const tabIcons: Readonly<Record<keyof MainTabParamList, SFSymbol | null>> = {
  Today: 'sun.max',
  Diary: 'book',
  Workouts: 'figure.strengthtraining.traditional',
  Progress: 'chart.line.uptrend.xyaxis',
  Assistant: 'bubble.left',
};
