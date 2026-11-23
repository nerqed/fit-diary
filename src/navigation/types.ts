import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Today: undefined;
  Diary: undefined;
  Workouts: { day?: string } | undefined;
  Progress: undefined;
  Assistant: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Profile: undefined;
  WorkoutEditor: { templateId?: string; day?: string } | undefined;
  WorkoutSession: { sessionId: string; edit?: boolean };
  ExerciseHistory: { exerciseId: string };
  Backups: undefined;
};
