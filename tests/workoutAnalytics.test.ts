import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getBestWeightSeries,
  getExerciseHistory,
  getExerciseListProgress,
  getExerciseRecords,
  getPreviousExerciseSession,
  getRestRemainingSeconds,
  getSessionSummary,
  getWeightTrend,
} from '../src/features/workouts/analytics';
import { isBodyweightExercise, suggestWeights } from '../src/features/workouts/progression';
import { addDays, formatDay, sessionDay, workoutStart } from '../src/features/workouts/workoutDates';
import type { PerformedSet, SessionExercise, WorkoutSession } from '../src/features/workouts/model';

const start = '2026-11-10T10:00:00+05:00';
const finish = '2026-11-10T11:00:00+05:00';

function set(id: string, weight: number | null, reps: number | null, completed = true): PerformedSet {
  return {
    id, plannedReps: 8, plannedWeightKg: 30, actualReps: reps, actualWeightKg: weight,
    completed, updatedAt: start,
  };
}

function exercise(id: string, name: string, sets: readonly PerformedSet[], exerciseId = 'squat'): SessionExercise {
  return { id, exerciseId, name, sets };
}

function session(id: string, exercises: readonly SessionExercise[], override: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id, templateId: null, name: 'Тренировка', startedAt: start, finishedAt: finish,
    timeZone: 'Asia/Yekaterinburg', status: 'completed', restEndsAt: null, exercises,
    ...override,
  };
}

test('history joins stable exercise IDs, preserves duplicate entry/set order and ignores other IDs', () => {
  const input = session('session-1', [
    exercise('entry-1', 'Старое название', [set('set-1', 20, 8), set('set-2', 25, 8, false)]),
    exercise('entry-other', 'Старое название', [set('set-other', 100, 8)], 'another-id'),
    exercise('entry-2', 'Новое название', [set('set-3', 30, 8)]),
  ]);
  const before = JSON.stringify(input);
  const [row] = getExerciseHistory([input], 'squat');
  assert.ok(row);
  assert.deepEqual(row.exerciseNames, ['Старое название', 'Новое название']);
  assert.deepEqual(row.sets.map((item) => [item.id, item.exercisePosition, item.setPosition]), [
    ['set-1', 0, 0], ['set-2', 0, 1], ['set-3', 2, 0],
  ]);
  assert.deepEqual(row.volume, {
    amountKgReps: 400, knownAmountKgReps: 400, knownSets: 2, totalSets: 2, state: 'complete',
  });
  assert.equal(JSON.stringify(input), before);
});

test('missing weights are partial data, declared zero is known, unfinished sets are excluded', () => {
  const fixtures = [
    session('partial', [exercise('e1', 'Приседание', [set('s1', 20, 10), set('s2', null, 10), set('s3', 999, 10, false)])]),
    session('unknown', [exercise('e2', 'Приседание', [set('s4', null, 8)])]),
    session('zero', [exercise('e3', 'Приседание', [set('s5', 0, 10)])]),
    session('unfinished', [exercise('e4', 'Приседание', [set('s6', null, null, false)])]),
  ];
  const rows = new Map(getExerciseHistory(fixtures, 'squat').map((row) => [row.sessionId, row]));
  assert.deepEqual(rows.get('partial')?.volume, {
    amountKgReps: null, knownAmountKgReps: 200, knownSets: 1, totalSets: 2, state: 'partial',
  });
  assert.deepEqual(rows.get('unknown')?.volume, {
    amountKgReps: null, knownAmountKgReps: null, knownSets: 0, totalSets: 1, state: 'missing',
  });
  assert.deepEqual(rows.get('zero')?.volume, {
    amountKgReps: 0, knownAmountKgReps: 0, knownSets: 1, totalSets: 1, state: 'complete',
  });
  assert.deepEqual(rows.get('unfinished')?.volume, {
    amountKgReps: null, knownAmountKgReps: null, knownSets: 0, totalSets: 0, state: 'missing',
  });
});

