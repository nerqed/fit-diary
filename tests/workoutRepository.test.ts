import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { builtinExercises } from '../src/data/exercises';
import { WORKOUT_SCHEMA_VERSION } from '../src/data/sqlite/migrations';
import { createWorkoutRepository } from '../src/data/sqlite/workoutRepository';
import type { SqlDatabase } from '../src/data/sqlite/connection';
import type { Exercise, WorkoutData, WorkoutTemplate } from '../src/features/workouts/model';
import { validateWorkoutData } from '../src/features/workouts/validation';
import { createSqliteTestDatabase } from './sqliteTestDatabase';

const createdAt = '2026-11-17T10:00:00+05:00';
const startedAt = '2026-11-17T11:00:00+05:00';
const updatedAt = '2026-11-17T11:05:00+05:00';
const finishedAt = '2026-11-17T12:00:00+05:00';
function template(id = 'template-a'): WorkoutTemplate {
  return {
    id, name: 'Силовая А', weekday: 'tuesday', createdAt, updatedAt: createdAt,
    exercises: [
      { id: `${id}:e1`, exerciseId: 'builtin:squat-barbell', sets: [
        { id: `${id}:s1`, reps: 8, weightKg: 40 }, { id: `${id}:s2`, reps: 8, weightKg: null },
      ] },
      { id: `${id}:e2`, exerciseId: 'builtin:bench-press', sets: [{ id: `${id}:s3`, reps: 10, weightKg: 30 }] },
    ],
  };
}
function custom(id = 'custom-a'): Exercise {
  return { id, name: 'Моё упражнение', aliases: ['мой вариант'], origin: 'custom', archived: false, createdAt, updatedAt: createdAt };
}

test('migration persists data and seeds only once, including after a full restore/reopen', async () => {
  const base = path.resolve('work/test-data'); await mkdir(base, { recursive: true });
  const directory = await mkdtemp(path.join(base, 'workout-'));
  const filename = path.join(directory, 'workouts.sqlite');
  let database = createSqliteTestDatabase(filename);
  try {
    let repository = createWorkoutRepository(database);
    await repository.initialize();
    assert.equal((await database.all<{ user_version: number }>('PRAGMA user_version'))[0]?.user_version, WORKOUT_SCHEMA_VERSION);
    assert.equal((await repository.listExercises()).length, builtinExercises.length);
    await repository.saveTemplate(template());
    await repository.startSession('template-a', 'session-a', startedAt, 'Asia/Yekaterinburg');
    await repository.updateSet('session-a', 'session-a:set:0:0', { actualReps: 8, actualWeightKg: 42.5, completed: true }, updatedAt);
    await repository.setRestDeadline('session-a', '2026-11-17T11:06:30+05:00');
    const saved = await repository.exportData();
    database.close();
    database = createSqliteTestDatabase(filename); repository = createWorkoutRepository(database);
    assert.deepEqual(await repository.exportData(), saved);
    const empty: WorkoutData = { exercises: [], templates: [], sessions: [], bodyWeights: [], settings: { showRir: false, showNotes: false } };
    await repository.replaceAll(empty, async () => undefined);
    database.close(); database = createSqliteTestDatabase(filename); repository = createWorkoutRepository(database);
    assert.deepEqual(await repository.exportData(), empty, 'reopen must not seed over an intentionally restored snapshot');
  } finally {
    database.close();
    const relative = path.relative(base, path.resolve(directory));
    assert.ok(relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative), 'cleanup stays inside work/test-data');
    await rm(directory, { recursive: true, force: true });
  }
});

test('failed initial migration rolls back schema/version and succeeds on retry', async () => {
  const real = createSqliteTestDatabase(); let failSeed = true;
  const database: SqlDatabase = {
    exec: (sql) => real.exec(sql), all: (sql, params) => real.all(sql, params), run: (sql, params) => real.run(sql, params),
    transaction: (work) => real.transaction((connection) => work({
      ...connection,
      run: (sql, params) => {
        if (failSeed && sql.startsWith('INSERT INTO exercises')) throw new Error('migration interrupted');
        return connection.run(sql, params);
      },
    })),
  };
  try {
    const repository = createWorkoutRepository(database);
    await assert.rejects(repository.initialize(), /interrupted/);
    assert.equal((await real.all<{ user_version: number }>('PRAGMA user_version'))[0]?.user_version, 0);
    assert.equal((await real.all("SELECT name FROM sqlite_master WHERE type='table' AND name='exercises'")).length, 0);
    failSeed = false;
    await repository.initialize();
    assert.equal((await repository.listExercises()).length, builtinExercises.length);
  } finally { real.close(); }
});

