import type {
  Exercise, PerformedSet, SessionExercise, SetResult, WorkoutData, WorkoutRepository,
  WorkoutSession, WorkoutTemplate, WorkoutTimestamp,
} from '../../features/workouts/model';
import {
  validateExercise, validateSession, validateSetResult, validateTemplate, validateWorkoutData,
  validateWorkoutId, validateWorkoutTimestamp, validateWorkoutTimeZone,
} from '../../features/workouts/validation';
import type { SqlConnection, SqlDatabase } from './connection';
import { migrateWorkoutDatabase } from './migrations';

type ExerciseRow = { id: string; name: string; aliases_json: string; origin: Exercise['origin']; archived: number; created_at: string; updated_at: string };
type TemplateRow = { id: string; name: string; weekday: WorkoutTemplate['weekday']; created_at: string; updated_at: string };
type TemplateExerciseRow = { id: string; template_id: string; exercise_id: string; position: number };
type TemplateSetRow = { id: string; template_exercise_id: string; position: number; reps: number; weight_kg: number | null };
type SessionRow = { id: string; template_id: string | null; name: string; started_at: string; finished_at: string | null; time_zone: string; status: WorkoutSession['status']; rest_ends_at: string | null };
type SessionExerciseRow = { id: string; session_id: string; exercise_id: string; name: string; position: number };
type SessionSetRow = { id: string; session_exercise_id: string; position: number; planned_reps: number; planned_weight_kg: number | null; actual_reps: number | null; actual_weight_kg: number | null; completed: number; updated_at: string };

