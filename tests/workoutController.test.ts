import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkoutRepository } from '../src/data/sqlite/workoutRepository';
import { getSessionSummary } from '../src/features/workouts/analytics';
import { createWorkoutController, sessionView } from '../src/features/workouts/controller';
import type { WorkoutSession } from '../src/features/workouts/model';
import { sessionDay } from '../src/features/workouts/workoutDates';
import { createSqliteTestDatabase } from './sqliteTestDatabase';

test('controller exposes durable data after successful actions and keeps prior data after rejected input', async () => {
  const database = createSqliteTestDatabase();
  const repository = createWorkoutRepository(database);
  let clock = '2026-11-17T10:00:00Z';
  let identifier = 0;
  const controller = createWorkoutController(repository, {
    now: () => clock, id: () => `new-${++identifier}`, timeZone: () => 'Asia/Yekaterinburg',
  });
  try {
    await controller.load();
    const draft = controller.newTemplate();
    assert.equal(controller.getSnapshot().data?.templates.length, 0, 'draft creation must not persist an invalid blank template');
    await controller.saveTemplate({ ...draft, name: 'Моя тренировка', exercises: [
      { id: 'template-exercise', exerciseId: 'builtin:squat-barbell', sets: [{ id: 'template-set', reps: 8, weightKg: null }] },
    ] });
    clock = '2026-11-17T11:00:00Z';
    const session = await controller.startSession(draft.id, 'intent-session');
    await controller.startSession(draft.id, 'intent-session');
    assert.equal(controller.getSnapshot().data?.sessions.length, 1);
    await assert.rejects(controller.finishSession(session.id, 'completed'), /Отметь хотя бы один подход/);
    assert.equal(controller.getSessionView(session.id, Date.parse(clock))?.session.status, 'active');
    const setId = session.exercises[0]!.sets[0]!.id;
    const result = { actualReps: 8, actualWeightKg: 40, completed: true };
    await controller.updateSet(session.id, setId, result, 90);
    assert.equal(controller.getSessionView(session.id, Date.parse(clock) + 30_000)?.restRemainingSeconds, 60);
    const initialDeadline = controller.getSessionView(session.id, Date.parse(clock))!.session.restEndsAt!;
    clock = '2026-11-17T11:00:04Z';
    await controller.updateSet(session.id, setId, result, 90);
    assert.equal(controller.getSessionView(session.id, Date.parse(clock))?.session.restEndsAt, initialDeadline);
    await Promise.all([controller.extendRest(session.id, 15), controller.extendRest(session.id, 15)]);
    assert.equal(controller.getSessionView(session.id, Date.parse(clock))?.restRemainingSeconds, 116);
    assert.equal(await controller.stopRest(session.id, initialDeadline), false, 'old timer cannot stop the extension');
    assert.equal(await controller.stopRest(session.id), true);
    assert.equal(await controller.extendRest(session.id, 15), false, 'extension cannot resurrect a skipped timer');
    const saved = controller.getSnapshot().data;
    await assert.rejects(controller.updateSet(session.id, setId, { actualReps: 8, actualWeightKg: -1, completed: true }));
    assert.deepEqual(controller.getSnapshot().data, saved);
    assert.equal(controller.getSnapshot().pending, 0);
    assert.ok(controller.getSnapshot().error);
    clock = '2026-11-17T12:00:00Z';
    await controller.finishSession(session.id, 'completed');
    assert.equal(controller.getProgress('builtin:squat-barbell', 8).records.bestWeightAtReps?.weightKg, 40);
    assert.equal(controller.getSnapshot().error, null);
  } finally { database.close(); }
});

test('previous values beside sets match exercise occurrence and set position, not names or another set', () => {
  const entry = (id: string, weights: readonly number[]) => ({ id, exerciseId: 'exercise', name: 'Название раньше',
    sets: weights.map((weight, index) => ({ id: `${id}-${index}`, plannedReps: 8, plannedWeightKg: null,
      actualReps: 8, actualWeightKg: weight, completed: true, updatedAt: '2026-11-16T11:00:00Z' })),
  });
  const previous: WorkoutSession = {
    id: 'previous', templateId: null, name: 'Раньше', startedAt: '2026-11-16T10:00:00Z',
    finishedAt: '2026-11-16T12:00:00Z', timeZone: 'Asia/Yekaterinburg', status: 'completed', restEndsAt: null,
    exercises: [entry('previous-a', [30, 35]), entry('previous-b', [40])],
  };
  const current: WorkoutSession = {
    ...previous, id: 'current', startedAt: '2026-11-17T10:00:00Z', finishedAt: null, status: 'active',
    exercises: [entry('current-a', [0, 0, 0]), entry('current-b', [0])].map((exercise) => ({ ...exercise, name: 'Новое название',
      sets: exercise.sets.map((set) => ({ ...set, completed: false, actualReps: null, actualWeightKg: null })),
    })),
  };
  const view = sessionView(current, [previous, current], Date.parse(current.startedAt));
  assert.deepEqual(view.exercises[0]!.sets.map((set) => set.previous?.actualWeightKg ?? null), [30, 35, null]);
  assert.deepEqual(view.exercises[0]!.sets.map((set) => set.suggestedWeightKg), [32.5, 37.5, null]);
  assert.equal(view.exercises[1]!.sets[0]!.previous?.actualWeightKg, 40);
  assert.equal(view.exercises[1]!.sets[0]!.suggestedWeightKg, 42.5);
});

