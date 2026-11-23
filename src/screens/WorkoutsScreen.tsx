import { useRef } from 'react';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActionSheetIOS, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useWorkout } from '../features/workouts/WorkoutContext';
import type { WorkoutSession, WorkoutTemplate } from '../features/workouts/model';
import { localDay } from '../features/workouts/workoutDates';
import { suggestedTemplate } from '../features/workouts/workoutLibrary';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { Colors, Radii, Spacing, Typography, weekdayLabel } from '../theme';
import { SectionHeader } from '../theme/components';
import { ScreenShell } from './ScreenShell';
import { SwipeDeleteRow } from './SwipeDeleteRow';
import { PrimaryButton } from './ui';

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Workouts'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function WorkoutsScreen() {
  const navigation = useNavigation<Navigation>();
  const { controller, data, pending } = useWorkout();
  const busy = useRef(false);
  const intent = useRef<{ key: string; id: string } | null>(null);
  const active = data.sessions.find((session) => session.status === 'active');
  const templates = data.templates.filter((template) => !template.archived);
  const suggested = suggestedTemplate(templates, data.sessions);
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

  function openSession(session: WorkoutSession) {
    navigation.navigate('WorkoutSession', session.status === 'completed'
      ? { sessionId: session.id, edit: true } : { sessionId: session.id });
  }

  function start(template: WorkoutTemplate) {
    void act(`start:${template.id}:${localDay()}`, async (id) => openSession(await controller.startSession(template.id, id)));
  }

  function confirmDelete(template: WorkoutTemplate) {
    const hasHistory = data.sessions.some((session) => session.templateId === template.id);
    const action = hasHistory ? 'Архивировать' : 'Удалить';
    const message = hasHistory ? 'Шаблон исчезнет из библиотеки. Записанные тренировки сохранятся в истории.' : undefined;
    Alert.alert(`${action} «${template.name}»?`, message, [
      { text: 'Отмена', style: 'cancel' },
      { text: action, style: 'destructive', onPress: () => {
        void act(`delete:${template.id}`, () => controller.deleteTemplate(template.id));
      } },
    ]);
  }

  function showActions(template: WorkoutTemplate) {
    ActionSheetIOS.showActionSheetWithOptions({
      title: template.name, options: ['Изменить', 'Скопировать', 'Удалить', 'Отмена'],
      cancelButtonIndex: 3, destructiveButtonIndex: 2,
    }, (index) => {
      if (index === 0) navigation.navigate('WorkoutEditor', { templateId: template.id });
      if (index === 1) {
        void act(`copy:${template.id}`, async (id) => {
          const copy = await controller.copyTemplate(template.id, id);
          navigation.navigate('WorkoutEditor', { templateId: copy.id });
        });
      }
      if (index === 2) confirmDelete(template);
    });
  }

  return (
    <ScreenShell title="Тренировки">
      {active ? <PrimaryButton title={`Продолжить: ${active.name}`} onPress={() => openSession(active)} />
        : suggested ? <PrimaryButton title={`Начать: ${suggested.name}`} disabled={pending} onPress={() => start(suggested)} />
          : <PrimaryButton title="Создать тренировку" onPress={() => navigation.navigate('WorkoutEditor')} />}
      {templates.length > 0 && <SectionHeader title="Мои шаблоны" />}
      {templates.map((template) => (
        <SwipeDeleteRow key={template.id} label={`Удалить шаблон «${template.name}»`} onDelete={() => confirmDelete(template)}>
          <View style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Начать тренировку «${template.name}»`}
              disabled={pending} onPress={() => start(template)} style={styles.content}>
              {template.weekday && <Text style={styles.meta}>{weekdayLabel[template.weekday]}</Text>}
              <Text style={styles.name}>{template.name}</Text>
              <Text style={styles.meta} numberOfLines={2}>
                {template.exercises.map((entry) => catalog.get(entry.exerciseId)).join(' · ')}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Действия с шаблоном «${template.name}»`}
              disabled={pending} onPress={() => showActions(template)} style={styles.actions}>
              <Text style={styles.name}>…</Text>
            </Pressable>
          </View>
        </SwipeDeleteRow>
      ))}
      {(active || suggested) && <PrimaryButton secondary title="Создать тренировку" onPress={() => navigation.navigate('WorkoutEditor')} />}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: Radii.l },
  content: { flex: 1, padding: Spacing.l, gap: Spacing.xs },
  actions: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  name: { ...Typography.h3, color: Colors.ink },
  meta: { ...Typography.caption, color: Colors.muted },
});