test('rejects newer database versions without deleting existing tables', async () => {
  const database = createSqliteTestDatabase();
  try {
    await database.exec('CREATE TABLE future_data(value TEXT); INSERT INTO future_data VALUES(\'keep\'); PRAGMA user_version=99;');
    const repository = createWorkoutRepository(database);
    await assert.rejects(repository.initialize(), /Версия базы/);
    assert.equal((await database.all<{ value: string }>('SELECT * FROM future_data'))[0]?.value, 'keep');
  } finally { database.close(); }
});

test('v1 history survives an interrupted upgrade to v2, with optional features initially off', async (t) => {
  const database = createSqliteTestDatabase();
  t.after(() => database.close());
  const interrupted: SqlDatabase = {
    ...database,
    transaction: (work) => database.transaction((connection) => work({
      ...connection,
      async exec(sql) {
        if (sql === 'PRAGMA user_version = 2') throw new Error('upgrade interrupted');
        return connection.exec(sql);
      },
    })),
  };
  await assert.rejects(createWorkoutRepository(interrupted).initialize(), /interrupted/);
  assert.equal((await database.all<{ user_version: number }>('PRAGMA user_version'))[0]?.user_version, 1);
  assert.equal((await database.all<{ name: string }>('PRAGMA table_info(session_sets)')).some((column) => column.name === 'rir'), false);
  await database.run("INSERT INTO sessions(id,name,started_at,finished_at,time_zone,status) VALUES('old','История',?,?,'UTC','completed')", [startedAt, finishedAt]);
  await database.run("INSERT INTO session_exercises(id,session_id,exercise_id,name,position) VALUES('old-entry','old','builtin:bench-press','Жим',0)");
  await database.run("INSERT INTO session_sets(id,session_exercise_id,position,planned_reps,actual_reps,actual_weight_kg,completed,updated_at) VALUES('old-set','old-entry',0,8,7,40,1,?)", [updatedAt]);

  const repository = createWorkoutRepository(database);
  const data = await repository.exportData();
  assert.equal(data.sessions[0]?.exercises[0]?.sets[0]?.actualReps, 7);
  assert.equal(data.sessions[0]?.exercises[0]?.sets[0]?.actualWeightKg, 40);
  assert.equal(data.sessions[0]?.exercises[0]?.sets[0]?.rir, null);
  assert.deepEqual(data.settings, { showRir: false, showNotes: false });
  assert.deepEqual(data.bodyWeights, []);
  const facts = { actualReps: 8, actualWeightKg: 40, completed: true };
  const later = '2026-11-19T12:00:00Z';
  await repository.updateSet('old', 'old-set', { ...facts, rir: 0 }, later);
  await repository.updateSet('old', 'old-set', facts, later);
  assert.equal((await repository.getSession('old'))?.exercises[0]?.sets[0]?.rir, 0, 'editing reps must preserve hidden RIR');
  await repository.updateSet('old', 'old-set', { ...facts, rir: null }, later);
  assert.equal((await repository.getSession('old'))?.exercises[0]?.sets[0]?.rir, null);
});

test('body weight is upserted by local day, settings and stable exercise notes persist', async (t) => {
  const database = createSqliteTestDatabase();
  t.after(() => database.close());
  const repository = createWorkoutRepository(database);
  await repository.saveBodyWeight('2026-11-18', 77);
  await repository.saveBodyWeight('2026-11-17', 76.5);
  await repository.saveBodyWeight('2026-11-18', 77.2);
  await assert.rejects(repository.saveBodyWeight('2026-02-29', 75));
  await assert.rejects(repository.saveBodyWeight('2026-11-18', 0));
  const [exercise] = await repository.listExercises();
  await repository.saveExercise({ ...exercise!, note: 'сиденье на 4' });
  await repository.saveSettings({ showNotes: true, showRir: false });
  const data = await repository.exportData();
  assert.deepEqual(data.bodyWeights, [{ date: '2026-11-17', weightKg: 76.5 }, { date: '2026-11-18', weightKg: 77.2 }]);
  assert.deepEqual(data.settings, { showNotes: true, showRir: false });
  assert.equal(data.exercises.find((item) => item.id === exercise!.id)?.note, 'сиденье на 4');
  await repository.saveExercise({ ...exercise!, note: '' });
  assert.equal((await repository.listExercises())[0]?.note, undefined);
});

