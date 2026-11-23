import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WorkoutProvider } from './src/features/workouts/WorkoutContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <WorkoutProvider>
        <RootNavigator />
      </WorkoutProvider>
    </SafeAreaProvider>
  );
}
