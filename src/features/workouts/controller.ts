import { getExerciseProgress, getPreviousExerciseSession, getRestRemainingSeconds } from './analytics';
import type { Exercise, PerformedSet, SetResult, WorkoutData, WorkoutRepository, WorkoutSession, WorkoutSettings, WorkoutTemplate } from './model';
import { isBodyweightExercise, suggestWeights } from './progression';
import { localDay, validateDay, workoutStart } from './workoutDates';

export type WorkoutState = Readonly<{
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: WorkoutData | null;
  pending: number;
  error: string | null;
}>;
export type PreviousSet = Readonly<{
  sessionId: string; startedAt: string; actualReps: number | null; actualWeightKg: number | null;
}>;
export type ComparedSet = PerformedSet & Readonly<{ previous: PreviousSet | null; suggestedWeightKg: number | null }>;
export type SessionView = Readonly<{
  session: WorkoutSession;
  exercises: readonly Readonly<{
    id: string; exerciseId: string; name: string; bodyweight: boolean; sets: readonly ComparedSet[];
  }>[];
  restRemainingSeconds: number | null;
}>;

function restMilliseconds(seconds: number): number {
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) throw new Error('Укажите отдых от 1 до 86400 секунд.');
  return seconds * 1000;
}

export function sessionView(session: WorkoutSession, sessions: readonly WorkoutSession[], now: number, showRir = false): SessionView {
  return {
    session,
    restRemainingSeconds: getRestRemainingSeconds(session.restEndsAt, now),
    exercises: session.exercises.map((exercise, index) => {
      const previous = getPreviousExerciseSession(sessions, exercise.exerciseId, session.startedAt, session.id);
      const occurrence = session.exercises.slice(0, index).filter((item) => item.exerciseId === exercise.exerciseId).length;
      const previousEntryIds = [...new Set(previous?.sets.map((set) => set.sessionExerciseId) ?? [])];
      const previousSets = previous?.sets.filter((set) => set.sessionExerciseId === previousEntryIds[occurrence]) ?? [];
      const suggestions = suggestWeights(exercise.exerciseId, exercise.name, previous?.sets ?? [], showRir);
      return { id: exercise.id, exerciseId: exercise.exerciseId, name: exercise.name,
        bodyweight: isBodyweightExercise(exercise.exerciseId, exercise.name),
        sets: exercise.sets.map((set, setIndex) => {
          const old = previousSets.find((item) => item.setPosition === setIndex);
          const hasResult = old && (old.actualWeightKg !== null || old.actualReps !== null);
          return { ...set, suggestedWeightKg: old ? suggestions.get(old.id) ?? null : null, previous: previous && hasResult ? {
            sessionId: previous.sessionId, startedAt: previous.startedAt,
            actualReps: old.actualReps, actualWeightKg: old.actualWeightKg,
          } : null };
        }),
      };
    }),
  };
}

