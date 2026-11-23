import { builtinExercises } from '../../data/exercises';
import type { PerformedSet } from './model';

export const progressionRules = {
  incrementKg: 2.5,
  dumbbellIncrementKg: 1,
  minimumRirForIncrease: 2,
  maximumWeightKg: 10_000,
  dumbbellIds: new Set([
    'builtin:squat-goblet', 'builtin:lunge-dumbbell', 'builtin:dumbbell-bench', 'builtin:dumbbell-fly',
    'builtin:dumbbell-row', 'builtin:dumbbell-shoulder', 'builtin:lateral-raise', 'builtin:rear-delt',
    'builtin:dumbbell-curl', 'builtin:hammer-curl',
  ]),
  bodyweightIds: new Set([
    'builtin:crunch', 'builtin:reverse-crunch', 'builtin:hanging-knee', 'builtin:push-up',
    'builtin:pull-up', 'builtin:dip', 'builtin:back-extension',
  ]),
} as const;

const bodyweightNames = new Set(builtinExercises
  .filter((exercise) => progressionRules.bodyweightIds.has(exercise.id))
  .map((exercise) => exercise.name.toLowerCase()));

export function isBodyweightExercise(exerciseId: string, name: string): boolean {
  return progressionRules.bodyweightIds.has(exerciseId) || bodyweightNames.has(name.trim().toLowerCase())
    || /собственн[а-я]* вес|сво[ий]м? вес|без отягощения/i.test(name);
}

/** Use actual loads from the matching sets in the last session. Missing history remains unknown. */
export function suggestWeights(
  exerciseId: string, name: string, previousSets: readonly PerformedSet[], useRir: boolean,
): ReadonlyMap<string, number> {
  const targetsMet = previousSets.every((set) =>
    set.completed && set.actualReps !== null && set.actualReps >= set.plannedReps
    && (!useRir || (set.rir ?? -1) >= progressionRules.minimumRirForIncrease));
  const dumbbells = progressionRules.dumbbellIds.has(exerciseId) || /гантел|dumbbell/i.test(name);
  const step = dumbbells ? progressionRules.dumbbellIncrementKg : progressionRules.incrementKg;
  const bodyweight = isBodyweightExercise(exerciseId, name);
  const suggestions = new Map<string, number>();
  for (const set of previousSets) {
    if (set.actualWeightKg === null) continue;
    const canIncrease = targetsMet && !(bodyweight && set.actualWeightKg === 0);
    const weight = canIncrease ? Math.min(progressionRules.maximumWeightKg, set.actualWeightKg + step) : set.actualWeightKg;
    suggestions.set(set.id, weight);
  }
  return suggestions;
}