test('repeat uses the completed snapshot after deleting its template and exercise replacement resets only its sets', async (t) => {
  const database = createSqliteTestDatabase();
  t.after(() => database.close());
  const repository = createWorkoutRepository(database);
  const plan = template();
  await repository.saveTemplate(plan);
  await repository.startSession(plan.id, 'original', startedAt, 'UTC');
  const facts = { actualReps: 7, actualWeightKg: 42, completed: true, rir: 2 };
  await repository.updateSet('original', 'original:set:0:0', facts, updatedAt);
  await repository.finishSession('original', 'completed', finishedAt);
  await repository.deleteTemplate(plan.id);
  const nextDay = '2026-11-18T11:00:00Z';
  const repeat = await repository.repeatSession('original', 'repeat', nextDay, 'UTC');
  assert.equal(repeat.templateId, plan.id);
  assert.equal(repeat.name, plan.name);
  assert.equal(repeat.status, 'active');
  assert.equal(repeat.exercises[0]?.sets[0]?.plannedReps, 8);
  assert.equal(repeat.exercises[0]?.sets[0]?.actualReps, null);
  assert.equal(repeat.exercises[0]?.sets[0]?.rir, null);
  assert.deepEqual(await repository.repeatSession('original', 'repeat', updatedAt, 'UTC'), repeat);
  assert.deepEqual(await repository.repeatSession('original', 'second', nextDay, 'UTC'), repeat);
  await assert.rejects(repository.repeatSession('second', 'repeat', nextDay, 'UTC'), /другой/);

  await repository.updateSet('repeat', 'repeat:set:0:0', facts, nextDay);
  await repository.updateSet('repeat', 'repeat:set:1:0', facts, nextDay);
  await assert.rejects(repository.replaceSessionExercise('repeat', 'original:exercise:0', 'builtin:bench-press'));
  await repository.replaceSessionExercise('repeat', 'repeat:exercise:0', 'builtin:bench-press');
  const replaced = await repository.getSession('repeat');
  const first = replaced!.exercises[0]!;
  assert.equal(first.exerciseId, 'builtin:bench-press');
  assert.equal(first.sets.length, 2);
  assert.deepEqual(first.sets.map((set) => [set.completed, set.plannedWeightKg, set.actualWeightKg, set.actualReps, set.rir]),
    [[false, null, null, null, null], [false, null, null, null, null]]);
  assert.equal(replaced?.exercises[1]?.sets[0]?.rir, 2);
  assert.equal((await repository.getSession('original'))?.exercises[0]?.sets[0]?.actualReps, 7);
  const snapshot = await repository.exportData();
  await repository.replaceAll(snapshot, async () => {});
  assert.deepEqual(await repository.getSession('repeat'), replaced, 'restore accepts repeat before source in newest-first backups');
});

test('expiring an old rest timer cannot clear a replacement or notify after finish', async (t) => {
  const database = createSqliteTestDatabase();
  t.after(() => database.close());
  const repository = createWorkoutRepository(database);
  await repository.saveTemplate(template());
  await repository.startSession('template-a', 'running', startedAt, 'UTC');
  const old = '2026-11-17T11:01:00+05:00', fresh = '2026-11-17T11:01:15+05:00';
  assert.equal(await repository.setRestDeadline('running', old), true);
  assert.equal(await repository.setRestDeadline('running', fresh, old), true);
  assert.equal(await repository.setRestDeadline('running', null, old), false);
  assert.equal((await repository.getSession('running'))?.restEndsAt, fresh);
  await repository.finishSession('running', 'completed', finishedAt);
  assert.equal(await repository.setRestDeadline('running', null, fresh), false);
});

