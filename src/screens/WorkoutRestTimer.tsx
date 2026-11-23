import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, AppState, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getRestRemainingSeconds } from '../features/workouts/analytics';
import type { WorkoutController } from '../features/workouts/controller';
import type { WorkoutSession } from '../features/workouts/model';
import { Colors, Spacing, Typography } from '../theme';
import { Card } from '../theme/components';
import { Chip } from './ui';

/** The app owns the expiry even when another screen covers the session. */
export function WorkoutRestExpiry({ controller, session }: {
  controller: WorkoutController; session?: WorkoutSession;
}) {
  const id = session?.id;
  const deadline = session?.status === 'active' && !session.backdated ? session.restEndsAt : null;
  useEffect(() => {
    if (!id || !deadline) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let settling = false;
    const arm = () => {
      clearTimeout(timeout);
      if (settling || AppState.currentState !== 'active') return;
      const delay = Date.parse(deadline) - Date.now();
      if (delay > 0) {
        timeout = setTimeout(arm, Math.min(delay, 2_147_483_647));
        return;
      }
      settling = true;
      // Only the caller that clears this exact deadline can signal its expiry.
      void controller.stopRest(id, deadline).then((cleared) => {
        if (cleared && AppState.currentState === 'active') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => Vibration.vibrate());
        }
      }).catch((error: unknown) => {
        settling = false;
        Alert.alert('Не удалось завершить отдых', error instanceof Error ? error.message : 'Попробуйте ещё раз.');
      });
    };
    arm();
    const listener = AppState.addEventListener('change', arm);
    return () => { clearTimeout(timeout); listener.remove(); };
  }, [controller, id, deadline]);
  return null;
}

export function WorkoutRestBanner({ deadline, onExtend, onSkip }: {
  deadline: string; onExtend: () => void; onSkip: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  const [slide] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!mounted || reduceMotion) return;
      slide.setValue(Spacing.xl);
      Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    });
    return () => { mounted = false; slide.stopAnimation(); };
  }, [slide]);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 500);
    const listener = AppState.addEventListener('change', tick);
    return () => { clearInterval(timer); listener.remove(); };
  }, [deadline]);
  const seconds = getRestRemainingSeconds(deadline, now) ?? 0;
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.dock}>
      <Animated.View style={{ transform: [{ translateY: slide }] }}>
        <Card style={styles.banner}>
          <View style={styles.time}>
            <Text style={styles.label}>Отдых</Text>
            <Text style={styles.count} accessibilityLabel={`Осталось секунд: ${seconds}`}>{time}</Text>
          </View>
          <Chip title="+15 с" onPress={onExtend} />
          <Chip title="Пропустить" onPress={onSkip} />
        </Card>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  dock: { backgroundColor: Colors.bg, paddingHorizontal: Spacing.page, paddingBottom: Spacing.s },
  banner: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.s },
  time: { flexGrow: 1 },
  count: { ...Typography.h3, color: Colors.ink, fontVariant: ['tabular-nums'] },
  label: { ...Typography.caption, color: Colors.muted },
});
