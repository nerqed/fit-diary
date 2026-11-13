import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Today: undefined;
  Diary: undefined;
  Workouts: undefined;
  Progress: undefined;
  Assistant: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Profile: undefined;
};