test('confirming a live set commits its rest timer atomically, once per completion and never during retro input', async (t) => {
  const database = createSqliteTestDatabase();
  t.after(() => database.close());
  const repository = createWorkoutRepository(database);
  await repository.saveTemplate(template());
  const live = await repository.startSession('template-a', 'live', startedAt, 'UTC');
  const setId = live.exercises[0]!.sets[0]!.id;
  const facts = { actualReps: 8, actualWeightKg: 40, completed: true };
  const first = '2026-11-17T11:06:30+05:00';
  const later = '2026-11-17T11:08:00+05:00';
  await database.exec(`CREATE TEMP TRIGGER interrupt_timer BEFORE UPDATE OF rest_ends_at ON sessions
    BEGIN SELECT RAISE(ABORT,'timer write failed'); END;`);
  await assert.rejects(repository.updateSet(live.id, setId, facts, updatedAt, first), /timer write failed/);
  assert.deepEqual(await repository.getSession(live.id), live);
  await database.exec('DROP TRIGGER interrupt_timer');

  await repository.updateSet(live.id, setId, facts, updatedAt, first);
  assert.equal((await repository.getSession(live.id))?.restEndsAt, first);
  await repository.updateSet(live.id, setId, facts, updatedAt, later);
  assert.equal((await repository.getSession(live.id))?.restEndsAt, first);
  await repository.setRestDeadline(live.id, null);
  await repository.updateSet(live.id, setId, { ...facts, rir: 3 }, updatedAt, later);
  assert.equal((await repository.getSession(live.id))?.restEndsAt, null);

  const past = await repository.startSession('template-a', 'past', '2026-11-10T12:00:00Z', 'UTC', true);
  await repository.updateSet(past.id, past.exercises[0]!.sets[0]!.id, facts, updatedAt, later);
  const saved = await repository.getSession(past.id);
  assert.equal(saved?.exercises[0]?.sets[0]?.completed, true);
  assert.equal(saved?.restEndsAt, null);
});

test('backdated starts and repeats remain editable alongside a live workout and its rest timer', async (t) => {
  const database = createSqliteTestDatabase();
  t.after(() => database.close());
  const repository = createWorkoutRepository(database);
  await repository.saveTemplate(template());
  const facts = { actualReps: 9, actualWeightKg: 40, completed: true, rir: 2 };
  await repository.startSession('template-a', 'live', startedAt, 'UTC');
  await repository.updateSet('live', 'live:set:0:0', facts, updatedAt);
  await repository.setRestDeadline('live', '2026-11-17T11:07:00+05:00');
  const live = await repository.getSession('live');

  const firstDay = '2026-11-10T12:00:00Z';
  const secondDay = '2026-11-12T12:00:00Z';
  const past = await repository.startSession('template-a', 'past', firstDay, 'UTC', true);
  const repeated = await repository.repeatSession(past.id, 'past-repeat', secondDay, 'UTC', true);
  for (const [session, day] of [[past, firstDay], [repeated, secondDay]] as const) {
    assert.equal(session.backdated, true);
    assert.equal(session.status, 'completed');
    assert.equal(session.startedAt, day);
    assert.equal(session.finishedAt, day);
    const [set] = session.exercises[0]!.sets;
    assert.equal(set?.completed, false);
    await repository.updateSet(session.id, set!.id, facts, updatedAt);
    const edited = await repository.getSession(session.id);
    assert.equal(edited?.finishedAt, day);
    assert.equal(edited?.exercises[0]?.sets[0]?.actualReps, 9);
  }
  assert.deepEqual((await repository.listSessions()).filter((session) => session.status === 'active'), [live]);
  assert.deepEqual(await repository.startSession('template-a', 'another-live', startedAt, 'UTC'), live);
});

test('template CRUD/copy preserve order, unique IDs and historical snapshots', async () => {
  const database = createSqliteTestDatabase(); const repository = createWorkoutRepository(database);
  try {
    const original = template(); await repository.saveTemplate(original);
    const copied = await repository.copyTemplate(original.id, 'template-copy', createdAt);
    assert.notEqual(copied.exercises[0]?.id, original.exercises[0]?.id);
    assert.notEqual(copied.exercises[0]?.sets[0]?.id, original.exercises[0]?.sets[0]?.id);
    assert.deepEqual(copied.exercises.map((item) => item.exerciseId), original.exercises.map((item) => item.exerciseId));
    assert.equal(copied.exercises[0]?.sets[1]?.weightKg, null);
    const session = await repository.startSession(original.id, 'session-a', startedAt, 'Asia/Yekaterinburg');
    await repository.saveTemplate({ ...original, name: 'Переименовано', updatedAt, exercises: [...original.exercises].reverse() });
    assert.deepEqual(await repository.getSession(session.id), session, 'template update cannot rewrite session snapshot');
    await repository.deleteTemplate(original.id);
    assert.deepEqual(await repository.getSession(session.id), session);
    assert.equal((await repository.getTemplate(original.id))?.archived, true);
    assert.equal((await database.all<{ n: number }>('SELECT COUNT(*) AS n FROM template_exercises WHERE template_id=?', [original.id]))[0]?.n, original.exercises.length);
    assert.equal((await repository.listTemplates()).length, 1);
    await assert.rejects(repository.copyTemplate('missing', 'other-copy', createdAt), /не найден/);
    await assert.rejects(repository.saveTemplate({ ...copied, id: 'invalid-ref', exercises: [{ id: 'invalid-ref:e', exerciseId: 'missing', sets: [{ id: 'invalid-ref:s', reps: 10, weightKg: null }] }] }), /FOREIGN KEY/);
    assert.equal(await repository.getTemplate('invalid-ref'), null);
  } finally { database.close(); }
});

