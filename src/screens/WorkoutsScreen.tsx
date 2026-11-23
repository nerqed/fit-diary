import { useRef } from 'react';
import { useNavigation, useRoute, type CompositeNavigationProp, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, StyleSheet, Text } from 'react-native';

import { useWorkout } from '../features/workouts/WorkoutContext';
import type { WorkoutSession, WorkoutTemplate } from '../features/workouts/model';
import { formatDay, localDay, sessionDay } from '../features/workouts/workoutDates';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { Colors, Spacing, Typography, weekdayLabel } from '../theme';
import { Card, SectionHeader } from '../theme/components';
import { ScreenShell } from './ScreenShell';
import { Chip, PrimaryButton, Row } from './ui';

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Workouts'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function WorkoutsScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<RouteProp<MainTabParamList, 'Workouts'>>();
  const { controller, data, pending } = useWorkout();
  const busy = useRef(false);
  const intent = useRef<{ key: string; id: string } | null>(null);
  const today = localDay();
  const day = route.params?.day === today ? undefined : route.params?.day;
  const targetDay = day ?? today;
  const active = data.sessions.find((session) => session.status === 'active');
  const pastDay = day !== undefined && day < today;
  const canStart = !active || pastDay;
  // The repository lists sessions newest first. A retro entry only repeats workouts up to its own day.
  const last = data.sessions.find((session) => session.status === 'completed' && (!day || sessionDay(session) <= day));
  const catalog = new Map(data.exercises.map((exercise) => [exercise.id, exercise.name]));

  async function act(key: string, operation: (id: string) => Promise<void>) {
    if (busy.current || pending) return;
    busy.current = true;
    try {
      if (intent.current?.key !== key) intent.current = { key, id: controller.newId() };
      await operation(intent.current.id);
      intent.current = null;
    } catch (error) {
      Alert.alert('Не удалось выполнить действие', error instanceof Error ? error.message : 'Попробуйте ещё раз.');
    } finally {
      busy.current = false;
    }
  }

  function openStarted(session: WorkoutSession) {
    if (route.params?.day) navigation.setParams({ day: undefined });
    navigation.navigate('WorkoutSession', session.backdated && session.status === 'completed'
      ? { sessionId: session.id, edit: true } : { sessionId: session.id });
  }

  function confirmDelete(template: WorkoutTemplate) {
    Alert.alert('Удалить шаблон?', `«${template.name}». Проведённые тренировки сохранятся в истории.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => {
        void act(`delete:${template.id}`, () => controller.deleteTemplate(template.id));
      } },
    ]);
  }

  return (
    <ScreenShell title="Тренировки">
      {day && (
        <Card style={styles.card}>
          <Text style={styles.name}>Запись за {formatDay(day)}</Text>
          <PrimaryButton secondary title="Перейти к сегодняшнему дню" onPress={() => navigation.setParams({ day: undefined })} />
        </Card>
      )}
      {active && (
        <Card style={styles.card}>
          <Text style={styles.meta}>Начата {formatDay(sessionDay(active))}</Text>
          <Text style={styles.name}>{active.name}</Text>
          <PrimaryButton title="Продолжить тренировку" onPress={() => navigation.navigate('WorkoutSession', { sessionId: active.id })} />
        </Card>
      )}
      {last && canStart && (
        <Card style={styles.card}>
          <Text style={styles.meta}>{formatDay(sessionDay(last))} · {last.name}</Text>
          <PrimaryButton title="Повторить прошлую тренировку" disabled={pending}
            onPress={() => { void act(`repeat:${last.id}:${targetDay}`, async (id) => openStarted(await controller.repeatSession(last.id, id, day))); }} />
        </Card>
      )}
      {data.templates.length > 0 && <SectionHeader title="Мои шаблоны" />}
      {data.templates.map((template) => (
        <Card key={template.id} style={styles.card}>
          {template.weekday && <Text style={styles.meta}>{weekdayLabel[template.weekday]}</Text>}
          <Text style={styles.name}>{template.name}</Text>
          <Text style={styles.meta} numberOfLines={2}>
            {template.exercises.map((entry) => catalog.get(entry.exerciseId)).join(' · ')}
          </Text>
          {canStart && <PrimaryButton title={pastDay ? `Заполнить за ${formatDay(day)}` : 'Начать'} disabled={pending}
            onPress={() => { void act(`start:${template.id}:${targetDay}`, async (id) => openStarted(await controller.startSession(template.id, id, day))); }} />}
          <Row>
            <Chip title="Изменить" onPress={() => navigation.navigate('WorkoutEditor', { templateId: template.id, day })} />
            <Chip title="Скопировать" onPress={() => {
              void act(`copy:${template.id}`, async (id) => {
                const copy = await controller.copyTemplate(template.id, id);
                navigation.navigate('WorkoutEditor', { templateId: copy.id, day });
              });
            }} />
            <Chip title="Удалить" onPress={() => confirmDelete(template)} />
          </Row>
        </Card>
      ))}
      <PrimaryButton title={data.templates.length ? 'Создать тренировку' : 'Создай первую тренировку'}
        secondary={data.templates.length > 0} onPress={() => navigation.navigate('WorkoutEditor', { day })} />
      <PrimaryButton title="Резервные копии" secondary onPress={() => navigation.navigate('Backups')} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.m },
  name: { ...Typography.h3, color: Colors.ink },
  meta: { ...Typography.caption, color: Colors.muted },
});
