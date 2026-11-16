import type { SFSymbol } from 'expo-symbols';

import type { MainTabParamList } from '../navigation/types';

/** Designer-owned placeholders. Replace null with an SF Symbol name when icons are chosen. */
export const tabIcons: Readonly<Record<keyof MainTabParamList, SFSymbol | null>> = {
  Today: null,
  Diary: null,
  Workouts: null,
  Progress: null,
  Assistant: null,
};
