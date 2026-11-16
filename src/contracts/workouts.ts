import type { BackupFile, BackupPreview } from '../features/backup/core';
import type { BestWeightPoint, ExerciseHistoryRow, ExerciseRecords } from '../features/workouts/analytics';
import type { SessionView, WorkoutState } from '../features/workouts/controller';
import type { Exercise, SetResult, WorkoutSession, WorkoutTemplate } from '../features/workouts/model';

/** Designer handoff for real MVP-1 screens. Existing demo contracts remain intact. */
export type WorkoutLibraryScreenProps = Readonly<{
  state: WorkoutState;
  exercises: readonly Exercise[];
  templates: readonly WorkoutTemplate[];
  activeSession: WorkoutSession | null;
  onCreateTemplate: () => void;
  onEditTemplate: (id: string) => void;
  onDeleteTemplate: (id: string) => Promise<void>;
  /** copyId/sessionId is allocated once for a UI intent and reused when retrying. */
  onCopyTemplate: (id: string, copyId: string) => Promise<WorkoutTemplate>;
  onStartSession: (templateId: string, sessionId: string) => Promise<WorkoutSession>;
  onResumeSession: (id: string) => void;
  onOpenExerciseHistory: (exerciseId: string) => void;
  onOpenBackups: () => void;
}>;
export type WorkoutTemplateEditorScreenProps = Readonly<{
  draft: WorkoutTemplate;
  exercises: readonly Exercise[];
  pending: boolean; error: string | null;
  onChangeDraft: (draft: WorkoutTemplate) => void;
  onSave: (draft: WorkoutTemplate) => Promise<void>;
  onSaveExercise: (exercise: Exercise) => Promise<void>;
  onCancel: () => void;
}>;
export type WorkoutSessionScreenProps = Readonly<{
  view: SessionView;
  pending: boolean; error: string | null;
  onChangeSet: (setId: string, result: SetResult) => Promise<void>;
  onStartRest: (seconds: number) => Promise<void>;
  onStopRest: () => Promise<void>;
  onFinish: () => Promise<void>;
  onAbandon: () => Promise<void>;
  onClose: () => void;
}>;
export type ExerciseHistoryScreenProps = Readonly<{
  exercise: Exercise;
  fixedReps: number;
  history: readonly ExerciseHistoryRow[];
  bestWeights: readonly BestWeightPoint[];
  /** A volume chart uses history[].volume, preserving missing/partial values as gaps. */
  records: ExerciseRecords;
  onChangeFixedReps: (reps: number) => void;
}>;
export type WorkoutBackupScreenProps = Readonly<{
  files: readonly BackupFile[];
  selected: BackupPreview | null;
  pending: boolean; error: string | null;
  onExport: () => Promise<void>;
  onSelectImport: () => Promise<void>;
  /** Show replacement confirmation before invoking; selection alone never restores data. */
  onConfirmImport: () => Promise<void>;
  onCancelImport: () => void;
  onShareFile: (file: BackupFile) => Promise<void>;
}>;
