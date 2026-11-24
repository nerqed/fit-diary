import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACKUP_FORMAT_VERSION,
  MAX_BACKUP_BYTES,
  exportWorkoutBackup,
  importWorkoutBackup,
  parseWorkoutBackup,
  previewWorkoutBackup,
  serializeWorkoutBackup,
  type BackupWriter,
} from '../src/features/backup/core';
import { WORKOUT_SCHEMA_VERSION } from '../src/data/sqlite/migrations';
import { createWorkoutRepository } from '../src/data/sqlite/workoutRepository';
import type { Exercise, WorkoutData } from '../src/features/workouts/model';
import { createSqliteTestDatabase } from './sqliteTestDatabase';

const created = '2026-11-01T10:00:00+05:00';
const started = '2026-11-10T10:00:00+05:00';
const now = '2026-11-17T10:00:00+05:00';

function customExercise(id = 'custom-squat'): Exercise {
  return {
    id, name: 'Мои приседания', aliases: ['Приседание с собственным весом'], origin: 'custom',
    archived: false, createdAt: created, updatedAt: created,
  };
}

function fixture(): WorkoutData {
  return {
    bodyWeights: [{ date: '2026-11-10', weightKg: 72.4 }],
    settings: { showRir: true, showNotes: true },
    exercises: [{ ...customExercise(), note: 'сиденье на 4' }],
    templates: [{
      id: 'template', name: 'Моя тренировка', weekday: null, createdAt: created, updatedAt: created,
      exercises: [{
        id: 'template-exercise', exerciseId: 'custom-squat', sets: [
          { id: 'template-set-1', reps: 10, weightKg: 0 },
          { id: 'template-set-2', reps: 8, weightKg: null },
        ],
      }],
    }],
    sessions: [{
      id: 'session', templateId: 'template', name: 'Моя тренировка', startedAt: started,
      finishedAt: null, timeZone: 'Asia/Yekaterinburg', status: 'active',
      restEndsAt: '2026-11-10T10:01:30+05:00',
      exercises: [{
        id: 'session-exercise', exerciseId: 'custom-squat', name: 'Мои приседания', sets: [
          { id: 'session-set-1', plannedReps: 10, plannedWeightKg: 0, actualReps: 10, actualWeightKg: 0, completed: true, updatedAt: started, rir: 0 },
          { id: 'session-set-2', plannedReps: 8, plannedWeightKg: null, actualReps: null, actualWeightKg: null, completed: false, updatedAt: started, rir: null },
        ],
      }],
    }],
  };
}

function recordingWriter() {
  const writes: { text: string; reason: 'export' | 'before-import' }[] = [];
  const writer: BackupWriter = {
    async write(text, reason) {
      writes.push({ text, reason });
      return { uri: `file:///documents/backups/${writes.length}.json`, name: `${writes.length}.json` };
    },
  };
  return { writer, writes };
}

test('backup round trip preserves every collection, stable IDs, timestamps, null and real zero', () => {
  const original = fixture();
  const text = serializeWorkoutBackup(original, now);
  const backup = parseWorkoutBackup(text);
  assert.equal(backup.kind, 'forma-workouts');
  assert.equal(backup.formatVersion, BACKUP_FORMAT_VERSION);
  assert.equal(backup.schemaVersion, WORKOUT_SCHEMA_VERSION);
  assert.deepEqual(backup.data, original);
  assert.deepEqual(previewWorkoutBackup(backup), { exportedAt: now, exercises: 1, templates: 1, sessions: 1, bodyWeights: 1 });
  assert.equal(backup.data.sessions[0]?.exercises[0]?.sets[0]?.actualWeightKg, 0);
  assert.equal(backup.data.sessions[0]?.exercises[0]?.sets[1]?.actualWeightKg, null);
  assert.deepEqual(parseWorkoutBackup(`\uFEFF${text}`), backup);
});