test('previous results keep manually entered fields and omit unconfirmed copied fields independently', () => {
  const startedAt = '2026-11-16T10:00:00Z';
  const partial = { plannedReps: 8, plannedWeightKg: 30, completed: false, actualReps: 7, actualWeightKg: 25, updatedAt: startedAt };
  const previous: WorkoutSession = {
    id: 'old', name: 'Жим', startedAt, finishedAt: startedAt, templateId: null,
    timeZone: 'UTC', restEndsAt: null, status: 'completed',
    exercises: [{ id: 'entry', exerciseId: 'bench', name: 'Жим', sets: [
      { ...partial, id: 'both-copied', copiedReps: true, copiedWeight: true },
      { ...partial, id: 'manual-weight', copiedReps: true },
      { ...partial, id: 'manual-reps', copiedWeight: true },
    ] }],
  };
  const current = { ...previous, id: 'new', startedAt: '2026-11-17T10:00:00Z', finishedAt: null, status: 'active' as const };
  const sets = sessionView(current, [previous, current], Date.parse(current.startedAt)).exercises[0]!.sets;
  assert.deepEqual(sets.map((set) => set.previous && [set.previous.actualWeightKg, set.previous.actualReps]), [
    null, [25, null], [null, 7],
  ]);
  assert.deepEqual(sets.map((set) => set.suggestedWeightKg), [null, 25, null]);
});

test('copy retry after a committed write and a failed refresh recovers the one saved copy', async () => {
  const database = createSqliteTestDatabase();
  const repository = createWorkoutRepository(database);
  let failRead = false;
  const controller = createWorkoutController({ ...repository, async exportData() {
    if (failRead) { failRead = false; throw new Error('Чтение недоступно'); }
    return repository.exportData();
  } }, { now: () => '2026-11-24T09:00:00Z', id: () => 'template', timeZone: () => 'UTC' });
  try {
    await controller.load();
    const source = controller.newTemplate();
    await controller.saveTemplate({ ...source, name: 'Пресс', exercises: [
      { id: 'entry', exerciseId: 'builtin:crunch', sets: [{ id: 'set', reps: 12, weightKg: null }] },
    ] });
    failRead = true;
    await assert.rejects(controller.copyTemplate(source.id, 'copy'), /Чтение недоступно/);
    assert.equal((await repository.listTemplates()).length, 2);
    await assert.rejects(controller.copyTemplate('foreign-template', 'copy'), /другому шаблону/);
    const [first, second] = await Promise.all([
      controller.copyTemplate(source.id, 'copy'), controller.copyTemplate(source.id, 'copy'),
    ]);
    assert.equal(first.id, 'copy');
    assert.deepEqual(second, first);
    assert.equal(controller.getSnapshot().data?.templates.length, 2);
  } finally { database.close(); }
});