test('custom exercises are editable/archiveable without changing historical names; built-ins protected', async () => {
  const database = createSqliteTestDatabase(); const repository = createWorkoutRepository(database);
  try {
    const exercise = custom(); await repository.saveExercise(exercise);
    await repository.saveTemplate({ ...template(), exercises: [{ id: 'te-custom', exerciseId: exercise.id, sets: [{ id: 'ts-custom', reps: 5, weightKg: null }] }] });
    await repository.startSession('template-a', 'session-custom', startedAt, 'UTC');
    await repository.saveExercise({ ...exercise, name: 'Другое название', archived: true, updatedAt });
    assert.equal((await repository.listExercises()).some((item) => item.id === exercise.id), false);
    assert.equal((await repository.listExercises(true)).find((item) => item.id === exercise.id)?.archived, true);
    assert.equal((await repository.getSession('session-custom'))?.exercises[0]?.name, exercise.name);
    const builtin = (await repository.listExercises())[0]!;
    await assert.rejects(repository.saveExercise({ ...builtin, name: 'Подмена', updatedAt }), /встроенного/);
    await assert.rejects(repository.saveExercise({ ...exercise, id: 'template-a' }), /Идентификатор/);
  } finally { database.close(); }
});

test('session/set retries are idempotent, partial facts survive, finish clears timer and allows retroactive set edits', async () => {
  const database = createSqliteTestDatabase(); const repository = createWorkoutRepository(database);
  try {
    await repository.saveTemplate(template());
    const first = await repository.startSession('template-a', 'session-a', startedAt, 'UTC');
    assert.deepEqual(await repository.startSession('template-a', 'session-a', updatedAt, 'UTC'), first);
    assert.deepEqual(await repository.startSession('template-a', 'session-b', updatedAt, 'UTC'), first);
    const result = { actualReps: 8, actualWeightKg: null, completed: true } as const;
    await repository.updateSet('session-a', 'session-a:set:0:0', result, updatedAt);
    await repository.updateSet('session-a', 'session-a:set:0:0', result, updatedAt);
    assert.equal((await repository.getSession('session-a'))?.exercises[0]?.sets.length, 2);
    assert.equal((await repository.getSession('session-a'))?.exercises[0]?.sets[0]?.actualWeightKg, null);
    await assert.rejects(repository.updateSet('session-a', 'session-a:set:0:1', { actualReps: null, actualWeightKg: 20, completed: true }, updatedAt), /повторений/);
    await assert.rejects(repository.updateSet('session-a', 'session-a:set:0:0', { ...result, actualWeightKg: -1 }, updatedAt), /диапазона/);
    const unexpectedPlanEdit = { ...result, plannedReps: 99 };
    await assert.rejects(repository.updateSet('session-a', 'session-a:set:0:0', unexpectedPlanEdit, updatedAt), /состав полей/);
    await repository.setRestDeadline('session-a', '2026-11-17T11:06:30+05:00');
    await repository.finishSession('session-a', 'completed', finishedAt);
    await repository.finishSession('session-a', 'completed', '2026-11-17T13:00:00+05:00');
    assert.equal((await repository.getSession('session-a'))?.finishedAt, finishedAt);
    assert.equal((await repository.getSession('session-a'))?.restEndsAt, null);
    const later = '2026-11-20T09:00:00+05:00';
    await repository.updateSet('session-a', 'session-a:set:0:1', result, later);
    const edited = await repository.getSession('session-a');
    assert.equal(edited?.finishedAt, finishedAt);
    assert.equal(edited?.exercises[0]?.sets[1]?.updatedAt, later);
    assert.equal(edited?.exercises[0]?.sets[1]?.completed, true);
    await assert.rejects(repository.updateSet('session-a', 'session-a:set:0:1', result, finishedAt), /более новое/);
    await assert.rejects(repository.setRestDeadline('session-a', finishedAt), /завершена/);
  } finally { database.close(); }
});

