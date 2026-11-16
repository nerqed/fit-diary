import type { PerformedSet, WorkoutSession, WorkoutTimestamp } from './model';

/** This is external-load volume, not total work or body mass moved. */
export type ExerciseVolume = Readonly<{
  amountKgReps: number | null;
  knownAmountKgReps: number | null;
  knownSets: number;
  totalSets: number;
  state: 'complete' | 'partial' | 'missing';
}>;
export type ExerciseHistorySet = PerformedSet & Readonly<{
  sessionExerciseId: string;
  exerciseName: string;
  exercisePosition: number;
  setPosition: number;
}>;
export type ExerciseHistoryRow = Readonly<{
  sessionId: string;
  sessionName: string;
  exerciseId: string;
  /** Names are snapshots; IDs, not names, join the history. */
  exerciseNames: readonly string[];
  startedAt: WorkoutTimestamp;
  finishedAt: WorkoutTimestamp;
  timeZone: string;
  sets: readonly ExerciseHistorySet[];
  volume: ExerciseVolume;
}>;
export type BestWeightPoint = Readonly<{
  sessionId: string;
  startedAt: WorkoutTimestamp;
  timeZone: string;
  fixedReps: number;
  /** Null is a gap: this session has no completed known-weight set at these reps. */
  bestWeightKg: number | null;
}>;
export type WeightRecord = Readonly<{
  sessionId: string;
  startedAt: WorkoutTimestamp;
  timeZone: string;
  fixedReps: number;
  weightKg: number;
}>;
export type VolumeRecord = Readonly<{
  sessionId: string;
  startedAt: WorkoutTimestamp;
  timeZone: string;
  volumeKgReps: number;
}>;
export type ExerciseRecords = Readonly<{
  bestWeightAtReps: WeightRecord | null;
  bestCompleteVolume: VolumeRecord | null;
}>;

function instant(value: WorkoutTimestamp): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new RangeError('Некорректная дата тренировки.');
  return result;
}

function requireReps(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('Количество повторений должно быть положительным целым числом.');
  }
}

function validateActualValues(set: PerformedSet): void {
  if (set.actualWeightKg !== null && (!Number.isFinite(set.actualWeightKg) || set.actualWeightKg < 0)) {
    throw new RangeError('Вес должен быть конечным неотрицательным числом.');
  }
  if (set.actualReps !== null) requireReps(set.actualReps);
}

function volumeOf(sets: readonly ExerciseHistorySet[]): ExerciseVolume {
  const completed = sets.filter((set) => set.completed);
  let knownSets = 0;
  let knownAmountKgReps = 0;
  for (const set of completed) {
    validateActualValues(set);
    if (set.actualReps === null || set.actualWeightKg === null) continue;
    knownAmountKgReps += set.actualWeightKg * set.actualReps;
    if (!Number.isFinite(knownAmountKgReps)) throw new RangeError('Объём тренировки выходит за числовой диапазон.');
    knownSets += 1;
  }
  const totalSets = completed.length;
  const complete = totalSets > 0 && knownSets === totalSets;
  return {
    amountKgReps: complete ? knownAmountKgReps : null,
    knownAmountKgReps: knownSets > 0 ? knownAmountKgReps : null,
    knownSets,
    totalSets,
    state: complete ? 'complete' : knownSets > 0 ? 'partial' : 'missing',
  };
}

