import type { BodyWeight, PerformedSet, WorkoutSession, WorkoutTimestamp } from './model';
import { isBodyweightExercise } from './progression';
import { addDays, validateDay } from './workoutDates';

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

function volumeOf(sets: readonly PerformedSet[]): ExerciseVolume {
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
  let latest: WorkoutSession | undefined;
  let latestStart = -Infinity;
  for (const session of sessions) {
    if (session.id === excludeSessionId || session.status !== 'completed' || !session.finishedAt) continue;
    const start = instant(session.startedAt);
    if (start >= cutoff || start < latestStart || instant(session.finishedAt) > cutoff) continue;
    if (start === latestStart && latest && latest.id >= session.id) continue;
    if (session.exercises.some((exercise) => exercise.exerciseId === exerciseId)) {
      latest = session;
      latestStart = start;
    }
  }
  return latest ? getExerciseHistory([latest], exerciseId)[0] ?? null : null;
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

function weightSeriesIn(history: readonly ExerciseHistoryRow[], fixedReps: number): readonly BestWeightPoint[] {
  requireReps(fixedReps);
  return history.map((row) => ({
    sessionId: row.sessionId,
    startedAt: row.startedAt,
    timeZone: row.timeZone,
    fixedReps,
    bestWeightKg: bestAtReps(row, fixedReps),
  }));
}

export function getBestWeightSeries(sessions: readonly WorkoutSession[], exerciseId: string, fixedReps: number) {
  return weightSeriesIn(getExerciseHistory(sessions, exerciseId), fixedReps);
}

/** Record definitions are explicit. There is no estimated 1RM or incomplete-volume record. */
function recordsIn(history: readonly ExerciseHistoryRow[]) {
  const weights = new Map<number, WeightRecord>();
  let bestCompleteVolume: VolumeRecord | null = null;
  for (const row of history) {
    const bodyweight = isBodyweightExercise(row.exerciseId, row.exerciseNames[0] ?? '');
    for (const set of row.sets) {
      const { actualReps, actualWeightKg } = set;
      if (!set.completed || actualReps === null || actualWeightKg === null) continue;
      if (bodyweight && actualWeightKg === 0) continue; // No external load to compare.
      const best = weights.get(actualReps);
      if (!best || actualWeightKg > best.weightKg) {
        weights.set(actualReps, { sessionId: row.sessionId, startedAt: row.startedAt,
          timeZone: row.timeZone, fixedReps: actualReps, weightKg: actualWeightKg });
      }
    }
    const volume = row.volume.amountKgReps;
    if (volume !== null && !(bodyweight && volume === 0) && (bestCompleteVolume === null || volume > bestCompleteVolume.volumeKgReps)) {
      bestCompleteVolume = {
        sessionId: row.sessionId, startedAt: row.startedAt, timeZone: row.timeZone, volumeKgReps: volume,
      };
    }
  }
  return { weights, bestCompleteVolume };
}

function exerciseRecordsIn(history: readonly ExerciseHistoryRow[], fixedReps: number): ExerciseRecords {
  requireReps(fixedReps);
  const { weights, bestCompleteVolume } = recordsIn(history);
  return { bestWeightAtReps: weights.get(fixedReps) ?? null, bestCompleteVolume };
}

export function getExerciseRecords(sessions: readonly WorkoutSession[], exerciseId: string, fixedReps: number) {
  return exerciseRecordsIn(getExerciseHistory(sessions, exerciseId), fixedReps);
}

export function getExerciseProgress(sessions: readonly WorkoutSession[], exerciseId: string, fixedReps: number) {
  const history = getExerciseHistory(sessions, exerciseId);
  return { history, bestWeights: weightSeriesIn(history, fixedReps), records: exerciseRecordsIn(history, fixedReps) };
}

export type SessionRecord = Readonly<{ exerciseId: string; exerciseName: string }> & (
  | Readonly<{ kind: 'weight'; reps: number; weightKg: number }>
  | Readonly<{ kind: 'volume'; volumeKgReps: number }>
);

export function getSessionSummary(session: WorkoutSession, sessions: readonly WorkoutSession[]) {
  const sets = session.exercises.flatMap((exercise) => exercise.sets);
  const volume = volumeOf(sets);
  const records: SessionRecord[] = [];
  if (session.status === 'completed') {
    const start = instant(session.startedAt);
    const earlier = sessions.filter((other) => other.id !== session.id && other.status === 'completed'
      && other.finishedAt !== null && instant(other.finishedAt) <= start
      && (instant(other.startedAt) < start || other.id < session.id));
    const exerciseNames = new Map(session.exercises.map((exercise) => [exercise.exerciseId, exercise.name]));
    for (const [exerciseId, exerciseName] of exerciseNames) {
      const previous = recordsIn(getExerciseHistory(earlier, exerciseId));
      const current = recordsIn(getExerciseHistory([session], exerciseId));
      for (const [reps, { weightKg }] of current.weights) {
        const best = previous.weights.get(reps);
        if (!best || weightKg > best.weightKg) records.push({ exerciseId, exerciseName, kind: 'weight', reps, weightKg });
      }
      const best = current.bestCompleteVolume;
      if (best && (!previous.bestCompleteVolume || best.volumeKgReps > previous.bestCompleteVolume.volumeKgReps)) {
        records.push({ exerciseId, exerciseName, kind: 'volume', volumeKgReps: best.volumeKgReps });
      }
    }
  }
  return { completedSets: volume.totalSets, totalSets: sets.length, volume, records };
}

export type WeightTrendPoint = BodyWeight & Readonly<{ averageKg: number }>;

function averageWeightIn(points: readonly BodyWeight[], firstDay: string, lastDay: string) {
  const entries = points.filter((point) => point.date >= firstDay && point.date <= lastDay);
  return entries.length ? entries.reduce((sum, point) => sum + point.weightKg, 0) / entries.length : null;
}

/** Each window covers seven calendar days. Days without weigh-ins carry no weight in the average. */
export function getWeightTrend(entries: readonly BodyWeight[], asOfDay?: string) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const end = asOfDay === undefined ? sorted.at(-1)?.date : validateDay(asOfDay);
  const points: WeightTrendPoint[] = [];
  if (!end) return { points, weeklyChangeKg: null };
  let windowStart = 0;
  let windowSum = 0;
  for (const entry of sorted) {
    if (entry.date > end) break;
    const firstDay = addDays(entry.date, -6);
    while (windowStart < points.length && points[windowStart]!.date < firstDay) {
      windowSum -= points[windowStart++]!.weightKg;
    }
    windowSum += entry.weightKg;
    points.push({ ...entry, averageKg: windowSum / (points.length - windowStart + 1) });
  }
  const current = averageWeightIn(points, addDays(end, -6), end);
  const previous = averageWeightIn(points, addDays(end, -13), addDays(end, -7));
  const weeklyChangeKg = current !== null && previous !== null ? current - previous : null;
  return { points, weeklyChangeKg };
}

/** Inject the current device-clock milliseconds. No interval survives app suspension. */
export function getRestRemainingSeconds(restEndsAt: WorkoutTimestamp | null, now: number): number | null {
  if (!Number.isFinite(now)) throw new RangeError('Некорректное текущее время.');
  if (restEndsAt === null) return null;
  return Math.max(0, Math.ceil((instant(restEndsAt) - now) / 1000));
}
