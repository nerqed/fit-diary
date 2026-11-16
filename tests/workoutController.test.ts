import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkoutRepository } from '../src/data/sqlite/workoutRepository';
import { createWorkoutController, sessionView } from '../src/features/workouts/controller';
import type { WorkoutSession } from '../src/features/workouts/model';
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
    const setId = session.exercises[0]!.sets[0]!.id;
    await controller.updateSet(session.id, setId, { actualReps: 8, actualWeightKg: 40, completed: true });
    await controller.startRest(session.id, 90);
    assert.equal(controller.getSessionView(session.id, Date.parse(clock) + 30_000)?.restRemainingSeconds, 60);
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
  assert.equal(view.exercises[1]!.sets[0]!.previous?.actualWeightKg, 40);
});
