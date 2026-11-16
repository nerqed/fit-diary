import { DatabaseSync } from 'node:sqlite';
import type { SqlConnection, SqlDatabase, SqlValue } from '../src/data/sqlite/connection';

/** Executes the production SQL against SQLite, not a mock query matcher. */
export function createSqliteTestDatabase(filename = ':memory:'): SqlDatabase & { close(): void } {
  const sqlite = new DatabaseSync(filename);
  const database: SqlDatabase & { close(): void } = {
    async exec(sql) { sqlite.exec(sql); },
    async run(sql, params: readonly SqlValue[] = []) {
      const result = sqlite.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async all<T>(sql: string, params: readonly SqlValue[] = []) {
      return sqlite.prepare(sql).all(...params) as T[];
    },
    async transaction<T>(work: (connection: SqlConnection) => Promise<T>): Promise<T> {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = await work(database);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    close() { sqlite.close(); },
  };
  return database;
}