test('retrospective sessions survive a controller restart and edits recalculate following hints; live sessions may cross midnight', async () => {
  const database = createSqliteTestDatabase();
  const repository = createWorkoutRepository(database);
  let clock = '2026-11-24T18:58:00Z'; // 23:58 local
  const dependencies = { now: () => clock, id: () => 'template', timeZone: () => 'Asia/Yekaterinburg' };
  let controller = createWorkoutController(repository, dependencies);
  try {
    await controller.load();
    const template = { ...controller.newTemplate(), name: 'Жим', exercises: [
      { id: 'template-exercise', exerciseId: 'builtin:bench-press', sets: [{ id: 'template-set', reps: 8, weightKg: null }] },
    ] };
    await controller.saveTemplate(template);
    const past = await controller.startSession(template.id, 'past', '2026-11-02');
    const setId = past.exercises[0]!.sets[0]!.id;
    await controller.updateSet(past.id, setId, { actualWeightKg: 50, actualReps: 8, completed: true, rir: 3 });
    controller = createWorkoutController(repository, dependencies);
    await controller.load();
    await controller.finishSession(past.id, 'completed');
    const saved = controller.getSessionView(past.id, Date.parse(clock))!.session;
    assert.equal(saved.finishedAt, saved.startedAt);
    assert.equal(sessionDay(saved), '2026-11-02');
    await controller.saveSettings({ showRir: true, showNotes: false });
    const live = await controller.repeatSession(past.id, 'live');
    const reopened = await controller.startSession(template.id, 'same-day', '2026-11-02');
    assert.equal(reopened.id, past.id);
    const secondPast = await controller.startSession(template.id, 'second-past', '2026-11-03');
    assert.equal(secondPast.status, 'completed', 'backfilling leaves the live session active');
    assert.equal((await repository.getSession(live.id))?.status, 'active');
    const secondSet = secondPast.exercises[0]!.sets[0]!.id;
    await controller.updateSet(secondPast.id, secondSet, { actualWeightKg: 45, actualReps: null, completed: false });
    const hint = () => controller.getSessionView(live.id, Date.parse(clock))!.exercises[0]!.sets[0]!.suggestedWeightKg;
    assert.equal(hint(), 45, 'a known weight from the latest partial entry carries over without an increment');
    await controller.updateSet(secondPast.id, secondSet, { actualWeightKg: 50, actualReps: 8, completed: true, rir: 3 });
    assert.equal(hint(), 52.5);
    await controller.updateSet(past.id, setId, { actualWeightKg: 50, actualReps: 7, completed: true, rir: 0 });
    await controller.updateSet(secondPast.id, secondSet, { actualWeightKg: 50, actualReps: 7, completed: true, rir: 0 });
    assert.equal(hint(), 50);
    assert.equal(controller.getProgress('builtin:bench-press', 8).records.bestWeightAtReps, null);
    clock = '2026-11-24T19:30:00Z'; // 00:30 the following day
    await controller.updateSet(live.id, live.exercises[0]!.sets[0]!.id, { actualWeightKg: 50, actualReps: 7, completed: true });
    await controller.finishSession(live.id, 'completed');
    assert.equal(controller.getSessionView(live.id, Date.parse(clock))?.session.finishedAt, clock);
    await controller.saveBodyWeight('2026-11-02', 70);
    await controller.saveBodyWeight('2026-11-02', 71);
    await assert.rejects(controller.saveBodyWeight('2026-11-26', 72));
    assert.deepEqual(controller.getSnapshot().data?.bodyWeights, [{ date: '2026-11-02', weightKg: 71 }]);
  } finally { database.close(); }
});

test('deleting a legacy workout with an out-of-range weight refreshes history and recalculates records', async () => {
  const database = createSqliteTestDatabase();
  const repository = createWorkoutRepository(database);
  const controller = createWorkoutController(repository, {
    now: () => '2026-11-24T10:00:00Z', id: () => 'template', timeZone: () => 'UTC',
  });
  try {
    await controller.load();
    const exerciseId = 'builtin:bench-press';
    const template = { ...controller.newTemplate(), name: 'Жим', exercises: [
      { id: 'entry', exerciseId, sets: [{ id: 'set', reps: 8, weightKg: null }] },
    ] };
    await controller.saveTemplate(template);
    for (const [day, weight] of [['01', 40], ['02', 60], ['03', 50]] as const) {
      const session = await controller.startSession(template.id, day, `2026-11-${day}`);
      await controller.updateSet(session.id, session.exercises[0]!.sets[0]!.id, {
        actualWeightKg: weight, actualReps: 8, completed: true,
      });
    }
    const legacySetId = (await repository.getSession('02'))!.exercises[0]!.sets[0]!.id;
    await database.run('UPDATE session_sets SET actual_weight_kg = ? WHERE id = ?', [790, legacySetId]);
    await controller.refresh();
    assert.equal(controller.getProgress(exerciseId, 8).records.bestWeightAtReps?.weightKg, 790);
    function latestSummary() {
      const sessions = controller.getSnapshot().data!.sessions;
      return getSessionSummary(sessions.find((item) => item.id === '03')!, sessions);
    }
    assert.deepEqual(latestSummary().records, []);
    await controller.deleteSession('02');
    const progress = controller.getProgress(exerciseId, 8);
    assert.deepEqual(progress.history.map((row) => row.sessionId), ['01', '03']);
    assert.equal(progress.records.bestWeightAtReps?.weightKg, 50);
    assert.deepEqual(latestSummary().records, [
      { exerciseId, exerciseName: progress.history[1]!.exerciseNames[0], kind: 'weight', reps: 8, weightKg: 50, previousWeightKg: 40 },
      { exerciseId, exerciseName: progress.history[1]!.exerciseNames[0], kind: 'volume', volumeKgReps: 400, previousVolumeKgReps: 320 },
    ]);
    await controller.deleteSession('01');
    assert.deepEqual(latestSummary().records, []);
    assert.equal(controller.getSnapshot().pending, 0);
  } finally { database.close(); }
});
