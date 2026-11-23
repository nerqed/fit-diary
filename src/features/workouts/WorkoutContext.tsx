import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';

import { EmptyState, ScreenShell } from '../../screens/ScreenShell';
import { PrimaryButton } from '../../screens/ui';
import { WorkoutRestExpiry } from '../../screens/WorkoutRestTimer';
import { Colors } from '../../theme';
import type { WorkoutController } from './controller';
import { openWorkoutController } from './device';
import type { WorkoutData } from './model';

type WorkoutAccess = { controller: WorkoutController; data: WorkoutData; pending: boolean };
type WorkoutContextValue = { ready: WorkoutAccess | null; error: string; retry: () => void };
const WorkoutContext = createContext<WorkoutContextValue | null>(null);
const noSubscription = () => () => {};
const noSnapshot = () => null;

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const [controller, setController] = useState<WorkoutController | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    void openWorkoutController().then(
      (value) => { if (mounted) setController(value); },
      (cause: unknown) => { if (mounted) setError(cause instanceof Error ? cause.message : 'Не удалось открыть базу тренировок.'); },
    );
    return () => { mounted = false; };
  }, [attempt]);

  const state = useSyncExternalStore(controller?.subscribe ?? noSubscription, controller?.getSnapshot ?? noSnapshot);
  const ready = controller && state?.data ? { controller, data: state.data, pending: state.pending > 0 } : null;
  const retry = () => { setError(''); setAttempt((value) => value + 1); };
  return (
    <WorkoutContext.Provider value={{ ready, error, retry }}>
      {children}
      {ready && <WorkoutRestExpiry controller={ready.controller} session={ready.data.sessions.find((s) => s.status === 'active')} />}
    </WorkoutContext.Provider>
  );
}

export function useWorkout(): WorkoutAccess {
  const context = useContext(WorkoutContext);
  if (!context?.ready) throw new Error('Экран тренировок открыт без контроллера.');
  return context.ready;
}

export function WorkoutGate({ title, children }: { title: string; children: ReactNode }) {
  const context = useContext(WorkoutContext);
  if (!context) throw new Error('Отсутствует WorkoutProvider.');
  if (context.ready) return children;
  return (
    <ScreenShell title={title}>
      {context.error ? <>
        <EmptyState text={context.error} />
        <PrimaryButton title="Повторить" onPress={context.retry} />
      </> : <ActivityIndicator color={Colors.ink} accessibilityLabel="Загрузка тренировок" />}
    </ScreenShell>
  );
}