test('best-weight graph compares only fixed reps and has null gaps, including known zero', () => {
  const fixtures = [
    session('mixed-reps', [exercise('e1', 'Приседание', [set('s1', 40, 8), set('s2', 70, 3), set('s3', 99, 8, false)])]),
    session('no-eight', [exercise('e2', 'Приседание', [set('s4', 50, 10), set('s5', null, 8)])]),
    session('zero', [exercise('e3', 'Приседание', [set('s6', 0, 8)])]),
  ];
  assert.deepEqual(getBestWeightSeries(fixtures, 'squat', 8).map((point) => [point.sessionId, point.bestWeightKg]), [
    ['mixed-reps', 40], ['no-eight', null], ['zero', 0],
  ]);
  assert.throws(() => getBestWeightSeries(fixtures, 'squat', 0), RangeError);
  assert.throws(() => getBestWeightSeries(fixtures, 'squat', 8.5), RangeError);
});

test('previous session is the latest completed workout by start time, even when it overlaps the current workout', () => {
  const old = session('old', [exercise('old-entry', 'Старое имя', [set('old-set', 20, 8)])], {
    startedAt: '2026-11-01T10:00:00+05:00', finishedAt: '2026-11-01T11:00:00+05:00',
  });
  const prior = session('prior', [exercise('prior-entry', 'Новое имя', [set('prior-set', 30, 8)])]);
  const current = session('current', [exercise('current-entry', 'Новое имя', [set('current-set', 100, 8)])], {
    startedAt: '2026-11-12T10:00:00+05:00', finishedAt: '2026-11-12T11:00:00+05:00',
  });
  const active = session('active', prior.exercises, {
    startedAt: '2026-11-11T10:00:00+05:00', finishedAt: null, status: 'active',
  });
  const abandoned = session('abandoned', prior.exercises, {
    startedAt: '2026-11-11T10:00:00+05:00', finishedAt: '2026-11-11T11:00:00+05:00', status: 'abandoned',
  });
  const overlapping = session('overlap', [exercise('overlap-entry', 'Новое имя', [set('overlap-set', 35, 8)])], {
    startedAt: '2026-11-11T10:00:00+05:00', finishedAt: '2026-11-13T11:00:00+05:00',
  });
  const values = [current, active, old, prior, abandoned, overlapping];
  const row = getPreviousExerciseSession(values, 'squat', current.startedAt, current.id);
  assert.equal(row?.sessionId, 'overlap');
  assert.equal(row?.sets[0]?.actualWeightKg, 35);
  assert.equal(getPreviousExerciseSession(values, 'missing', current.startedAt, current.id), null);
  // Explicit exclusion also works when the queried cutoff lies after a completed current session.
  assert.equal(getPreviousExerciseSession([prior, current], 'squat', '2026-11-20T00:00:00Z', current.id)?.sessionId, 'prior');
});

test('records use completed sessions, reject partial-volume records and keep earliest ties by real instant', () => {
  const first = session('first', [exercise('e1', 'Приседание', [set('s1', 40, 8)])], {
    startedAt: '2026-11-10T08:30:00+03:00', finishedAt: '2026-11-10T09:00:00+03:00',
  });
  const tiedLater = session('later', [exercise('e2', 'Приседание', [set('s2', 40, 8)])], {
    startedAt: '2026-11-10T10:45:00+05:00', finishedAt: '2026-11-10T11:00:00+05:00',
  });
  const partial = session('partial', [exercise('e3', 'Приседание', [set('s3', 100, 5), set('s4', null, 8)])], {
    startedAt: '2026-11-11T10:00:00+05:00', finishedAt: '2026-11-11T11:00:00+05:00',
  });
  const active = session('active', [exercise('e4', 'Приседание', [set('s5', 200, 8)])], {
    status: 'active', finishedAt: null,
  });
  const abandoned = session('abandoned', active.exercises, { status: 'abandoned' });
  const records = getExerciseRecords([partial, tiedLater, active, abandoned, first], 'squat', 8);
  assert.equal(records.bestWeightAtReps?.sessionId, 'first');
  assert.equal(records.bestWeightAtReps?.weightKg, 40);
  assert.equal(records.bestCompleteVolume?.sessionId, 'first');
  assert.equal(records.bestCompleteVolume?.volumeKgReps, 320);
  assert.deepEqual(getExerciseRecords([active, abandoned], 'squat', 8), {
    bestWeightAtReps: null, bestCompleteVolume: null,
  });
});

