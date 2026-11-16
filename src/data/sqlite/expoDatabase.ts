import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { WorkoutRepository } from '../../features/workouts/model';
import type { SqlConnection, SqlDatabase, SqlValue } from './connection';
import { createWorkoutRepository } from './workoutRepository';

function adapt(database: SQLiteDatabase): SqlDatabase {
  const connection: SqlDatabase = {
    exec: (sql) => database.execAsync(sql),
    run: async (sql, params = []) => {
      const result = await database.runAsync(sql, [...params]);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },
    all: <T>(sql: string, params: readonly SqlValue[] = []) => database.getAllAsync<T>(sql, [...params]),
    transaction: async <T>(work: (connection: SqlConnection) => Promise<T>) => {
      let result!: T;
      await database.withTransactionAsync(async () => { result = await work(connection); });
      return result;
    },
  };
  return connection;
}

let opening: Promise<WorkoutRepository> | null = null;

/** Lazy singleton: the designer's integration opts in; existing demo screens are unchanged.
 * Only the serialized repository receives this connection. Do not run queries outside it.
 */
export function openWorkoutRepository(): Promise<WorkoutRepository> {
  if (!opening) {
    opening = (async () => {
      const database = await openDatabaseAsync('forma-workouts.sqlite');
      try {
        const repository = createWorkoutRepository(adapt(database));
        await repository.initialize();
        return repository;
      } catch (error) {
        await database.closeAsync();
        throw error;
      }
    })().catch((error: unknown) => { opening = null; throw error; });
  }
  return opening;
}
