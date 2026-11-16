import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MealActions } from '../../contracts/screens';
import {
  demoAssistantStates, demoDate, demoDayNutrition, demoExerciseBests, demoMeals,
  demoProfile, demoProgress, demoWeightHistory, demoWorkout, emptyProfile,
} from '../../mocks/demo';
import type { MainTabParamList } from '../../navigation/types';
import { AssistantScreen } from '../../screens/AssistantScreen';
import { DiaryScreen } from '../../screens/DiaryScreen';
import { ProfileScreen } from '../../screens/ProfileScreen';
import { ProgressScreen } from '../../screens/ProgressScreen';
import { TodayScreen } from '../../screens/TodayScreen';
import { WorkoutsScreen } from '../../screens/WorkoutsScreen';

/** Designer-facing callbacks have a visible demo response, never a fake successful save. */
function showDemoAction() {
  Alert.alert('Демонстрация', 'Действие пока не подключено. Данные не изменены и не сохранены.');
}

const demoMealActions: MealActions = {
  onAddMeal: showDemoAction,
  onOpenMeal: showDemoAction,
  onChangeMealType: showDemoAction,
  onChangeMealTimestamp: showDemoAction,
  onChangeDishGrams: showDemoAction,
  onDeleteMeal: showDemoAction,
};

export function TodayContainer({ navigation }: BottomTabScreenProps<MainTabParamList, 'Today'>) {
  return (
    <TodayScreen
      isDemo
      date={demoDate}
      goal={demoProfile.goal}
      dayNutrition={demoDayNutrition}
      meals={demoMeals}
      workout={demoWorkout}
      onOpenDiary={() => navigation.navigate('Diary')}
      onOpenWorkouts={() => navigation.navigate('Workouts')}
      {...demoMealActions}
    />
  );
}

export function DiaryContainer() {
  return (
    <DiaryScreen
      isDemo date={demoDate} dateLabel="Пример дня" meals={demoMeals}
      dayNutrition={demoDayNutrition} onSelectDate={showDemoAction} {...demoMealActions}
    />
  );
}

export function WorkoutsContainer() {
  return (
    <WorkoutsScreen
      isDemo workouts={[demoWorkout]} onChangeSet={showDemoAction}
      onReplaceExercise={showDemoAction} onStartRest={showDemoAction} onStopRest={showDemoAction}
    />
  );
}

export function ProgressContainer() {
  return (
    <ProgressScreen
      isDemo metrics={demoProgress} weightHistory={demoWeightHistory}
      exerciseBests={demoExerciseBests} onAddWeight={showDemoAction}
    />
  );
}

export function AssistantContainer() {
  return (
    <AssistantScreen
      {...demoAssistantStates['not-configured']} onSendMessage={showDemoAction}
      onOpenSettings={showDemoAction} onRetry={showDemoAction}
    />
  );
}

export function ProfileContainer() {
  // Profile sits outside the tab navigator, so it owns the bottom safe area.
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <ProfileScreen
        {...emptyProfile} onChangeField={showDemoAction} onChangeGoal={showDemoAction}
        onChangeCalculation={showDemoAction} onSave={showDemoAction}
      />
    </SafeAreaView>
  );
}
