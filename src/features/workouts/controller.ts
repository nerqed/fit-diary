import { getBestWeightSeries, getExerciseHistory, getExerciseRecords, getPreviousExerciseSession, getRestRemainingSeconds } from './analytics';
import type { Exercise, PerformedSet, SetResult, WorkoutData, WorkoutRepository, WorkoutSession, WorkoutTemplate } from './model';

export type WorkoutState = Readonly<{
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: WorkoutData | null;
  pending: number;
  error: string | null;
}>;
export type PreviousSet = Readonly<{
  sessionId: string; startedAt: string; actualReps: number | null; actualWeightKg: number | null;
}>;
export type ComparedSet = PerformedSet & Readonly<{ previous: PreviousSet | null }>;
export type SessionView = Readonly<{
  session: WorkoutSession;
  exercises: readonly Readonly<{
    id: string; exerciseId: string; name: string; sets: readonly ComparedSet[];
  }>[];
  restRemainingSeconds: number | null;
}>;

export function sessionView(session: WorkoutSession, sessions: readonly WorkoutSession[], now: number): SessionView {
  return {
    session,
    restRemainingSeconds: getRestRemainingSeconds(session.restEndsAt, now),
    exercises: session.exercises.map((exercise, index) => {
      const previous = getPreviousExerciseSession(sessions, exercise.exerciseId, session.startedAt, session.id);
      const occurrence = session.exercises.slice(0, index).filter((item) => item.exerciseId === exercise.exerciseId).length;
      const previousEntryIds = [...new Set(previous?.sets.map((set) => set.sessionExerciseId) ?? [])];
      const previousSets = previous?.sets.filter((set) => set.sessionExerciseId === previousEntryIds[occurrence]) ?? [];
      return { id: exercise.id, exerciseId: exercise.exerciseId, name: exercise.name,
        sets: exercise.sets.map((set, setIndex) => {
          const old = previousSets.find((item) => item.setPosition === setIndex);
          return { ...set, previous: previous && old?.completed ? {
            sessionId: previous.sessionId, startedAt: previous.startedAt,
            actualReps: old.actualReps, actualWeightKg: old.actualWeightKg,
          } : null };
        }),
      };
    }),
  };
}

/** No UI/native imports: the designer's hook binds this store to whichever screens are supplied. */
export function createWorkoutController(repository: WorkoutRepository, dependencies: Readonly<{
  now: () => string; id: () => string; timeZone: () => string;
}>) {
  let state: WorkoutState = { status: 'idle', data: null, pending: 0, error: null };
  const listeners = new Set<() => void>();
  const publish = (change: Partial<WorkoutState>) => {
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  };
  const refreshData = async () => {
    const data = await repository.exportData();
    publish({ data, status: 'ready' });
  };
  async function perform<T>(action: () => Promise<T>): Promise<T> {
    publish({ pending: state.pending + 1, error: null });
    try {
      const value = await action();
      await refreshData();
      return value;
    } catch (error) {
      publish({ error: error instanceof Error ? error.message : 'Не удалось выполнить действие.', status: state.data ? 'ready' : 'error' });
      throw error;
    } finally { publish({ pending: state.pending - 1 }); }
  }
  return {
    getSnapshot: (): WorkoutState => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load() {
      publish({ status: 'loading' });
      await perform(() => repository.initialize());
    },
    refresh: () => perform(async () => undefined),
    /** Allocate once when opening a draft, then reuse its IDs for every save/retry. */
    newId: dependencies.id,
    newTemplate(): WorkoutTemplate {
      const now = dependencies.now();
      return { id: dependencies.id(), name: '', weekday: null, exercises: [], createdAt: now, updatedAt: now };
    },
    newExercise(): Exercise {
      const now = dependencies.now();
      return { id: dependencies.id(), name: '', aliases: [], origin: 'custom', archived: false, createdAt: now, updatedAt: now };
    },
    saveExercise: (exercise: Exercise) => perform(() => repository.saveExercise({ ...exercise, updatedAt: dependencies.now() })),
    saveTemplate: (template: WorkoutTemplate) => perform(() => repository.saveTemplate({ ...template, updatedAt: dependencies.now() })),
    copyTemplate: (templateId: string, copyId: string) => perform(() => repository.copyTemplate(templateId, copyId, dependencies.now())),
    deleteTemplate: (templateId: string) => perform(() => repository.deleteTemplate(templateId)),
    startSession: (templateId: string, sessionId: string) => perform(() => repository.startSession(templateId, sessionId, dependencies.now(), dependencies.timeZone())),
    updateSet: (sessionId: string, setId: string, result: SetResult) => perform(() => repository.updateSet(sessionId, setId, result, dependencies.now())),
    finishSession: (sessionId: string, status: 'completed' | 'abandoned') => perform(() => repository.finishSession(sessionId, status, dependencies.now())),
    startRest: (sessionId: string, seconds: number) => perform(async () => {
      if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) throw new Error('Укажите отдых от 1 до 86400 секунд.');
      const deadline = new Date(Date.parse(dependencies.now()) + seconds * 1000).toISOString();
      await repository.setRestDeadline(sessionId, deadline);
    }),
    stopRest: (sessionId: string) => perform(() => repository.setRestDeadline(sessionId, null)),
    getSessionView(sessionId: string, now: number): SessionView | null {
      const sessions = state.data?.sessions ?? [];
      const session = sessions.find((item) => item.id === sessionId);
      return session ? sessionView(session, sessions, now) : null;
    },
    getProgress(exerciseId: string, fixedReps: number) {
      const sessions = state.data?.sessions ?? [];
      return {
        history: getExerciseHistory(sessions, exerciseId),
        bestWeights: getBestWeightSeries(sessions, exerciseId, fixedReps),
        records: getExerciseRecords(sessions, exerciseId, fixedReps),
      };
    },
  };
}

export type WorkoutController = ReturnType<typeof createWorkoutController>;
