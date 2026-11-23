import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useWorkout } from '../features/workouts/WorkoutContext';
import { defaultWorkoutSettings, type WorkoutSettings } from '../features/workouts/model';
import type { RootStackParamList } from '../navigation/types';
import { Colors, Spacing, Typography } from '../theme';
import { Card } from '../theme/components';

const options = [
  { key: 'showRir', label: 'Повторения в запасе (RIR)' },
  { key: 'showNotes', label: 'Заметки к упражнениям' },
] as const;

export function WorkoutPreferences() {
  const { controller, data, pending } = useWorkout();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [expanded, setExpanded] = useState(false);
  const saving = useRef(false);
  const settings = data.settings ?? defaultWorkoutSettings;

  async function toggle(key: keyof WorkoutSettings, value: boolean) {
    if (saving.current) return;
    saving.current = true;
    try {
      await controller.saveSettings({ ...settings, [key]: value });
    } catch (error) {
      Alert.alert('Настройки', error instanceof Error ? error.message : 'Не удалось сохранить настройку.');
    } finally {
      saving.current = false;
    }
  }

  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.row}>
        <Text style={styles.heading}>Дополнительно</Text>
        <SymbolView name={expanded ? 'chevron.up' : 'chevron.down'} size={16} tintColor={Colors.ink} />
      </Pressable>
      {expanded && options.map(({ key, label }) => (
        <View key={key} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Switch accessibilityLabel={label} value={settings[key]} disabled={pending}
            trackColor={{ true: Colors.ink }} onValueChange={(value) => void toggle(key, value)} />
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Backups')} style={styles.row}>
        <Text style={styles.label}>Резервные копии</Text>
        <SymbolView name="chevron.forward" size={16} tintColor={Colors.muted} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.m, minHeight: 44 },
  heading: { ...Typography.h3, flex: 1, color: Colors.ink },
  label: { ...Typography.body, flex: 1, color: Colors.ink },
});
