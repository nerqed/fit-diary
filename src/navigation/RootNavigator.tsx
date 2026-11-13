import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from 'react-native';

import {
  AssistantContainer,
  DiaryContainer,
  ProfileContainer,
  ProgressContainer,
  TodayContainer,
  WorkoutsContainer,
} from '../features/demo/ScreenContainers';
import type { MainTabParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs({ navigation }: NativeStackScreenProps<RootStackParamList, 'Main'>) {
  return (
    <Tab.Navigator
      initialRouteName="Today"
      screenOptions={{
        headerRight: () => <Button title="Профиль" onPress={() => navigation.navigate('Profile')} />,
        tabBarIcon: () => null,
      }}
    >
      <Tab.Screen name="Today" component={TodayContainer} options={{ title: 'Сегодня' }} />
      <Tab.Screen name="Diary" component={DiaryContainer} options={{ title: 'Дневник' }} />
      <Tab.Screen name="Workouts" component={WorkoutsContainer} options={{ title: 'Тренировки' }} />
      <Tab.Screen name="Progress" component={ProgressContainer} options={{ title: 'Прогресс' }} />
      <Tab.Screen name="Assistant" component={AssistantContainer} options={{ title: 'Помощник' }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Main">
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="Profile"
          component={ProfileContainer}
          options={{ title: 'Профиль', headerBackButtonDisplayMode: 'minimal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
