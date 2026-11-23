import type { SqlDatabase } from './connection';
import { builtinExercises } from '../exercises';

export const WORKOUT_SCHEMA_VERSION = 2;

const migrations = [
  `CREATE TABLE exercises (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    aliases_json TEXT NOT NULL, origin TEXT NOT NULL CHECK(origin IN ('builtin','custom')),
    archived INTEGER NOT NULL CHECK(archived IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE templates (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    weekday TEXT CHECK(weekday IS NULL OR weekday IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE template_exercises (
    id TEXT PRIMARY KEY NOT NULL, template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL CHECK(position >= 0), UNIQUE(template_id,position)
  );
  CREATE TABLE template_sets (
    id TEXT PRIMARY KEY NOT NULL, template_exercise_id TEXT NOT NULL REFERENCES template_exercises(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position >= 0), reps INTEGER NOT NULL CHECK(reps > 0 AND reps <= 10000 AND typeof(reps) = 'integer'),
    weight_kg REAL CHECK(weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 10000)),
    UNIQUE(template_exercise_id,position)
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL, template_id TEXT REFERENCES templates(id) ON DELETE SET NULL,
    name TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, time_zone TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active','completed','abandoned')), rest_ends_at TEXT,
    CHECK((status = 'active' AND finished_at IS NULL) OR (status != 'active' AND finished_at IS NOT NULL)),
    CHECK(status = 'active' OR rest_ends_at IS NULL)
  );
  CREATE UNIQUE INDEX one_active_session ON sessions(status) WHERE status = 'active';
  CREATE TABLE session_exercises (
    id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT, name TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position >= 0), UNIQUE(session_id,position)
  );
  CREATE INDEX session_exercise_history ON session_exercises(exercise_id,session_id);
  CREATE TABLE session_sets (
    id TEXT PRIMARY KEY NOT NULL, session_exercise_id TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position >= 0), planned_reps INTEGER NOT NULL CHECK(planned_reps > 0 AND planned_reps <= 10000 AND typeof(planned_reps) = 'integer'),
    planned_weight_kg REAL CHECK(planned_weight_kg IS NULL OR (planned_weight_kg >= 0 AND planned_weight_kg <= 10000)),
    actual_reps INTEGER CHECK(actual_reps IS NULL OR (actual_reps >= 0 AND actual_reps <= 10000 AND typeof(actual_reps) = 'integer')),
    actual_weight_kg REAL CHECK(actual_weight_kg IS NULL OR (actual_weight_kg >= 0 AND actual_weight_kg <= 10000)),
    completed INTEGER NOT NULL CHECK(completed IN (0,1)), updated_at TEXT NOT NULL,
    CHECK(completed = 0 OR (actual_reps IS NOT NULL AND actual_reps > 0)), UNIQUE(session_exercise_id,position)
  );`,
  `ALTER TABLE exercises ADD COLUMN note TEXT;
  ALTER TABLE session_sets ADD COLUMN rir INTEGER CHECK(rir IS NULL OR (typeof(rir)='integer' AND rir BETWEEN 0 AND 3));
  ALTER TABLE sessions ADD COLUMN backdated INTEGER NOT NULL DEFAULT 0 CHECK(backdated IN (0,1));
  ALTER TABLE sessions ADD COLUMN repeated_from_id TEXT REFERENCES sessions(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  CREATE TABLE body_weights (
    date TEXT PRIMARY KEY NOT NULL, weight_kg REAL NOT NULL CHECK(weight_kg > 0 AND weight_kg <= 10000)
  );
  CREATE TABLE workout_settings (
    id INTEGER PRIMARY KEY CHECK(id=1),
    show_rir INTEGER NOT NULL CHECK(show_rir IN (0,1)),
    show_notes INTEGER NOT NULL CHECK(show_notes IN (0,1))
  );`,
] as const;

export async function migrateWorkoutDatabase(database: SqlDatabase): Promise<void> {
  await database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const rows = await database.all<{ user_version: number }>('PRAGMA user_version');
  const version = rows[0]?.user_version;
  if (version === undefined || !Number.isInteger(version) || version < 0 || version > WORKOUT_SCHEMA_VERSION) {
    throw new Error('Версия базы не поддерживается. Обновите приложение; данные не изменены.');
  }
  for (let next = version + 1; next <= WORKOUT_SCHEMA_VERSION; next++) {
    const sql = migrations[next - 1];
    if (!sql) throw new Error('Отсутствует миграция базы.');
    await database.transaction(async (connection) => {
      await connection.exec(sql);
      // Seed only the initial migration; restoring a snapshot must not re-add deleted rows.
      if (next === 1) {
        for (const exercise of builtinExercises) {
          await connection.run('INSERT INTO exercises(id,name,aliases_json,origin,archived,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
            [exercise.id, exercise.name, JSON.stringify(exercise.aliases), exercise.origin, 0, exercise.createdAt, exercise.updatedAt]);
        }
      }
      await connection.exec(`PRAGMA user_version = ${next}`);
    });
  }
}
