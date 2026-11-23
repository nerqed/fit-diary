import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { WorkoutSession } from '../features/workouts/model';
import { useWorkout } from '../features/workouts/WorkoutContext';
import { formatDay } from '../features/workouts/workoutDates';
import { Colors, Radii, Spacing, Typography } from '../theme';
import { confirmDeleteSession } from './deleteWorkoutSession';
import { SwipeDeleteRow } from './SwipeDeleteRow';
import { PrimaryButton } from './ui';

type Props = {
  day: string;
  today: string;
  sessions: readonly WorkoutSession[];
  onClose: () => void;
  onOpen: (session: WorkoutSession, edit?: boolean) => void;
  onCreate: () => void;
};

export function WorkoutDaySheet({ day, today, sessions, onClose, onOpen, onCreate }: Props) {
  const { controller, data, pending } = useWorkout();
  const [choosing, setChoosing] = useState(false);
  const starting = useRef(false);
  const intent = useRef<{ templateId: string; sessionId: string } | null>(null);
  const templates = data.templates.filter((item) => !item.archived);
  const title = choosing ? 'Выбрать шаблон' : 'Тренировки';

  function close() {
    if (!starting.current) onClose();
  }

  async function start(templateId: string) {
    if (starting.current || pending) return;
    starting.current = true;
    try {
      if (intent.current?.templateId !== templateId) {
        intent.current = { templateId, sessionId: controller.newId() };
      }
      const session = await controller.startSession(templateId, intent.current.sessionId, day);
      onOpen(session, session.status === 'completed');
    } catch (error) {
      Alert.alert('Не удалось добавить тренировку', error instanceof Error ? error.message : 'Попробуй ещё раз.');
    } finally {
      starting.current = false;
    }
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={close} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}
          accessibilityViewIsModal onAccessibilityEscape={close}>
          <View style={styles.header}>
            <View style={styles.body}>
              <Text style={styles.title} accessibilityRole="header">{title}</Text>
              <Text style={styles.caption}>{formatDay(day)} {day.slice(0, 4)}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" style={styles.icon} onPress={close}>
              <SymbolView name="xmark" size={18} tintColor={Colors.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {choosing ? <>
              {templates.map((template) => <Pressable key={template.id} accessibilityRole="button" disabled={pending}
                onPress={() => void start(template.id)} style={styles.row}>
                <Text style={[styles.name, styles.body]}>{template.name}</Text>
                <SymbolView name="chevron.right" size={16} tintColor={Colors.muted} />
              </Pressable>)}
              <PrimaryButton title="Создать новый шаблон" secondary disabled={pending} onPress={onCreate} />
            </> : <>
              {sessions.length === 0 && <Text style={styles.caption}>Тренировок за этот день пока нет.</Text>}
              {sessions.map((session) => {
                const remove = () => confirmDeleteSession(controller, session);
                return <SwipeDeleteRow key={session.id} label={`Удалить тренировку «${session.name}»`} onDelete={remove}>
                  <View style={styles.row}>
                    <Pressable accessibilityRole="button" onPress={() => onOpen(session)} style={styles.open}>
                      <Text style={styles.name}>{session.name}</Text>
                      <Text style={styles.caption}>{session.status === 'active' ? 'Продолжается' : 'Завершена'}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Удалить тренировку «${session.name}»`}
                      style={styles.icon} onPress={remove}>
                      <SymbolView name="trash" size={18} tintColor={Colors.muted} />
                    </Pressable>
                  </View>
                </SwipeDeleteRow>;
              })}
              {day <= today && <PrimaryButton title="Добавить тренировку за этот день"
                onPress={() => templates.length ? setChoosing(true) : onCreate()} />}
            </>}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl,
    backgroundColor: Colors.card, padding: Spacing.page, gap: Spacing.m },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { ...Typography.h2, color: Colors.ink },
  caption: { ...Typography.caption, color: Colors.muted },
  name: { ...Typography.bodySemibold, color: Colors.ink },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content: { gap: Spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, backgroundColor: Colors.card },
  body: { flex: 1 },
  open: { flex: 1, justifyContent: 'center', minHeight: 48, paddingVertical: Spacing.xs },
});