/** Completed sessions only, ordered by actual start instant; same-instant ties use stable IDs. */
export function getExerciseHistory(
  sessions: readonly WorkoutSession[],
  exerciseId: string,
): readonly ExerciseHistoryRow[] {
  return sessions.flatMap<ExerciseHistoryRow>((session) => {
    if (session.status !== 'completed') return [];
    if (session.finishedAt === null || instant(session.finishedAt) < instant(session.startedAt)) {
      throw new RangeError('Завершённая тренировка должна иметь корректное время окончания.');
    }
    const sets: ExerciseHistorySet[] = [];
    const exerciseNames: string[] = [];
    let matches = false;
    session.exercises.forEach((exercise, exercisePosition) => {
      if (exercise.exerciseId !== exerciseId) return;
      matches = true;
      if (!exerciseNames.includes(exercise.name)) exerciseNames.push(exercise.name);
      exercise.sets.forEach((set, setPosition) => sets.push({
        ...set, sessionExerciseId: exercise.id, exerciseName: exercise.name, exercisePosition, setPosition,
      }));
    });
    if (!matches) return [];
    return [{
      sessionId: session.id,
      sessionName: session.name,
      exerciseId,
      exerciseNames,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      timeZone: session.timeZone,
      sets,
      volume: volumeOf(sets),
    }];
  }).sort((left, right) => {
    const difference = instant(left.startedAt) - instant(right.startedAt);
    return difference || (left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0);
  });
}

/** Select the latest prior session which was already completed when this session started. */
export function getPreviousExerciseSession(
  sessions: readonly WorkoutSession[],
  exerciseId: string,
  beforeTimestamp: WorkoutTimestamp,
  excludeSessionId?: string,
): ExerciseHistoryRow | null {
  const cutoff = instant(beforeTimestamp);
  const history = getExerciseHistory(sessions, exerciseId).filter((row) => (
    row.sessionId !== excludeSessionId
    && instant(row.startedAt) < cutoff
    && instant(row.finishedAt) <= cutoff
  ));
  return history[history.length - 1] ?? null;
}

function bestAtReps(row: ExerciseHistoryRow, fixedReps: number): number | null {
  let best: number | null = null;
  for (const set of row.sets) {
    if (!set.completed || set.actualReps !== fixedReps || set.actualWeightKg === null) continue;
    validateActualValues(set);
    if (best === null || set.actualWeightKg > best) best = set.actualWeightKg;
  }
  return best;
}

export function getBestWeightSeries(
  sessions: readonly WorkoutSession[],
  exerciseId: string,
  fixedReps: number,
): readonly BestWeightPoint[] {
  requireReps(fixedReps);
  return getExerciseHistory(sessions, exerciseId).map((row) => ({
    sessionId: row.sessionId,
    startedAt: row.startedAt,
    timeZone: row.timeZone,
    fixedReps,
    bestWeightKg: bestAtReps(row, fixedReps),
  }));
}

/** Record definitions are explicit. There is no estimated 1RM or incomplete-volume record. */
export function getExerciseRecords(
  sessions: readonly WorkoutSession[],
  exerciseId: string,
  fixedReps: number,
): ExerciseRecords {
  requireReps(fixedReps);
  let bestWeightAtReps: WeightRecord | null = null;
  let bestCompleteVolume: VolumeRecord | null = null;
  for (const row of getExerciseHistory(sessions, exerciseId)) {
    const best = bestAtReps(row, fixedReps);
    // Strict comparison intentionally keeps the first chronological record on equal results.
    if (best !== null && (bestWeightAtReps === null || best > bestWeightAtReps.weightKg)) {
      bestWeightAtReps = {
        sessionId: row.sessionId, startedAt: row.startedAt, timeZone: row.timeZone, fixedReps, weightKg: best,
      };
    }
    const volume = row.volume.amountKgReps;
    if (volume !== null && (bestCompleteVolume === null || volume > bestCompleteVolume.volumeKgReps)) {
      bestCompleteVolume = {
        sessionId: row.sessionId, startedAt: row.startedAt, timeZone: row.timeZone, volumeKgReps: volume,
      };
    }
  }
  return { bestWeightAtReps, bestCompleteVolume };
}

/** Inject the current device-clock milliseconds. No interval survives app suspension. */
export function getRestRemainingSeconds(restEndsAt: WorkoutTimestamp | null, now: number): number | null {
  if (!Number.isFinite(now)) throw new RangeError('Некорректное текущее время.');
  if (restEndsAt === null) return null;
  return Math.max(0, Math.ceil((instant(restEndsAt) - now) / 1000));
}