test('legacy values survive backup restore and unrelated edits while new input respects its limits', async (t) => {
  const database = createSqliteTestDatabase();
  t.after(() => database.close());
  const repository = createWorkoutRepository(database);
  const { writer } = recordingWriter();
  const original = fixture();
  const [template] = original.templates;
  const [session] = original.sessions;
  const [templateExercise] = template!.exercises;
  const [sessionExercise] = session!.exercises;
  const [planned, nextPlanned] = templateExercise!.sets;
  const [performed, nextPerformed] = sessionExercise!.sets;
  const legacyTemplate = { ...template!, exercises: [{ ...templateExercise!, sets: [
    { ...planned!, reps: 350, weightKg: 790 }, nextPlanned!,
  ] }] };
  const legacyFacts = { actualReps: 350, actualWeightKg: 790, completed: true };
  const legacySession = { ...session!, exercises: [{ ...sessionExercise!, sets: [
    { ...performed!, plannedReps: 350, plannedWeightKg: 790, ...legacyFacts }, nextPerformed!,
  ] }] };
  const legacy = { ...original, templates: [legacyTemplate], sessions: [legacySession] };

  await importWorkoutBackup(repository, writer, serializeWorkoutBackup(legacy, now), 'replace-all', now);
  assert.deepEqual(await repository.exportData(), legacy);
  await repository.saveTemplate({ ...legacyTemplate, name: 'Новое название', updatedAt: now });
  await repository.updateSet('session', 'session-set-1', { ...legacyFacts, rir: 2 }, now);
  await repository.updateSet('session', 'session-set-2', { actualReps: 300, actualWeightKg: 600, completed: true }, now);
  await repository.setRestDeadline('session', null);
  await repository.finishSession('session', 'completed', now);

  const updated = parseWorkoutBackup(serializeWorkoutBackup(await repository.exportData(), now)).data;
  assert.deepEqual(updated.templates[0]?.exercises[0]?.sets[0], legacyTemplate.exercises[0]?.sets[0]);
  assert.deepEqual(updated.sessions[0]?.exercises[0]?.sets[0], { ...legacySession.exercises[0]?.sets[0], rir: 2, updatedAt: now });
  assert.equal(updated.sessions[0]?.exercises[0]?.sets[1]?.actualWeightKg, 600);
  await assert.rejects(repository.saveTemplate({ ...legacyTemplate, exercises: [{ ...templateExercise!, sets: [
    { ...planned!, reps: 301 }, nextPlanned!,
  ] }], updatedAt: now }), /до 300 повторений/);
  await assert.rejects(repository.updateSet('session', 'session-set-1', { ...legacyFacts, actualWeightKg: 791 }, now), /до 600 кг/);
});

test('unsupported versions, foreign formats and unknown fields are rejected rather than discarded', () => {
  const valid = JSON.parse(serializeWorkoutBackup(fixture(), now)) as Record<string, unknown>;
  const cases = [
    { ...valid, formatVersion: BACKUP_FORMAT_VERSION + 1 },
    { ...valid, schemaVersion: WORKOUT_SCHEMA_VERSION + 1 },
    { ...valid, kind: 'some-other-app' },
    { ...valid, extra: 'future-field' },
    { ...valid, data: { ...fixture(), nutrition: [] } },
    { ...valid, data: { ...fixture(), exercises: [{ ...customExercise(), foreign: true }] } },
  ];
  for (const value of cases) assert.throws(() => parseWorkoutBackup(JSON.stringify(value)));
  assert.throws(() => parseWorkoutBackup('{}'));
  assert.throws(() => parseWorkoutBackup('null'));
  assert.throws(() => parseWorkoutBackup('[]'));
  assert.throws(() => parseWorkoutBackup('{broken-json'), /JSON/);
});

