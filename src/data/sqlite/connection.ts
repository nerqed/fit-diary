/** Small async SQL port shared by Expo on iPhone and a real SQLite adapter in tests. */
export type SqlValue = string | number | null;
export interface SqlConnection {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<{ changes: number; lastInsertRowId: number }>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
}
export interface SqlDatabase extends SqlConnection {
  /** Runs on the same connection so foreign_keys remains enabled. */
  transaction<T>(work: (connection: SqlConnection) => Promise<T>): Promise<T>;
}