test('same-instant records are stable regardless of input order; true zero may be a record', () => {
  const a = session('a', [exercise('e1', 'Приседание', [set('s1', 0, 8)])]);
  const b = session('b', [exercise('e2', 'Приседание', [set('s2', 0, 8)])]);
  assert.deepEqual(getExerciseRecords([a, b], 'squat', 8), getExerciseRecords([b, a], 'squat', 8));
  assert.equal(getExerciseRecords([b, a], 'squat', 8).bestWeightAtReps?.sessionId, 'a');
  assert.equal(getExerciseRecords([b, a], 'squat', 8).bestCompleteVolume?.volumeKgReps, 0);
});

test('rest timer survives restart by recomputing from deadline, handles expiry and missing timer', () => {
  const deadline = '2026-11-16T10:01:30+05:00';
  assert.equal(getRestRemainingSeconds(deadline, Date.parse('2026-11-16T10:00:00+05:00')), 90);
  assert.equal(getRestRemainingSeconds(deadline, Date.parse('2026-11-16T05:01:29.500Z')), 1);
  assert.equal(getRestRemainingSeconds(deadline, Date.parse('2026-11-16T05:01:30Z')), 0);
  assert.equal(getRestRemainingSeconds(deadline, Date.parse('2026-11-16T11:00:00+05:00')), 0);
  assert.equal(getRestRemainingSeconds(null, Date.now()), null);
  assert.throws(() => getRestRemainingSeconds('broken-date', 1), RangeError);
  assert.throws(() => getRestRemainingSeconds(deadline, NaN), RangeError);
});

test('malformed completed results fail explicitly instead of producing NaN/Infinity progress', () => {
  const badWeight = session('bad-weight', [exercise('e1', 'Приседание', [set('s1', Infinity, 8)])]);
  const badReps = session('bad-reps', [exercise('e2', 'Приседание', [set('s2', 20, -1)])]);
  const badTime = session('bad-time', [], { finishedAt: null });
  assert.throws(() => getExerciseHistory([badWeight], 'squat'), RangeError);
  assert.throws(() => getExerciseRecords([badReps], 'squat', 8), RangeError);
  assert.throws(() => getExerciseHistory([badTime], 'squat'), RangeError);
});

test('weight suggestions require all planned sets and use actual weights and the correct equipment step', () => {
  const inputs = [set('a', 60, 8), { ...set('b', 55, 11), plannedReps: 10 }];
  const suggested = (id: string, name: string, previous: readonly PerformedSet[]) =>
    [...suggestWeights(id, name, previous, false).values()];
  assert.deepEqual(suggested('builtin:bench-press', 'Жим', inputs), [62.5, 57.5]);
  assert.deepEqual(suggested('builtin:bench-press', 'Жим', [set('a', 599, 8)]), [600]);
  assert.deepEqual(suggested('builtin:hammer-curl', 'Молотки', inputs), [61, 56]);
  assert.deepEqual(suggested('custom', 'Жим гантели лёжа', inputs), [61, 56]);
  assert.deepEqual(suggested('bench', 'Жим', [inputs[0]!, set('b', 55, 7)]), [60, 55]);
  assert.deepEqual(suggested('bench', 'Жим', [inputs[0]!, set('b', null, null, false)]), [60]);
  assert.deepEqual(suggested('bench', 'Жим', [inputs[0]!, set('b', 55, null, false)]), [60, 55]);
  assert.deepEqual(suggested('bench', 'Жим', [set('a', null, 8)]), []);
  assert.deepEqual(suggested('bench', 'Жим', []), []);
  assert.equal(isBodyweightExercise('builtin:crunch', 'Скручивания'), true);
  assert.deepEqual(suggested('builtin:pull-up', 'Подтягивания', [set('a', 0, 8), set('b', 5, 8)]), [0, 7.5]);
});