test('restore a v1 workout file after saving a complete recovery snapshot', async (t) => {
  const database = createSqliteTestDatabase();
  t.after(() => database.close());
  const repository = createWorkoutRepository(database);
  await repository.replaceAll(fixture(), async () => {});
  const oldExercise = customExercise('v1-exercise');
  const envelope = {
    kind: 'forma-workouts', formatVersion: 1, schemaVersion: 1, exportedAt: now,
    data: { exercises: [oldExercise], templates: [], sessions: [{
      id: 'v1-session', templateId: null, name: 'Тренировка', startedAt: started, finishedAt: now, timeZone: 'UTC',
      status: 'completed', restEndsAt: null, exercises: [{ id: 'v1-entry', exerciseId: oldExercise.id, name: oldExercise.name, sets: [{
        id: 'v1-set', plannedReps: 8, plannedWeightKg: 40, actualReps: 6, actualWeightKg: 40, completed: true, updatedAt: started,
      }] }],
    }] },
  };
  const { writer, writes } = recordingWriter();
  await importWorkoutBackup(repository, writer, JSON.stringify(envelope), 'replace-all', now);
  assert.deepEqual(parseWorkoutBackup(writes[0]!.text).data, fixture());
  const data = await repository.exportData();
  assert.deepEqual(data.settings, { showRir: false, showNotes: false });
  assert.deepEqual(data.bodyWeights, []);
  assert.deepEqual(data.exercises, [oldExercise]);
  const set = data.sessions[0]?.exercises[0]?.sets[0];
  assert.equal(set?.actualReps, 6);
  assert.equal(set?.actualWeightKg, 40);
  assert.equal(set?.rir, null);
  assert.throws(() => parseWorkoutBackup(JSON.stringify({ ...envelope, schemaVersion: 2 })));
  assert.throws(() => parseWorkoutBackup(JSON.stringify({ ...envelope, data: { ...envelope.data, bodyWeights: [] } })));
});

test('incomplete copies and invalid progress data are rejected before automatic backup or mutation', async (t) => {
  const database = createSqliteTestDatabase();
  t.after(() => database.close());
  const repository = createWorkoutRepository(database);
  const original = JSON.parse(serializeWorkoutBackup(fixture(), now));
  const { writer, writes } = recordingWriter();
  const before = await repository.exportData();
  const bad = [
    { ...original.data, bodyWeights: null },
    { ...original.data, settings: undefined },
    { ...original.data, settings: { showNotes: false, showRir: 1 } },
    { ...original.data, bodyWeights: [{ date: '2026-02-30', weightKg: 70 }] },
    { ...original.data, bodyWeights: [...original.data.bodyWeights, ...original.data.bodyWeights] },
  ];
  const invalidRir = structuredClone(original.data);
  invalidRir.sessions[0].exercises[0].sets[0].rir = 4;
  for (const data of [...bad, invalidRir]) {
    await assert.rejects(importWorkoutBackup(repository, writer, JSON.stringify({ ...original, data }), 'replace-all', now));
  }
  assert.equal(writes.length, 0);
  assert.deepEqual(await repository.exportData(), before);
});

test('invalid references, duplicated identifiers and invalid numeric values cannot be restored', () => {
  const valid = JSON.parse(serializeWorkoutBackup(fixture(), now));
  const badReference = structuredClone(valid);
  badReference.data.templates[0].exercises[0].exerciseId = 'missing-exercise';
  const duplicatedExercise = structuredClone(valid);
  duplicatedExercise.data.exercises.push(duplicatedExercise.data.exercises[0]);
  const duplicatedSet = structuredClone(valid);
  duplicatedSet.data.sessions[0].exercises[0].sets[1].id = duplicatedSet.data.sessions[0].exercises[0].sets[0].id;
  const badWeight = structuredClone(valid);
  badWeight.data.sessions[0].exercises[0].sets[0].actualWeightKg = -1;
  const badCompleted = structuredClone(valid);
  badCompleted.data.sessions[0].exercises[0].sets[0].actualReps = null;
  const copiedFact = structuredClone(valid);
  copiedFact.data.sessions[0].exercises[0].sets[0].copiedWeight = true;
  const missingCopy = structuredClone(valid);
  missingCopy.data.sessions[0].exercises[0].sets[1].copiedReps = true;
  for (const value of [badReference, duplicatedExercise, duplicatedSet, badWeight, badCompleted, copiedFact, missingCopy]) {
    assert.throws(() => parseWorkoutBackup(JSON.stringify(value)));
  }
});