test('import validation rejects malformed graphs before backup and never erases current data', async () => {
  const database = createSqliteTestDatabase(); const repository = createWorkoutRepository(database);
  try {
    await repository.saveTemplate(template()); const before = await repository.exportData();
    let backupCalled = false;
    const invalid: unknown[] = [
      { ...before, unknownFutureTable: [] },
      { ...before, exercises: [...before.exercises, before.exercises[0]] },
      { ...before, exercises: [] },
      { ...before, templates: [{ ...template(), exercises: [{ id: 'bad-e', exerciseId: 'builtin:squat-barbell', sets: [{ id: 'bad-s', reps: 8.5, weightKg: 30 }] }] }] },
      { ...before, templates: [{ ...template(), createdAt: '2026-02-30T10:00:00Z' }] },
      { ...before, templates: [{ ...template(), exercises: [{ id: 'template-a', exerciseId: 'builtin:squat-barbell', sets: [{ id: 'bad-s', reps: 8, weightKg: NaN }] }] }] },
    ];
    for (const data of invalid) {
      await assert.rejects(repository.replaceAll(data as WorkoutData, async () => { backupCalled = true; }));
      assert.deepEqual(await repository.exportData(), before);
    }
    assert.equal(backupCalled, false);
  } finally { database.close(); }
});

test('backup failure leaves data intact; replacement repeats without duplicates and is detached from caller mutations', async () => {
  const database = createSqliteTestDatabase(); const repository = createWorkoutRepository(database);
  try {
    await repository.saveTemplate(template()); const before = await repository.exportData();
    const replacement = validateWorkoutData({ exercises: [custom()], templates: [], sessions: [] });
    await assert.rejects(repository.replaceAll(replacement, async () => { throw new Error('disk full'); }), /disk full/);
    assert.deepEqual(await repository.exportData(), before);
    let saved: WorkoutData | undefined;
    await repository.replaceAll(replacement, async (data) => { saved = data; (replacement.exercises[0] as { name: string }).name = 'Mutation after validation'; });
    assert.deepEqual(saved, before);
    assert.equal((await repository.listExercises())[0]?.name, 'Моё упражнение');
    const once = await repository.exportData();
    await repository.replaceAll(once, async () => undefined);
    await repository.replaceAll(once, async () => undefined);
    assert.deepEqual(await repository.exportData(), once);
  } finally { database.close(); }
});

test('write failure during replacement rolls back even after deletion, and queue recovers', async () => {
  const real = createSqliteTestDatabase(); let breakImport = false;
  const database: SqlDatabase = {
    exec: (sql) => real.exec(sql), all: (sql, params) => real.all(sql, params), run: (sql, params) => real.run(sql, params),
    transaction: (work) => real.transaction((connection) => work({
      ...connection,
      run: (sql, params) => {
        if (breakImport && sql.startsWith('INSERT INTO exercises')) throw new Error('simulated disk write failure');
        return connection.run(sql, params);
      },
    })),
  };
  const repository = createWorkoutRepository(database);
  try {
    await repository.saveTemplate(template()); const before = await repository.exportData();
    breakImport = true;
    await assert.rejects(repository.replaceAll({ exercises: [custom()], templates: [], sessions: [] }, async () => undefined), /disk write/);
    breakImport = false;
    assert.deepEqual(await repository.exportData(), before);
    await repository.saveExercise(custom());
    assert.equal((await repository.listExercises()).some((item) => item.id === 'custom-a'), true);
  } finally { real.close(); }
});

test('queued operations cannot enter backup/import transaction; simultaneous starts create one active session', async () => {
  const database = createSqliteTestDatabase(); const repository = createWorkoutRepository(database);
  try {
    await repository.saveTemplate(template());
    const results = await Promise.all([
      repository.startSession('template-a', 'session-a', startedAt, 'UTC'),
      repository.startSession('template-a', 'session-b', startedAt, 'UTC'),
    ]);
    assert.deepEqual(results[0], results[1]);
    assert.equal((await repository.listSessions()).length, 1);
    const current = await repository.exportData();
    let releaseBackup!: () => void; let backupStarted!: () => void;
    const gate = new Promise<void>((resolve) => { releaseBackup = resolve; });
    const started = new Promise<void>((resolve) => { backupStarted = resolve; });
    const restoring = repository.replaceAll(current, async () => { backupStarted(); await gate; });
    await started;
    let changed = false;
    const saving = repository.saveExercise(custom()).then(() => { changed = true; });
    await Promise.resolve(); assert.equal(changed, false);
    releaseBackup(); await restoring; await saving;
    assert.equal((await repository.listExercises()).some((item) => item.id === 'custom-a'), true);
    assert.equal((await database.all('PRAGMA foreign_key_check')).length, 0);
  } finally { database.close(); }
});

