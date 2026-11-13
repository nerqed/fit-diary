import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';

import { demoMeals, demoProgress, demoWorkout, emptyProfileFields } from '../../mocks/demo';
import type { MainTabParamList } from '../../navigation/types';
import { AssistantScreen } from '../../screens/AssistantScreen';
import { DiaryScreen } from '../../screens/DiaryScreen';
import { ProfileScreen } from '../../screens/ProfileScreen';
import { ProgressScreen } from '../../screens/ProgressScreen';
import { TodayScreen } from '../../screens/TodayScreen';
import { WorkoutsScreen } from '../../screens/WorkoutsScreen';

export function TodayContainer({ navigation }: BottomTabScreenProps<MainTabParamList, 'Today'>) {
  return (
    <TodayScreen
      meals={demoMeals}
      workout={demoWorkout}
      onOpenDiary={() => navigation.navigate('Diary')}
      onOpenWorkouts={() => navigation.navigate('Workouts')}
    />
  );
}

export function DiaryContainer() {
  return <DiaryScreen dateLabel="Пример дня" meals={demoMeals} />;
}

export function WorkoutsContainer() {
  return <WorkoutsScreen workouts={[demoWorkout]} />;
}

export function ProgressContainer() {
  return <ProgressScreen metrics={demoProgress} />;
}

export function AssistantContainer() {
  return <AssistantScreen connectionState="not-configured" />;
}

export function ProfileContainer() {
  // Profile sits outside the tab navigator, so it owns the bottom safe area.
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <ProfileScreen fields={emptyProfileFields} />
    </SafeAreaView>
  );
}