/** The device and SQLite test harness share this store. */
export function createWorkoutController(repository: WorkoutRepository, dependencies: Readonly<{
  now: () => string; id: () => string; timeZone: () => string;
}>) {
  let state: WorkoutState = { status: 'idle', data: null, pending: 0, error: null };
  const listeners = new Set<() => void>();
  // A copy may commit before its refreshed snapshot can be read. A retry of that
  // UI intent should read the snapshot again and share the already finished write.
  const copyWrites = new Map<string, { sourceId: string; write: Promise<WorkoutTemplate> }>();
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
  function startTime(day?: string) {
    const timeZone = dependencies.timeZone();
    return { timeZone, ...workoutStart(day, dependencies.now(), timeZone, state.data?.sessions ?? []) };
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
    async copyTemplate(templateId: string, copyId: string) {
      const copy = await perform(async () => {
        const existing = copyWrites.get(copyId);
        if (existing) {
          if (existing.sourceId !== templateId) throw new Error('Этот идентификатор копии относится к другому шаблону.');
          return existing.write;
        }
        const write = repository.copyTemplate(templateId, copyId, dependencies.now());
        copyWrites.set(copyId, { sourceId: templateId, write });
        try { return await write; }
        catch (error) { copyWrites.delete(copyId); throw error; }
      });
      copyWrites.delete(copyId);
      const saved = state.data?.templates.find((template) => template.id === copy.id);
      if (!saved) throw new Error('Сохранённая копия отсутствует в текущих данных. Повторите действие.');
      return saved;
    },
    deleteTemplate: (templateId: string) => perform(() => repository.deleteTemplate(templateId)),
    startSession: (templateId: string, sessionId: string, day?: string) => perform(() => {
      const { startedAt, timeZone, backdated } = startTime(day);
      return repository.startSession(templateId, sessionId, startedAt, timeZone, backdated);
    }),
    repeatSession: (sourceSessionId: string, sessionId: string, day?: string) => perform(() => {
      const { startedAt, timeZone, backdated } = startTime(day);
      return repository.repeatSession(sourceSessionId, sessionId, startedAt, timeZone, backdated);
    }),
    replaceSessionExercise: (sessionId: string, sessionExerciseId: string, exerciseId: string) =>
      perform(() => repository.replaceSessionExercise(sessionId, sessionExerciseId, exerciseId)),
    updateSet: (sessionId: string, setId: string, result: SetResult, restSeconds?: number) => perform(() => {
      const now = dependencies.now();
      const deadline = restSeconds === undefined ? undefined : new Date(Date.parse(now) + restMilliseconds(restSeconds)).toISOString();
      return repository.updateSet(sessionId, setId, result, now, deadline);
    }),
    finishSession: (sessionId: string, status: 'completed' | 'abandoned') => perform(async () => {
      const session = await repository.getSession(sessionId);
      await repository.finishSession(sessionId, status, session?.backdated ? session.startedAt : dependencies.now());
    }),
    startRest: (sessionId: string, seconds: number) => perform(async () => {
      const deadline = new Date(Date.parse(dependencies.now()) + restMilliseconds(seconds)).toISOString();
      await repository.setRestDeadline(sessionId, deadline);
    }),
    extendRest: (sessionId: string, seconds: number) => perform(async () => {
      const duration = restMilliseconds(seconds);
      // Compare inside SQLite so a simultaneous skip, extension or completion is respected.
      for (;;) {
        const deadline = (await repository.getSession(sessionId))?.restEndsAt;
        if (!deadline || Date.parse(deadline) <= Date.parse(dependencies.now())) return false;
        const extended = new Date(Date.parse(deadline) + duration).toISOString();
        if (await repository.setRestDeadline(sessionId, extended, deadline)) return true;
      }
    }),
    stopRest: (sessionId: string, expectedDeadline?: string) => perform(async () => {
      const deadline = expectedDeadline ?? (await repository.getSession(sessionId))?.restEndsAt;
      return deadline ? repository.setRestDeadline(sessionId, null, deadline) : false;
    }),
    saveBodyWeight: (day: string, weightKg: number) => perform(async () => {
      const today = localDay(new Date(dependencies.now()), dependencies.timeZone());
      if (validateDay(day) > today) throw new RangeError('Выберите сегодня или прошедший день.');
      await repository.saveBodyWeight(day, weightKg);
    }),
    saveSettings: (settings: WorkoutSettings) => perform(() => repository.saveSettings(settings)),
    getSessionView(sessionId: string, now: number): SessionView | null {
      const sessions = state.data?.sessions ?? [];
      const session = sessions.find((item) => item.id === sessionId);
      return session ? sessionView(session, sessions, now, state.data?.settings?.showRir) : null;
    },
    getProgress: (exerciseId: string, fixedReps: number) => getExerciseProgress(state.data?.sessions ?? [], exerciseId, fixedReps),
  };
}

export type WorkoutController = ReturnType<typeof createWorkoutController>;