test('optional RIR increases only with spare reps on every successful set; missing RIR and missed reps keep the load', () => {
  const first = { ...set('a', 40, 8), rir: 3 };
  const second = { ...set('b', 50, 8), rir: 2 };
  const weights = (b: PerformedSet, enabled = true) => [...suggestWeights('bench', 'Жим', [first, b], enabled).values()];
  assert.deepEqual(weights(second), [42.5, 52.5]);
  assert.deepEqual(weights({ ...second, rir: 1 }), [40, 50]);
  assert.deepEqual(weights({ ...second, rir: 0, actualReps: 7 }), [40, 50]);
  assert.deepEqual(weights(set('b', 50, 8)), [40, 50]);
  assert.deepEqual(weights({ ...second, rir: 0 }, false), [42.5, 52.5]);
});

test('session summary compares the same rep counts, preserves partial volume and identifies strict records as of that session', () => {
  const older = session('prior', [exercise('p', 'Жим', [set('s1', 60, 8), set('s2', 55, 10)])]);
  const newer = session('now', [
    exercise('n1', 'Жим', [set('s3', 62.5, 8)]), exercise('n2', 'Жим', [set('s4', 55, 10)]),
    exercise('b', 'Приседание', [set('s5', null, 12), set('s6', 100, 12, false)], 'new'),
  ], { startedAt: '2026-11-12T10:00:00Z', finishedAt: '2026-11-12T10:30:00Z' });
  const later = { ...older, id: 'later', startedAt: '2026-11-13T10:00:00Z', finishedAt: '2026-11-13T11:00:00Z',
    exercises: [exercise('l', 'Жим', [set('s7', 75, 8)])] };
  const result = getSessionSummary(newer, [later, newer, older]);
  assert.equal(result.completedSets, 3);
  assert.equal(result.totalSets, 4);
  assert.deepEqual(result.volume, { amountKgReps: null, knownAmountKgReps: 1050, knownSets: 2, totalSets: 3, state: 'partial' });
  assert.deepEqual(result.records, [
    { exerciseId: 'squat', exerciseName: 'Жим', kind: 'weight', reps: 8, weightKg: 62.5, previousWeightKg: 60 },
    { exerciseId: 'squat', exerciseName: 'Жим', kind: 'volume', volumeKgReps: 1050, previousVolumeKgReps: 1030 },
  ]);
  assert.deepEqual(getSessionSummary(older, [newer]).records, []);
  assert.equal(result.durationMinutes, 30);
  const tied = { ...newer, id: 'tied', startedAt: later.startedAt, finishedAt: later.finishedAt };
  assert.deepEqual(getSessionSummary(tied, [newer, tied]).records, []);
  assert.deepEqual(getSessionSummary({ ...newer, finishedAt: null, status: 'active' }, [older]).records, []);
  const noLoad = session('abs', [exercise('e', 'Скручивания', [set('s', 0, 15)], 'builtin:crunch')]);
  assert.deepEqual(getSessionSummary(noLoad, []).records, []);
});

test('a new rep count establishes a baseline and partial volumes cannot establish a volume record', () => {
  const previous = session('prior', [exercise('e1', 'Жим', [set('s1', 60, 8), set('s2', null, 5)])]);
  const next = session('next', [exercise('e2', 'Жим', [set('s3', 100, 3)])], {
    startedAt: '2026-11-13T10:00:00Z', finishedAt: '2026-11-13T11:00:00Z',
  });
  assert.deepEqual(getSessionSummary(next, [previous, next]).records, []);
});

test('summary counts only completed unweighted bodyweight reps and omits retrospective or unknown duration', () => {
  const workout = session('workout', [
    exercise('a', 'Пресс', [set('a1', 0, 15), set('a2', null, 8), set('a3', 2, 6), set('a4', 0, 50, false)], 'builtin:crunch'),
    exercise('b', 'Жим', [set('b1', 0, 20)]),
  ]);
  const summary = getSessionSummary(workout, []);
  assert.equal(summary.bodyweightReps, 15);
  assert.equal(summary.volume.knownAmountKgReps, 12);
  assert.equal(summary.volume.state, 'partial');
  assert.equal(summary.durationMinutes, 60);
  assert.equal(getSessionSummary({ ...workout, backdated: true }, []).durationMinutes, null);
  assert.equal(getSessionSummary({ ...workout, finishedAt: start }, []).durationMinutes, null);
});