test('same local template day coalesces template and repeat starts with new IDs during a live workout', async (t) => {
  const db = createSqliteTestDatabase();
  t.after(() => db.close());
  const repository = createWorkoutRepository(db);
  await repository.saveTemplate(template());
  await repository.saveTemplate(template('other'));
  const source = await repository.startSession('template-a', 'source', '2026-11-01T12:00:00Z', 'UTC', true);
  const live = await repository.startSession('other', 'live', startedAt, 'UTC');
  assert.equal((await repository.repeatSession(source.id, 'next-live', startedAt, 'UTC')).id, live.id);
  const [first, second] = await Promise.all([
    repository.startSession('template-a', 'retro', '2026-11-04T23:30:00Z', 'Europe/Paris', true),
    repository.repeatSession(source.id, 'other-uuid', '2026-11-05T21:30:00Z', 'Europe/Paris', true),
  ]);
  assert.deepEqual(first, second);
  const other = await repository.startSession('template-a', 'different-day', '2026-11-05T23:30:00Z', 'Europe/Paris', true);
  assert.notEqual(other.id, first.id);
  assert.equal((await repository.listSessions()).length, 4);
});

test('deleting sessions cascades sets and repeat origin while template history stays archived', async (t) => {
  const db = createSqliteTestDatabase();
  t.after(() => db.close());
  const repo = createWorkoutRepository(db);
  await repo.saveTemplate(template());
  await repo.saveTemplate(template('unused'));
  await repo.deleteTemplate('unused');
  assert.equal(await repo.getTemplate('unused'), null);
  const source = await repo.startSession('template-a', 'source', createdAt, 'UTC', true);
  await repo.repeatSession(source.id, 'live', '2026-11-19T12:00:00Z', 'UTC');
  await repo.deleteTemplate('template-a');
  assert.deepEqual(await repo.listTemplates(), []);
  assert.equal((await repo.exportData()).templates[0]?.archived, true);
  await assert.rejects(repo.saveTemplate(template()), /архив/);
  await repo.deleteSession(source.id);
  await repo.deleteSession(source.id);
  assert.equal((await repo.getSession('live'))?.repeatedFromId, undefined);
  for (const table of ['session_exercises', 'session_sets']) {
    assert.deepEqual(await db.all(`SELECT id FROM ${table} WHERE id LIKE 'source:%'`), []);
  }
  assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
  await repo.deleteSession('live');
  assert.deepEqual(await repo.listSessions(), []);
});

test('completion copies editable values forward per field and occurrence, preserving explicit zero and retry semantics', async (t) => {
  const db = createSqliteTestDatabase();
  t.after(() => db.close());
  const repo = createWorkoutRepository(db);
  const plan = template();
  const entry = plan.exercises[0]!;
  await repo.saveTemplate({ ...plan, exercises: [
    { ...entry, sets: Array.from({ length: 5 }, (_, i) => ({ id: 'planned-' + i, reps: 8, weightKg: 30 })) },
    { ...plan.exercises[1]!, exerciseId: entry.exerciseId },
  ] });
  const session = await repo.startSession(plan.id, 'live', startedAt, 'UTC');
  const ids = session.exercises[0]!.sets.map((set) => set.id);
  await repo.updateSet('live', ids[2]!, { actualReps: null, actualWeightKg: 0, completed: false, rir: 1 }, updatedAt);
  await repo.updateSet('live', ids[4]!, { actualReps: 6, actualWeightKg: 60, completed: true }, updatedAt);
  await repo.updateSet('live', ids[0]!, { actualReps: 10, actualWeightKg: 45, completed: true }, updatedAt);
  const read = async () => (await repo.getSession('live'))!.exercises[0]!.sets;
  let sets = await read();
  assert.deepEqual(sets.map((s) => [s.actualReps, s.actualWeightKg, s.completed]), [
    [10, 45, true], [10, 45, false], [10, 0, false], [10, 45, false], [6, 60, true],
  ]);
  assert.equal(sets[2]?.rir, 1);
  assert.equal((await repo.getSession('live'))?.exercises[1]?.sets[0]?.actualReps, null);
  await repo.updateSet('live', ids[3]!, { actualReps: 10, actualWeightKg: 45, completed: false, editedFields: { reps: true } }, updatedAt);
  const facts = { actualReps: 9, actualWeightKg: 42, completed: true };
  await repo.updateSet('live', ids[1]!, facts, updatedAt);
  await repo.updateSet('live', ids[1]!, facts, updatedAt);
  sets = await read();
  assert.deepEqual(sets.slice(2).map((s) => [s.actualReps, s.actualWeightKg, !!s.copiedReps, !!s.copiedWeight]), [
    [9, 0, true, false], [10, 42, false, true], [6, 60, false, false],
  ]);
});

