import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { SymbolView } from 'expo-symbols';
import { Button } from 'react-native';

import {
  AssistantContainer,
  DiaryContainer,
  ProfileContainer,
  ProgressContainer,
  TodayContainer,
  WorkoutsContainer,
} from '../features/demo/ScreenContainers';
import { tabIcons } from '../theme/tabIcons';
import type { MainTabParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs({ navigation }: NativeStackScreenProps<RootStackParamList, 'Main'>) {
  return (
    <Tab.Navigator
      initialRouteName="Today"
      screenOptions={({ route }) => ({
        headerRight: () => <Button title="Профиль" onPress={() => navigation.navigate('Profile')} />,
        tabBarIcon: ({ color, size }) => {
          const name = tabIcons[route.name];
          return name === null ? null : <SymbolView name={name} size={size} tintColor={color} />;
        },
      })}
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