test('backup metadata requires a real ISO date with timezone, not normalized impossible dates', () => {
  const original = fixture();
  const valid = JSON.parse(serializeWorkoutBackup(original, now));
  for (const exportedAt of ['2026-02-30T10:00:00Z', '2026-11-17T10:00:00', 'not-a-date']) {
    assert.throws(() => serializeWorkoutBackup(original, exportedAt));
    assert.throws(() => parseWorkoutBackup(JSON.stringify({ ...valid, exportedAt })));
  }
});

test('backup size limit measures UTF-8 bytes, not Cyrillic character count', () => {
  // About 8 Mi characters / 16 MiB in UTF-8: the character count remains below the limit.
  const text = JSON.stringify({ padding: 'я'.repeat(Math.floor(MAX_BACKUP_BYTES / 2) + 1) });
  assert.ok(text.length < MAX_BACKUP_BYTES);
  assert.ok(Buffer.byteLength(text, 'utf8') > MAX_BACKUP_BYTES);
  assert.throws(() => parseWorkoutBackup(text), /слишком большой|допустимый размер/);
});

test('export writes the entire current database snapshot with explicit format and reason', async (t) => {
  const database = createSqliteTestDatabase();
  t.after(() => database.close());
  const repository = createWorkoutRepository(database);
  await repository.initialize();
  await repository.replaceAll(fixture(), async () => {});
  const expected = await repository.exportData();
  const { writer, writes } = recordingWriter();
  const result = await exportWorkoutBackup(repository, writer, now);
  assert.deepEqual(result, { uri: 'file:///documents/backups/1.json', name: '1.json' });
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.reason, 'export');
  assert.deepEqual(parseWorkoutBackup(writes[0]!.text).data, expected);
});

test('missing explicit confirmation and corrupt input perform neither backup write nor database replacement', async (t) => {
  const database = createSqliteTestDatabase();
  t.after(() => database.close());
  const repository = createWorkoutRepository(database);
  await repository.initialize();
  const before = await repository.exportData();
  const { writer, writes } = recordingWriter();
  const text = serializeWorkoutBackup(fixture(), now);
  await assert.rejects(importWorkoutBackup(repository, writer, text, undefined as unknown as 'replace-all', now), /подтверждение/);
  await assert.rejects(importWorkoutBackup(repository, writer, '{broken', 'replace-all', now));
  const invalidGraph = JSON.parse(text);
  invalidGraph.data.templates[0].exercises[0].exerciseId = 'missing';
  await assert.rejects(importWorkoutBackup(repository, writer, JSON.stringify(invalidGraph), 'replace-all', now));
  assert.deepEqual(writes, []);
  assert.deepEqual(await repository.exportData(), before);
});

test('failed automatic backup leaves all current data untouched', async (t) => {
  const database = createSqliteTestDatabase();
  t.after(() => database.close());
  const repository = createWorkoutRepository(database);
  await repository.initialize();
  await repository.saveExercise(customExercise('keep-me'));
  const before = await repository.exportData();
  let calls = 0;
  const writer: BackupWriter = { async write() { calls += 1; throw new Error('disk full'); } };
  await assert.rejects(importWorkoutBackup(repository, writer, serializeWorkoutBackup(fixture(), now), 'replace-all', now), /disk full/);
  assert.equal(calls, 1);
  assert.deepEqual(await repository.exportData(), before);
});

