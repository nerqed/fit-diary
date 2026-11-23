import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SymbolView } from 'expo-symbols';
import type { ComponentType } from 'react';

import { AssistantContainer, DiaryContainer, ProfileContainer, TodayContainer } from '../features/demo/ScreenContainers';
import { WorkoutGate } from '../features/workouts/WorkoutContext';
import { BackupsScreen } from '../screens/BackupsScreen';
import { ExerciseHistoryScreen } from '../screens/ExerciseHistoryScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { WorkoutEditorScreen } from '../screens/WorkoutEditorScreen';
import { WorkoutSessionScreen } from '../screens/WorkoutSessionScreen';
import { WorkoutsScreen } from '../screens/WorkoutsScreen';
import { Colors } from '../theme';
import { tabIcons } from '../theme/tabIcons';
import type { MainTabParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function withWorkoutData(title: string, Screen: ComponentType) {
  return function WorkoutRoute() {
    return <WorkoutGate title={title}><Screen /></WorkoutGate>;
  };
}

const Workouts = withWorkoutData('Тренировки', WorkoutsScreen);
const Progress = withWorkoutData('Прогресс', ProgressScreen);
const Profile = withWorkoutData('Профиль', ProfileContainer);
const WorkoutEditor = withWorkoutData('Конструктор', WorkoutEditorScreen);
const WorkoutSession = withWorkoutData('Тренировка', WorkoutSessionScreen);
const ExerciseHistory = withWorkoutData('История упражнения', ExerciseHistoryScreen);
const Backups = withWorkoutData('Резервные копии', BackupsScreen);

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Today"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.ink,
        tabBarInactiveTintColor: Colors.muted,
        tabBarIcon: ({ color, size }) => {
          const name = tabIcons[route.name];
          return name === null ? null : <SymbolView name={name} size={size} tintColor={color} />;
        },
      })}
    >
      <Tab.Screen name="Today" component={TodayContainer} options={{ title: 'Сегодня' }} />
      <Tab.Screen name="Diary" component={DiaryContainer} options={{ title: 'Дневник' }} />
      <Tab.Screen name="Workouts" component={Workouts} options={{ title: 'Тренировки' }} />
      <Tab.Screen name="Progress" component={Progress} options={{ title: 'Прогресс' }} />
      <Tab.Screen name="Assistant" component={AssistantContainer} options={{ title: 'Помощник' }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Main" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="Profile" component={Profile} />
        <Stack.Screen name="WorkoutEditor" component={WorkoutEditor} />
        <Stack.Screen name="WorkoutSession" component={WorkoutSession} />
        <Stack.Screen name="ExerciseHistory" component={ExerciseHistory} />
        <Stack.Screen name="Backups" component={Backups} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
