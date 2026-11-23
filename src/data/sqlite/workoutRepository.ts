import type {
  BodyWeight, Exercise, PerformedSet, SessionExercise, SetResult, WorkoutData, WorkoutRepository,
  WorkoutSession, WorkoutSettings, WorkoutTemplate, WorkoutTimestamp,
} from '../../features/workouts/model';
import { defaultWorkoutSettings } from '../../features/workouts/model';
import {
  validateBodyWeight, validateExercise, validateSession, validateSetResult, validateTemplate, validateWorkoutData, validateWorkoutSettings,
  validateWorkoutId, validateWorkoutTimestamp, validateWorkoutTimeZone,
} from '../../features/workouts/validation';
import type { SqlConnection, SqlDatabase } from './connection';
import { migrateWorkoutDatabase } from './migrations';

type ExerciseRow = { id: string; name: string; aliases_json: string; origin: Exercise['origin']; archived: number; created_at: string; updated_at: string; note: string | null };
type TemplateRow = { id: string; name: string; weekday: WorkoutTemplate['weekday']; created_at: string; updated_at: string };
type TemplateExerciseRow = { id: string; template_id: string; exercise_id: string; position: number };
type TemplateSetRow = { id: string; template_exercise_id: string; position: number; reps: number; weight_kg: number | null };
type SessionRow = { id: string; template_id: string | null; name: string; started_at: string; finished_at: string | null; time_zone: string; status: WorkoutSession['status']; rest_ends_at: string | null; repeated_from_id: string | null; backdated: number };
type SessionExerciseRow = { id: string; session_id: string; exercise_id: string; name: string; position: number };
type SessionSetRow = { id: string; session_exercise_id: string; position: number; planned_reps: number; planned_weight_kg: number | null; actual_reps: number | null; actual_weight_kg: number | null; completed: number; updated_at: string; rir: number | null };