async function exercises(connection: SqlConnection): Promise<Exercise[]> {
  return (await connection.all<ExerciseRow>('SELECT * FROM exercises ORDER BY name,id')).map((row) => ({
    id: row.id, name: row.name, aliases: JSON.parse(row.aliases_json) as string[], origin: row.origin,
    archived: row.archived === 1, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}
async function templates(connection: SqlConnection): Promise<WorkoutTemplate[]> {
  const rows = await connection.all<TemplateRow>('SELECT * FROM templates ORDER BY name,id');
  const entries = await connection.all<TemplateExerciseRow>('SELECT * FROM template_exercises ORDER BY template_id,position');
  const sets = await connection.all<TemplateSetRow>('SELECT * FROM template_sets ORDER BY template_exercise_id,position');
  return rows.map((row) => ({
    id: row.id, name: row.name, weekday: row.weekday, createdAt: row.created_at, updatedAt: row.updated_at,
    exercises: entries.filter((entry) => entry.template_id === row.id).map((entry) => ({
      id: entry.id, exerciseId: entry.exercise_id,
      sets: sets.filter((set) => set.template_exercise_id === entry.id).map((set) => ({ id: set.id, reps: set.reps, weightKg: set.weight_kg })),
    })),
  }));
}
async function sessions(connection: SqlConnection): Promise<WorkoutSession[]> {
  const rows = await connection.all<SessionRow>('SELECT * FROM sessions ORDER BY julianday(started_at) DESC,id DESC');
  const entries = await connection.all<SessionExerciseRow>('SELECT * FROM session_exercises ORDER BY session_id,position');
  const sets = await connection.all<SessionSetRow>('SELECT * FROM session_sets ORDER BY session_exercise_id,position');
  return rows.map((row) => ({
    id: row.id, templateId: row.template_id, name: row.name, startedAt: row.started_at, finishedAt: row.finished_at,
    timeZone: row.time_zone, status: row.status, restEndsAt: row.rest_ends_at,
    exercises: entries.filter((entry) => entry.session_id === row.id).map((entry): SessionExercise => ({
      id: entry.id, exerciseId: entry.exercise_id, name: entry.name,
      sets: sets.filter((set) => set.session_exercise_id === entry.id).map((set): PerformedSet => ({
        id: set.id, plannedReps: set.planned_reps, plannedWeightKg: set.planned_weight_kg,
        actualReps: set.actual_reps, actualWeightKg: set.actual_weight_kg, completed: set.completed === 1, updatedAt: set.updated_at,
      })),
    })),
  }));
}
async function snapshot(connection: SqlConnection): Promise<WorkoutData> {
  return { exercises: await exercises(connection), templates: await templates(connection), sessions: await sessions(connection) };
}
async function writeExercise(connection: SqlConnection, exercise: Exercise): Promise<void> {
  await connection.run(`INSERT INTO exercises(id,name,aliases_json,origin,archived,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,aliases_json=excluded.aliases_json,archived=excluded.archived,updated_at=excluded.updated_at`,
  [exercise.id, exercise.name, JSON.stringify(exercise.aliases), exercise.origin, Number(exercise.archived), exercise.createdAt, exercise.updatedAt]);
}
async function writeTemplate(connection: SqlConnection, template: WorkoutTemplate): Promise<void> {
  await connection.run(`INSERT INTO templates(id,name,weekday,created_at,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,weekday=excluded.weekday,updated_at=excluded.updated_at`,
  [template.id, template.name, template.weekday, template.createdAt, template.updatedAt]);
  // Keep the parent row: replacing it would SET NULL the source of historical sessions.
  await connection.run('DELETE FROM template_exercises WHERE template_id=?', [template.id]);
  for (const [position, exercise] of template.exercises.entries()) {
    await connection.run('INSERT INTO template_exercises(id,template_id,exercise_id,position) VALUES(?,?,?,?)', [exercise.id, template.id, exercise.exerciseId, position]);
    for (const [setPosition, set] of exercise.sets.entries()) {
      await connection.run('INSERT INTO template_sets(id,template_exercise_id,position,reps,weight_kg) VALUES(?,?,?,?,?)', [set.id, exercise.id, setPosition, set.reps, set.weightKg]);
    }
  }
}
async function writeSession(connection: SqlConnection, session: WorkoutSession): Promise<void> {
  await connection.run('INSERT INTO sessions(id,template_id,name,started_at,finished_at,time_zone,status,rest_ends_at) VALUES(?,?,?,?,?,?,?,?)',
    [session.id, session.templateId, session.name, session.startedAt, session.finishedAt, session.timeZone, session.status, session.restEndsAt]);
  for (const [position, exercise] of session.exercises.entries()) {
    await connection.run('INSERT INTO session_exercises(id,session_id,exercise_id,name,position) VALUES(?,?,?,?,?)', [exercise.id, session.id, exercise.exerciseId, exercise.name, position]);
    for (const [setPosition, set] of exercise.sets.entries()) {
      await connection.run(`INSERT INTO session_sets(id,session_exercise_id,position,planned_reps,planned_weight_kg,actual_reps,actual_weight_kg,completed,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`,
        [set.id, exercise.id, setPosition, set.plannedReps, set.plannedWeightKg, set.actualReps, set.actualWeightKg, Number(set.completed), set.updatedAt]);
    }
  }
}
async function getRequiredSession(connection: SqlConnection, id: string): Promise<WorkoutSession> {
  const session = (await sessions(connection)).find((item) => item.id === id);
  if (!session) throw new Error('Тренировка не найдена.');
  return session;
}
function requireActive(session: WorkoutSession): void {
  if (session.status !== 'active') throw new Error('Тренировка уже завершена.');
}
function templateIds(template: WorkoutTemplate): string[] {
  return [template.id, ...template.exercises.flatMap((exercise) => [exercise.id, ...exercise.sets.map((set) => set.id)])];
}
function sessionIds(session: WorkoutSession): string[] {
  return [session.id, ...session.exercises.flatMap((exercise) => [exercise.id, ...exercise.sets.map((set) => set.id)])];
}
async function ensureIdsAvailable(connection: SqlConnection, incoming: readonly string[], allowed: readonly string[] = []): Promise<void> {
  const rows = await connection.all<{ id: string }>(`SELECT id FROM exercises UNION ALL SELECT id FROM templates
    UNION ALL SELECT id FROM template_exercises UNION ALL SELECT id FROM template_sets
    UNION ALL SELECT id FROM sessions UNION ALL SELECT id FROM session_exercises UNION ALL SELECT id FROM session_sets`);
  const allowedIds = new Set(allowed); const occupied = new Set(rows.filter((row) => !allowedIds.has(row.id)).map((row) => row.id));
  if (incoming.some((id) => occupied.has(id))) throw new Error('Идентификатор уже используется другой записью.');
}

/** Owns its connection. Every read, write, migration and restore passes through one queue. */
export function createWorkoutRepository(database: SqlDatabase): WorkoutRepository {
  let tail: Promise<void> = Promise.resolve();
  let initialized = false;
  async function initialize(): Promise<void> {
    if (initialized) return;
    await migrateWorkoutDatabase(database);
    initialized = true;
  }
  function queued<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(async () => { await initialize(); return operation(); });
    tail = result.then(() => undefined, () => undefined);
    return result;
  }
  return {
    initialize: () => queued(async () => undefined),
    listExercises: (includeArchived = false) => queued(async () => (await exercises(database)).filter((item) => includeArchived || !item.archived)),
    saveExercise: (input) => queued(async () => {
      const exercise = validateExercise(input);
      await database.transaction(async (connection) => {
        const existing = (await exercises(connection)).find((item) => item.id === exercise.id);
        if (existing) {
          if (existing.origin !== exercise.origin || existing.createdAt !== exercise.createdAt) throw new Error('Происхождение и дата создания упражнения не изменяются.');
          if (Date.parse(exercise.updatedAt) < Date.parse(existing.updatedAt)) throw new Error('Упражнение уже содержит более новое изменение.');
          if (existing.origin === 'builtin' && (existing.name !== exercise.name || JSON.stringify(existing.aliases) !== JSON.stringify(exercise.aliases))) throw new Error('Для изменения встроенного упражнения создайте собственное.');
        } else {
          if (exercise.origin !== 'custom') throw new Error('Новое упражнение должно быть собственным.');
          await ensureIdsAvailable(connection, [exercise.id]);
        }
        await writeExercise(connection, exercise);
      });
    }),
    listTemplates: () => queued(() => templates(database)),
    getTemplate: (id) => queued(async () => (await templates(database)).find((item) => item.id === validateWorkoutId(id)) ?? null),
    saveTemplate: (input) => queued(async () => {
      const template = validateTemplate(input);
      await database.transaction(async (connection) => {
        const previous = (await templates(connection)).find((item) => item.id === template.id);
        if (previous && (template.createdAt !== previous.createdAt || Date.parse(template.updatedAt) < Date.parse(previous.updatedAt))) throw new Error('Дата создания или версия шаблона не совпадает.');
        await ensureIdsAvailable(connection, templateIds(template), previous ? templateIds(previous) : []);
        await writeTemplate(connection, template);
      });
    }),
    copyTemplate: (id, newId, now) => queued(async () => {
      validateWorkoutId(id); validateWorkoutId(newId); validateWorkoutTimestamp(now);
      return database.transaction(async (connection) => {
        const original = (await templates(connection)).find((item) => item.id === id);
        if (!original) throw new Error('Шаблон не найден.');
        const copy = validateTemplate({
          ...original, id: newId, name: `${original.name.slice(0, 190)} (копия)`, createdAt: now, updatedAt: now,
          exercises: original.exercises.map((exercise, position) => ({
            ...exercise, id: `${newId}:exercise:${position}`,
            sets: exercise.sets.map((set, setPosition) => ({ ...set, id: `${newId}:set:${position}:${setPosition}` })),
          })),
        });
        await ensureIdsAvailable(connection, templateIds(copy));
        await writeTemplate(connection, copy);
        return copy;
      });
    }),
    deleteTemplate: (id) => queued(async () => {
      validateWorkoutId(id);
      await database.transaction((connection) => connection.run('DELETE FROM templates WHERE id=?', [id]).then(() => undefined));
    }),
    listSessions: () => queued(() => sessions(database)),
    getSession: (id) => queued(async () => (await sessions(database)).find((item) => item.id === validateWorkoutId(id)) ?? null),
    startSession: (templateId, sessionId, startedAt, timeZone) => queued(async () => {
      validateWorkoutId(templateId); validateWorkoutId(sessionId); validateWorkoutTimestamp(startedAt); validateWorkoutTimeZone(timeZone);
      return database.transaction(async (connection) => {
        const previous = await sessions(connection);
        const existing = previous.find((item) => item.id === sessionId);
        if (existing) {
          if (existing.templateId !== templateId) throw new Error('Этот идентификатор запуска относится к другой тренировке.');
          return existing;
        }
        if (previous.some((item) => item.status === 'active')) throw new Error('Сначала продолжите или завершите текущую тренировку.');
        const template = (await templates(connection)).find((item) => item.id === templateId);
        if (!template) throw new Error('Шаблон не найден.');
        const catalog = new Map((await exercises(connection)).map((item) => [item.id, item]));
        const session = validateSession({
          id: sessionId, templateId, name: template.name, startedAt, finishedAt: null, timeZone, status: 'active', restEndsAt: null,
          exercises: template.exercises.map((exercise, position) => {
            const entry = catalog.get(exercise.exerciseId);
            if (!entry) throw new Error('Упражнение отсутствует в справочнике.');
            return {
              id: `${sessionId}:exercise:${position}`, exerciseId: exercise.exerciseId, name: entry.name,
              sets: exercise.sets.map((set, setPosition) => ({
                id: `${sessionId}:set:${position}:${setPosition}`, plannedReps: set.reps, plannedWeightKg: set.weightKg,
                actualReps: null, actualWeightKg: null, completed: false, updatedAt: startedAt,
              })),
            };
          }),
        });
        await ensureIdsAvailable(connection, sessionIds(session));
        await writeSession(connection, session);
        return session;
      });
    }),
    updateSet: (sessionId, setId, result: SetResult, now: WorkoutTimestamp) => queued(async () => {
      validateWorkoutId(sessionId); validateWorkoutId(setId); validateWorkoutTimestamp(now);
      const validatedResult = validateSetResult(result);
      await database.transaction(async (connection) => {
        const session = await getRequiredSession(connection, sessionId); requireActive(session);
        const set = session.exercises.flatMap((exercise) => exercise.sets).find((item) => item.id === setId);
        if (!set) throw new Error('Подход не найден в этой тренировке.');
        if (Date.parse(now) < Date.parse(set.updatedAt)) throw new Error('Подход уже содержит более новое изменение.');
        const changed = { ...set, ...validatedResult, updatedAt: now };
        validateSession({ ...session, exercises: session.exercises.map((exercise) => ({ ...exercise, sets: exercise.sets.map((item) => item.id === setId ? changed : item) })) });
        await connection.run('UPDATE session_sets SET actual_reps=?,actual_weight_kg=?,completed=?,updated_at=? WHERE id=?',
          [changed.actualReps, changed.actualWeightKg, Number(changed.completed), now, setId]);
      });
    }),
    finishSession: (id, status, finishedAt) => queued(async () => {
      validateWorkoutId(id); validateWorkoutTimestamp(finishedAt);
      if (status !== 'completed' && status !== 'abandoned') throw new Error('Неизвестный результат завершения.');
      await database.transaction(async (connection) => {
        const session = await getRequiredSession(connection, id);
        if (session.status === status) return; // Retried completion preserves the original finish time.
        requireActive(session);
        validateSession({ ...session, status, finishedAt, restEndsAt: null });
        await connection.run('UPDATE sessions SET status=?,finished_at=?,rest_ends_at=NULL WHERE id=?', [status, finishedAt, id]);
      });
    }),
    setRestDeadline: (id, deadline) => queued(async () => {
      validateWorkoutId(id);
      if (deadline !== null) validateWorkoutTimestamp(deadline);
      await database.transaction(async (connection) => {
        const session = await getRequiredSession(connection, id); requireActive(session);
        validateSession({ ...session, restEndsAt: deadline });
        await connection.run('UPDATE sessions SET rest_ends_at=? WHERE id=?', [deadline, id]);
      });
    }),
    exportData: () => queued(() => snapshot(database)),
    replaceAll: (input, beforeReplace) => {
      // Validation also detaches input, so callers cannot change it while queued/file backup runs.
      let replacement: WorkoutData;
      try { replacement = validateWorkoutData(input); } catch (error) { return Promise.reject(error); }
      return queued(async () => {
        const current = await snapshot(database);
        // This callback writes a durable file only; it must not call this queued repository itself.
        await beforeReplace(current);
        await database.transaction(async (connection) => {
          await connection.exec('DELETE FROM sessions; DELETE FROM templates; DELETE FROM exercises;');
          for (const exercise of replacement.exercises) await writeExercise(connection, exercise);
          for (const template of replacement.templates) await writeTemplate(connection, template);
          for (const session of replacement.sessions) await writeSession(connection, session);
          if ((await connection.all('PRAGMA foreign_key_check')).length !== 0) throw new Error('Восстановление нарушает связи данных.');
        });
      });
    },
  };
}