test('automatic recovery copy contains latest current data; repeated imports preserve exact IDs without duplicates', async (t) => {
  const database = createSqliteTestDatabase();
  t.after(() => database.close());
  const repository = createWorkoutRepository(database);
  await repository.initialize();
  const text = serializeWorkoutBackup(fixture(), now);
  previewWorkoutBackup(parseWorkoutBackup(text));
  // A legitimate edit after preview must still be included in the recovery copy.
  await repository.saveExercise(customExercise('added-after-preview'));
  const current = await repository.exportData();
  const { writer, writes } = recordingWriter();
  const first = await importWorkoutBackup(repository, writer, text, 'replace-all', now);
  assert.deepEqual(first.restored, { exportedAt: now, exercises: 1, templates: 1, sessions: 1, bodyWeights: 1 });
  assert.equal(first.recoveryFile.uri, 'file:///documents/backups/1.json');
  assert.equal(writes[0]?.reason, 'before-import');
  assert.deepEqual(parseWorkoutBackup(writes[0]!.text).data, current);
  const restored = await repository.exportData();
  assert.deepEqual(restored, fixture());
  await importWorkoutBackup(repository, writer, text, 'replace-all', now);
  assert.equal(writes.length, 2);
  assert.deepEqual(parseWorkoutBackup(writes[1]!.text).data, restored);
  assert.deepEqual(await repository.exportData(), restored);
});

test('import v2 merges an empty legacy repeat chain immediately and v3 round-trips archives and copied field provenance', async (t) => {
  const db = createSqliteTestDatabase();
  t.after(() => db.close());
  const repo = createWorkoutRepository(db);
  const original = fixture();
  const base = original.sessions[0]!;
  function legacy(id: string, start: string, parent?: string, fact = false) {
    return { ...base, id, templateId: null, status: 'completed', finishedAt: start, startedAt: start,
      restEndsAt: null, ...(parent ? { repeatedFromId: parent } : {}),
      exercises: [{ ...base.exercises[0]!, id: id + '-e', sets: [
        { ...base.exercises[0]!.sets[0]!, id: id + '-s', actualReps: fact ? 8 : null, actualWeightKg: null,
          completed: fact, updatedAt: start, rir: null },
      ] }],
    };
  }
  const data = { ...original, sessions: [
    legacy('source', created), legacy('a', started, 'source'), legacy('b', started, 'a'),
    legacy('done', started, 'b', true), legacy('unrelated', started),
  ] };
  const { writer } = recordingWriter();
  await importWorkoutBackup(repo, writer, JSON.stringify({ kind: 'forma-workouts', formatVersion: 2, schemaVersion: 2, exportedAt: now, data }), 'replace-all', now);
  assert.deepEqual((await repo.listSessions()).map((s) => s.id).sort(), ['done', 'source', 'unrelated']);
  assert.equal((await repo.getSession('done'))?.repeatedFromId, 'source');
  assert.equal((await repo.repeatSession('source', 'new-id', started, base.timeZone, true)).id, 'done');
  const next = await repo.startSession('template', 'new-session', now, 'UTC');
  await repo.updateSet(next.id, next.exercises[0]!.sets[0]!.id, { actualReps: 12, actualWeightKg: 0, completed: true }, now);
  await repo.deleteTemplate('template');
  const before = await repo.exportData();
  const backup = serializeWorkoutBackup(before, now);
  const set = parseWorkoutBackup(backup).data.sessions.find((s) => s.id === next.id)?.exercises[0]?.sets[1];
  assert.equal(set?.copiedReps, true);
  assert.equal(set?.copiedWeight, true);
  await importWorkoutBackup(repo, writer, backup, 'replace-all', now);
  assert.deepEqual(await repo.exportData(), before);
  assert.deepEqual(await repo.listTemplates(), []);
  assert.throws(() => parseWorkoutBackup(JSON.stringify({ ...JSON.parse(backup), schemaVersion: 2, formatVersion: 2 })));
});