test('v2 cold start cleans empty repeat chains while retaining active, partial facts, separate plans and dates', async (t) => {
  const db = createSqliteTestDatabase();
  t.after(() => db.close());
  const interrupted: SqlDatabase = { ...db, transaction: (work) => db.transaction((connection) => work({
    ...connection, async exec(sql) {
      if (sql === 'PRAGMA user_version = 3') throw new Error('stop at v2');
      return connection.exec(sql);
    },
  })) };
  await assert.rejects(createWorkoutRepository(interrupted).initialize(), /stop at v2/);
  await db.run("INSERT INTO templates(id,name,created_at,updated_at) VALUES('plan','A',?,?)", [createdAt, createdAt]);
  async function insert(id: string, parent: string | null, day: string, status = 'completed', exercise = 'builtin:bench-press') {
    await db.run(`INSERT INTO sessions(id,template_id,name,started_at,finished_at,time_zone,status,repeated_from_id,backdated)
      VALUES(?,'plan','A',?,?,'UTC',?,?,?)`, [id, day, status === 'active' ? null : day, status, parent, Number(status === 'completed')]);
    await db.run('INSERT INTO session_exercises(id,session_id,exercise_id,name,position) VALUES(?,?,?,?,0)', [id + '-e', id, exercise, exercise]);
    await db.run('INSERT INTO session_sets(id,session_exercise_id,position,planned_reps,completed,updated_at) VALUES(?,?,0,8,0,?)', [id + '-s', id + '-e', day]);
  }
  await insert('source', null, '2026-11-12T12:00:00Z');
  await insert('a', 'source', startedAt);
  await insert('b', 'a', startedAt);
  await insert('live', 'b', startedAt, 'active');
  await db.run("UPDATE sessions SET rest_ends_at=? WHERE id='live'", [finishedAt]);
  await insert('partial', null, startedAt);
  await db.run("UPDATE session_sets SET actual_weight_kg=0 WHERE id='partial-s'");
  await insert('rir', null, startedAt);
  await db.run("UPDATE session_sets SET rir=0 WHERE id='rir-s'");
  await insert('replacement', null, startedAt, 'completed', 'builtin:squat-barbell');
  await insert('abandoned', null, startedAt, 'abandoned');
  await insert('empty-1', null, '2026-11-01T12:00:00Z');
  await insert('empty-2', null, '2026-11-01T12:01:00Z');
  const repo = createWorkoutRepository(db);
  const sessions = await repo.listSessions();
  assert.deepEqual(sessions.map((s) => s.id).sort(), ['abandoned', 'empty-1', 'live', 'partial', 'replacement', 'rir', 'source']);
  assert.equal((await repo.getSession('live'))?.repeatedFromId, 'source');
  assert.equal((await repo.getSession('partial'))?.exercises[0]?.sets[0]?.actualWeightKg, 0);
  assert.deepEqual(await createWorkoutRepository(db).listSessions(), sessions);
  await repo.setRestDeadline('live', null);
  const reopened = createWorkoutRepository(db);
  assert.equal(await reopened.getSession('live'), null, 'an empty live duplicate yields to the day with facts');
  assert.ok(await reopened.getSession('partial'));
  const next = '2026-11-21T12:00:00Z';
  await insert('empty-live', null, next, 'active');
  await insert('accidental', null, next);
  await insert('empty-source', null, startedAt);
  await insert('next-repeat', 'empty-source', '2026-11-22T12:00:00Z');
  const again = createWorkoutRepository(db);
  assert.equal(await again.getSession('accidental'), null);
  assert.equal((await again.getSession('empty-live'))?.status, 'active');
  assert.equal(await again.getSession('empty-source'), null);
  assert.equal((await again.getSession('next-repeat'))?.repeatedFromId, 'partial');
  assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
});