test('exercise list compares matched reps, leaves gaps and uses completed actual sets only', () => {
  // Equal instants are sorted by ID.
  const rows = [
    session('a', [exercise('1', 'Жим', [set('1a', 70, 8), set('1b', 100, 4)])]),
    session('b', [exercise('2', 'Жим', [set('2a', 65, 6)])]),
    session('c', [exercise('3', 'Жим', [set('3a', 60, 8), set('3b', 60, 3), set('3c', 80, 10, false)])]),
    session('d', [exercise('4', 'Жим', [set('4a', null, 8)])]),
  ];
  assert.deepEqual(getExerciseListProgress(rows, 'squat'), {
    latest: { weightKg: 60, reps: 8 }, best: { weightKg: 70, reps: 8 },
    bodyweight: false, direction: null, trend: [70, null, 60],
  });
  assert.equal(getExerciseListProgress([rows[0]!, rows[2]!], 'squat').direction, 'down');
  assert.equal(getExerciseListProgress(rows, 'unknown').latest, null);
});

test('unweighted exercises compare repetitions without mixing loaded and unloaded sets', () => {
  const results = [[0, 8], [5, 8], [0, 12], [0, 10]] as const;
  const rows = results.map(([weight, reps], i) =>
    session(String(i), [exercise('e', 'Пресс', [set('s', weight, reps)], 'builtin:crunch')]));
  assert.deepEqual(getExerciseListProgress(rows, 'builtin:crunch'), {
    latest: { weightKg: 0, reps: 10 }, best: { weightKg: 0, reps: 12 },
    bodyweight: true, direction: 'down', trend: [8, null, 12, 10],
  });
  assert.deepEqual(getExerciseListProgress(rows.slice(0, 2), 'builtin:crunch').trend, [null, 5]);
});

test('body weight trend uses calendar windows, ignores missing days and recalculates after retrospective entries', () => {
  const input = [
    { date: '2026-11-15', weightKg: 72 }, { date: '2026-11-08', weightKg: 71 }, { date: '2026-11-01', weightKg: 70 },
  ];
  assert.equal(getWeightTrend(input, '2026-11-08').weeklyChangeKg, 1);
  const changed = [...input, { date: '2026-11-02', weightKg: 77 }];
  const trend = getWeightTrend(changed, '2026-11-08');
  assert.deepEqual(trend.points.map((p) => [p.date, p.averageKg]), [
    ['2026-11-01', 70], ['2026-11-02', 73.5], ['2026-11-08', 74],
  ]);
  assert.equal(trend.weeklyChangeKg, 4, 'compares the two seven-day averages, not individual weights');
  assert.equal(getWeightTrend(changed).weeklyChangeKg, -2);
  assert.equal(getWeightTrend(changed, '2026-11-23').weeklyChangeKg, null, 'no current-week measurements');
  assert.equal(getWeightTrend(changed, '2026-11-02').weeklyChangeKg, null, 'no preceding window');
  assert.deepEqual(getWeightTrend([]), { points: [], weeklyChangeKg: null });
});

test('workout days follow the stored time zone across UTC, leap days and DST, and reject invalid or future days', () => {
  assert.equal(sessionDay({ startedAt: '2026-11-01T20:30:00Z', timeZone: 'Asia/Yekaterinburg' }), '2026-11-02');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(formatDay('2026-11-02'), '2 нояб');
  const now = '2026-11-24T00:00:00Z';
  for (const zone of ['Pacific/Kiritimati', 'America/Los_Angeles', 'Europe/Paris']) {
    const start = workoutStart('2026-03-29', now, zone, []);
    assert.equal(start.backdated, true);
    assert.equal(sessionDay({ ...start, timeZone: zone }), '2026-03-29');
  }
  assert.throws(() => workoutStart('2026-11-31', now, 'UTC', []));
  assert.throws(() => workoutStart('2026-12-01', now, 'UTC', []));
  assert.deepEqual(workoutStart('2026-11-24', now, 'UTC', []), { startedAt: now, backdated: false });
});