function byParent<T>(rows: readonly T[], parentId: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = parentId(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

async function exercises(connection: SqlConnection): Promise<Exercise[]> {
  return (await connection.all<ExerciseRow>('SELECT * FROM exercises ORDER BY name,id')).map((row) => ({
    id: row.id, name: row.name, aliases: JSON.parse(row.aliases_json) as string[], origin: row.origin,
    archived: row.archived === 1, createdAt: row.created_at, updatedAt: row.updated_at,
    ...(row.note ? { note: row.note } : {}),
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
async function sessions(connection: SqlConnection, id?: string): Promise<WorkoutSession[]> {
  const args = id === undefined ? [] : [id];
  const rows = await connection.all<SessionRow>(`SELECT * FROM sessions ${id === undefined ? 'ORDER BY julianday(started_at) DESC,id DESC' : 'WHERE id=?'}`, args);
  const entries = await connection.all<SessionExerciseRow>(`SELECT * FROM session_exercises ${id === undefined ? '' : 'WHERE session_id=?'} ORDER BY session_id,position`, args);
  const sets = await connection.all<SessionSetRow>(`SELECT * FROM session_sets ${id === undefined ? '' : 'WHERE session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id=?)'} ORDER BY session_exercise_id,position`, args);
  const entriesBySession = byParent(entries, (entry) => entry.session_id);
  const setsByEntry = byParent(sets, (set) => set.session_exercise_id);
  return rows.map((row) => ({
    id: row.id, templateId: row.template_id, name: row.name, startedAt: row.started_at, finishedAt: row.finished_at,
    timeZone: row.time_zone, status: row.status, restEndsAt: row.rest_ends_at,
    ...(row.backdated ? { backdated: true } : {}),
    ...(row.repeated_from_id ? { repeatedFromId: row.repeated_from_id } : {}),
    exercises: (entriesBySession.get(row.id) ?? []).map((entry): SessionExercise => ({
      id: entry.id, exerciseId: entry.exercise_id, name: entry.name,
      sets: (setsByEntry.get(entry.id) ?? []).map((set): PerformedSet => ({
        id: set.id, plannedReps: set.planned_reps, plannedWeightKg: set.planned_weight_kg,
        actualReps: set.actual_reps, actualWeightKg: set.actual_weight_kg, completed: set.completed === 1, updatedAt: set.updated_at,
        rir: set.rir,
      })),
    })),
  }));
}
async function snapshot(connection: SqlConnection): Promise<WorkoutData> {
  const bodyWeights = await connection.all<BodyWeight>('SELECT date, weight_kg AS weightKg FROM body_weights ORDER BY date');
  const [settings] = await connection.all<{ show_rir: number; show_notes: number }>('SELECT show_rir,show_notes FROM workout_settings WHERE id=1');
  return {
    exercises: await exercises(connection), templates: await templates(connection), sessions: await sessions(connection),
    bodyWeights: bodyWeights.map(({ date, weightKg }) => ({ date, weightKg })),
    settings: settings ? { showRir: Boolean(settings.show_rir), showNotes: Boolean(settings.show_notes) } : defaultWorkoutSettings,
  };
}
async function writeExercise(connection: SqlConnection, exercise: Exercise): Promise<void> {
  await connection.run(`INSERT INTO exercises(id,name,aliases_json,origin,archived,created_at,updated_at,note) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,aliases_json=excluded.aliases_json,archived=excluded.archived,updated_at=excluded.updated_at,note=excluded.note`,
  [exercise.id, exercise.name, JSON.stringify(exercise.aliases), exercise.origin, Number(exercise.archived), exercise.createdAt, exercise.updatedAt, exercise.note ?? null]);
}
async function writeBodyWeight(connection: SqlConnection, entry: BodyWeight): Promise<void> {
  await connection.run(`INSERT INTO body_weights(date,weight_kg) VALUES(?,?)
    ON CONFLICT(date) DO UPDATE SET weight_kg=excluded.weight_kg`, [entry.date, entry.weightKg]);
}
async function writeSettings(connection: SqlConnection, settings: WorkoutSettings): Promise<void> {
  await connection.run(`INSERT INTO workout_settings(id,show_rir,show_notes) VALUES(1,?,?)
    ON CONFLICT(id) DO UPDATE SET show_rir=excluded.show_rir,show_notes=excluded.show_notes`, [Number(settings.showRir), Number(settings.showNotes)]);
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
  await connection.run('INSERT INTO sessions(id,template_id,name,started_at,finished_at,time_zone,status,rest_ends_at,backdated,repeated_from_id) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [session.id, session.templateId, session.name, session.startedAt, session.finishedAt, session.timeZone, session.status, session.restEndsAt, Number(!!session.backdated), session.repeatedFromId ?? null]);
  for (const [position, exercise] of session.exercises.entries()) {
    await connection.run('INSERT INTO session_exercises(id,session_id,exercise_id,name,position) VALUES(?,?,?,?,?)', [exercise.id, session.id, exercise.exerciseId, exercise.name, position]);
    for (const [setPosition, set] of exercise.sets.entries()) {
      await connection.run(`INSERT INTO session_sets(id,session_exercise_id,position,planned_reps,planned_weight_kg,actual_reps,actual_weight_kg,completed,updated_at,rir) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [set.id, exercise.id, setPosition, set.plannedReps, set.plannedWeightKg, set.actualReps, set.actualWeightKg, Number(set.completed), set.updatedAt, set.rir ?? null]);
    }
  }
}
async function getRequiredSession(connection: SqlConnection, id: string): Promise<WorkoutSession> {
  const [session] = await sessions(connection, id);
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

type SessionSource = Readonly<{ type: 'template' | 'repeat'; id: string }>;
type SessionPlan = Readonly<{
  templateId: string | null; name: string;
  exercises: readonly Readonly<{ exerciseId: string; name: string; sets: readonly Readonly<{ reps: number; weightKg: number | null }>[] }>[];
}>;

async function loadSessionPlan(connection: SqlConnection, source: SessionSource): Promise<SessionPlan> {
  if (source.type === 'repeat') {
    const original = await getRequiredSession(connection, source.id);
    if (original.status !== 'completed') throw new Error('Повторить можно завершённую тренировку.');
    return {
      templateId: original.templateId, name: original.name,
      exercises: original.exercises.map((entry) => ({
        exerciseId: entry.exerciseId, name: entry.name,
        sets: entry.sets.map((set) => ({ reps: set.plannedReps, weightKg: set.plannedWeightKg })),
      })),
    };
  }
  const template = (await templates(connection)).find((item) => item.id === source.id);
  if (!template) throw new Error('Шаблон не найден.');
  const catalog = new Map((await exercises(connection)).map((item) => [item.id, item.name]));
  return {
    templateId: template.id, name: template.name,
    exercises: template.exercises.map((entry) => {
      const name = catalog.get(entry.exerciseId);
      if (!name) throw new Error('Упражнение отсутствует в справочнике.');
      return { exerciseId: entry.exerciseId, name, sets: entry.sets };
    }),
  };
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
  function startFrom(source: SessionSource, sessionId: string, startedAt: string, timeZone: string, backdated = false) {
    return queued(async () => {
      validateWorkoutId(source.id); validateWorkoutId(sessionId); validateWorkoutTimestamp(startedAt); validateWorkoutTimeZone(timeZone);
      return database.transaction(async (connection) => {
        const [existing] = await sessions(connection, sessionId);
        if (existing) {
          const matches = source.type === 'repeat'
            ? existing.repeatedFromId === source.id
            : existing.repeatedFromId === undefined && existing.templateId === source.id;
          if (!matches) throw new Error('Этот идентификатор запуска относится к другой тренировке.');
          return existing;
        }
        if (!backdated && (await connection.all("SELECT id FROM sessions WHERE status='active' LIMIT 1")).length) {
          throw new Error('Сначала продолжите или завершите текущую тренировку.');
        }
        const plan = await loadSessionPlan(connection, source);
        const session = validateSession({
          ...plan, id: sessionId, startedAt, finishedAt: backdated ? startedAt : null, timeZone,
          status: backdated ? 'completed' : 'active', restEndsAt: null, backdated,
          ...(source.type === 'repeat' ? { repeatedFromId: source.id } : {}),
          exercises: plan.exercises.map((entry, position) => ({
            id: `${sessionId}:exercise:${position}`, exerciseId: entry.exerciseId, name: entry.name,
            sets: entry.sets.map((set, setPosition) => ({
              id: `${sessionId}:set:${position}:${setPosition}`, plannedReps: set.reps, plannedWeightKg: set.weightKg,
              actualReps: null, actualWeightKg: null, completed: false, updatedAt: startedAt,
            })),
          })),
        });
        await ensureIdsAvailable(connection, sessionIds(session));
        await writeSession(connection, session);
        return session;
      });
    });
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
    getSession: (id) => queued(async () => (await sessions(database, validateWorkoutId(id)))[0] ?? null),
    startSession: (templateId, sessionId, startedAt, timeZone, backdated) => startFrom({ type: 'template', id: templateId }, sessionId, startedAt, timeZone, backdated),
    repeatSession: (sourceSessionId, sessionId, startedAt, timeZone, backdated) => startFrom({ type: 'repeat', id: sourceSessionId }, sessionId, startedAt, timeZone, backdated),
    replaceSessionExercise: (sessionId, sessionExerciseId, exerciseId) => queued(async () => {
      validateWorkoutId(sessionId); validateWorkoutId(sessionExerciseId); validateWorkoutId(exerciseId);
      await database.transaction(async (connection) => {
        const session = await getRequiredSession(connection, sessionId);
        if (session.status === 'abandoned') throw new Error('Тренировка отменена.');
        const entry = session.exercises.find((item) => item.id === sessionExerciseId);
        if (!entry) throw new Error('Упражнение не найдено в этой тренировке.');
        if (entry.exerciseId === exerciseId) return;
        const [replacement] = await connection.all<{ name: string }>('SELECT name FROM exercises WHERE id=? AND archived=0', [exerciseId]);
        if (!replacement) throw new Error('Упражнение отсутствует в справочнике.');
        await connection.run('UPDATE session_exercises SET exercise_id=?,name=? WHERE id=?', [exerciseId, replacement.name, entry.id]);
        await connection.run('UPDATE session_sets SET planned_weight_kg=NULL,actual_reps=NULL,actual_weight_kg=NULL,completed=0,rir=NULL WHERE session_exercise_id=?', [entry.id]);
      });
    }),
    updateSet: (sessionId, setId, result: SetResult, now: WorkoutTimestamp, restDeadline?: WorkoutTimestamp) => queued(async () => {
      validateWorkoutId(sessionId); validateWorkoutId(setId); validateWorkoutTimestamp(now);
      const validatedResult = validateSetResult(result);
      await database.transaction(async (connection) => {
        const session = await getRequiredSession(connection, sessionId);
        if (session.status === 'abandoned') throw new Error('Тренировка отменена.');
        const set = session.exercises.flatMap((exercise) => exercise.sets).find((item) => item.id === setId);
        if (!set) throw new Error('Подход не найден в этой тренировке.');
        if (Date.parse(now) < Date.parse(set.updatedAt)) throw new Error('Подход уже содержит более новое изменение.');
        const changed = { ...set, ...validatedResult, updatedAt: now };
        const startRest = restDeadline !== undefined && session.status === 'active' && !session.backdated && !set.completed && changed.completed;
        validateSession({
          ...session, restEndsAt: startRest ? restDeadline : session.restEndsAt,
          exercises: session.exercises.map((exercise) => ({ ...exercise, sets: exercise.sets.map((item) => item.id === setId ? changed : item) })),
        });
        await connection.run('UPDATE session_sets SET actual_reps=?,actual_weight_kg=?,completed=?,updated_at=?,rir=? WHERE id=?',
          [changed.actualReps, changed.actualWeightKg, Number(changed.completed), now, changed.rir ?? null, setId]);
        if (startRest) await connection.run('UPDATE sessions SET rest_ends_at=? WHERE id=?', [restDeadline, sessionId]);
      });
    }),
    saveBodyWeight: (date, weightKg) => queued(() => writeBodyWeight(database, validateBodyWeight({ date, weightKg }))),
    saveSettings: (settings) => queued(() => writeSettings(database, validateWorkoutSettings(settings))),
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
    setRestDeadline: (id, deadline, expectedDeadline) => queued(async () => {
      validateWorkoutId(id);
      if (deadline !== null) validateWorkoutTimestamp(deadline);
      if (expectedDeadline != null) validateWorkoutTimestamp(expectedDeadline);
      return database.transaction(async (connection) => {
        const [session] = await sessions(connection, id);
        if (expectedDeadline !== undefined && (session?.status !== 'active' || session.restEndsAt !== expectedDeadline)) return false;
        if (!session) throw new Error('Тренировка не найдена.');
        requireActive(session);
        validateSession({ ...session, restEndsAt: deadline });
        await connection.run('UPDATE sessions SET rest_ends_at=? WHERE id=?', [deadline, id]);
        return true;
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
          await connection.exec('DELETE FROM sessions; DELETE FROM templates; DELETE FROM exercises; DELETE FROM body_weights; DELETE FROM workout_settings;');
          for (const exercise of replacement.exercises) await writeExercise(connection, exercise);
          for (const template of replacement.templates) await writeTemplate(connection, template);
          for (const session of replacement.sessions) await writeSession(connection, session);
          for (const entry of replacement.bodyWeights ?? []) await writeBodyWeight(connection, entry);
          await writeSettings(connection, replacement.settings ?? defaultWorkoutSettings);
          if ((await connection.all('PRAGMA foreign_key_check')).length !== 0) throw new Error('Восстановление нарушает связи данных.');
        });
      });
    },
  };
}
