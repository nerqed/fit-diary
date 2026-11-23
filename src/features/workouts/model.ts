/** Durable workout data. IDs are stable across edits, retries and JSON restores. */
export type WorkoutTimestamp = string;
export type WorkoutWeekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type Exercise = Readonly<{
  id: string;
  name: string;
  aliases: readonly string[];
  origin: 'builtin' | 'custom';
  archived: boolean;
  note?: string;
  createdAt: WorkoutTimestamp;
  updatedAt: WorkoutTimestamp;
}>;
export type PlannedSet = Readonly<{ id: string; reps: number; weightKg: number | null }>;
export type TemplateExercise = Readonly<{
  id: string; exerciseId: string; sets: readonly PlannedSet[];
}>;
/** Array order is exercise/set order; persistence writes explicit positions. */
export type WorkoutTemplate = Readonly<{
  id: string; name: string; archived?: boolean; weekday: WorkoutWeekday | null;
  exercises: readonly TemplateExercise[];
  createdAt: WorkoutTimestamp; updatedAt: WorkoutTimestamp;
}>;
export type PerformedSet = Readonly<{
  id: string; plannedReps: number; plannedWeightKg: number | null;
  actualReps: number | null; actualWeightKg: number | null;
  /** Editable suggestions copied from an earlier set, tracked independently per field. */
  copiedReps?: boolean; copiedWeight?: boolean;
  /** 3 is the “3+” category. */
  rir?: number | null;
  completed: boolean; updatedAt: WorkoutTimestamp;
}>;
export type SessionExercise = Readonly<{
  id: string; exerciseId: string; name: string; sets: readonly PerformedSet[];
}>;
export type WorkoutSession = Readonly<{
  id: string; templateId: string | null; name: string;
  repeatedFromId?: string;
  backdated?: boolean;
  startedAt: WorkoutTimestamp; finishedAt: WorkoutTimestamp | null; timeZone: string;
  status: 'active' | 'completed' | 'abandoned';
  /** Absolute device-clock deadline; UI timers are not the source of truth. */
  restEndsAt: WorkoutTimestamp | null;
  exercises: readonly SessionExercise[];
}>;
export type BodyWeight = Readonly<{ date: string; weightKg: number }>;
export type WorkoutSettings = Readonly<{ showRir: boolean; showNotes: boolean }>;
export const defaultWorkoutSettings: WorkoutSettings = Object.freeze({ showRir: false, showNotes: false });
export type WorkoutData = Readonly<{
  exercises: readonly Exercise[];
  templates: readonly WorkoutTemplate[];
  sessions: readonly WorkoutSession[];
  bodyWeights?: readonly BodyWeight[];
  settings?: WorkoutSettings;
}>;
export type SetResult = Readonly<{
  editedFields?: Readonly<{ reps?: boolean; weight?: boolean }>;
  actualReps: number | null; actualWeightKg: number | null; completed: boolean;
  rir?: number | null;
}>;

export interface WorkoutRepository {
  initialize(): Promise<void>;
  listExercises(includeArchived?: boolean): Promise<readonly Exercise[]>;
  saveExercise(exercise: Exercise): Promise<void>;
  listTemplates(): Promise<readonly WorkoutTemplate[]>;
  getTemplate(id: string): Promise<WorkoutTemplate | null>;
  saveTemplate(template: WorkoutTemplate): Promise<void>;
  copyTemplate(id: string, newId: string, now: WorkoutTimestamp): Promise<WorkoutTemplate>;
  deleteTemplate(id: string): Promise<void>;
  listSessions(): Promise<readonly WorkoutSession[]>;
  getSession(id: string): Promise<WorkoutSession | null>;
  deleteSession(id: string): Promise<void>;
  /** Reuse the current workout or a completed snapshot of this template on the selected day. */
  startSession(templateId: string, sessionId: string, startedAt: WorkoutTimestamp, timeZone: string, backdated?: boolean): Promise<WorkoutSession>;
  repeatSession(sourceSessionId: string, sessionId: string, startedAt: WorkoutTimestamp, timeZone: string, backdated?: boolean): Promise<WorkoutSession>;
  replaceSessionExercise(sessionId: string, sessionExerciseId: string, exerciseId: string): Promise<void>;
  updateSet(sessionId: string, setId: string, result: SetResult, now: WorkoutTimestamp, restDeadline?: WorkoutTimestamp): Promise<void>;
  finishSession(id: string, status: 'completed' | 'abandoned', finishedAt: WorkoutTimestamp): Promise<void>;
  /** When expectedDeadline is supplied, change only that active timer. */
  setRestDeadline(id: string, deadline: WorkoutTimestamp | null, expectedDeadline?: WorkoutTimestamp | null): Promise<boolean>;
  saveBodyWeight(date: string, weightKg: number): Promise<void>;
  saveSettings(settings: WorkoutSettings): Promise<void>;
  exportData(): Promise<WorkoutData>;
  /** Serialized snapshot → durable backup → atomic replace. A backup failure aborts import. */
  replaceAll(data: WorkoutData, beforeReplace: (current: WorkoutData) => Promise<void>): Promise<void>;
}
