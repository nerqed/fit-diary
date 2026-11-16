import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getBestWeightSeries,
  getExerciseHistory,
  getExerciseRecords,
  getPreviousExerciseSession,
  getRestRemainingSeconds,
} from '../src/features/workouts/analytics';
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

test('previous session is completed before current start, excludes current and preserves last values', () => {
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
  const overlapping = session('overlap', prior.exercises, {
    startedAt: '2026-11-11T10:00:00+05:00', finishedAt: '2026-11-13T11:00:00+05:00',
  });
  const values = [current, active, old, prior, abandoned, overlapping];
  const row = getPreviousExerciseSession(values, 'squat', current.startedAt, current.id);
  assert.equal(row?.sessionId, 'prior');
  assert.equal(row?.sets[0]?.actualWeightKg, 30);
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
