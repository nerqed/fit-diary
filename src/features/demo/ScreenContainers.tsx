import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Alert } from 'react-native';

import type { MealActions } from '../../contracts/screens';
import {
  demoAssistantStates, demoDate, demoDayNutrition, demoMeals, demoProfile, demoWorkout, emptyProfile,
} from '../../mocks/demo';
import type { MainTabParamList } from '../../navigation/types';
import { AssistantScreen } from '../../screens/AssistantScreen';
import { DiaryScreen } from '../../screens/DiaryScreen';
import { ProfileScreen } from '../../screens/ProfileScreen';
import { TodayScreen } from '../../screens/TodayScreen';
import { WorkoutPreferences } from '../../screens/WorkoutPreferences';

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

export function AssistantContainer() {
  return (
    <AssistantScreen
      {...demoAssistantStates['not-configured']} onSendMessage={showDemoAction}
      onOpenSettings={showDemoAction} onRetry={showDemoAction}
    />
  );
}

export function ProfileContainer() {
  return (
    <ProfileScreen {...emptyProfile} fields={emptyProfile.fields.filter((field) => field.key !== 'waistCm')}
      workoutPreferences={<WorkoutPreferences />} onChangeField={showDemoAction} onChangeGoal={showDemoAction}
      onChangeCalculation={showDemoAction} onSave={showDemoAction} />
  );
}
