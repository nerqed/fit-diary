/** View contracts only: screens receive data/actions and never read storage or services. */
export type { WorkoutLibraryScreenProps, WorkoutTemplateEditorScreenProps, WorkoutSessionScreenProps, ExerciseHistoryScreenProps, WorkoutBackupScreenProps } from './workouts';
export type { MealEditorScreenProps, MealEditorItem, FoodCatalogEntry, RecognizedFood, FoodRecognitionAdapter, PhotoRecognitionJob } from './mealEditor';
export type DemoRecord<T> = Readonly<T & { isDemo: true }>;
/** ISO 8601 instant with offset (or Z). New records use the device clock. */
export type Timestamp = string;
/** Calendar day in the record's time zone, YYYY-MM-DD. */
export type LocalDate = string;
export type Goal = 'gain' | 'cut' | 'maintain';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type MealAddMethod = 'photo' | 'text' | 'label' | 'manual';
export type NutritionSource = 'label' | 'off' | 'reference' | 'recipe' | 'ai' | 'store';

export type NutrientKey =
  | 'energy' | 'protein' | 'fat' | 'carbohydrate' | 'fiber' | 'sugar'
  | 'salt' | 'sodium' | 'water'
  | 'vitaminA' | 'vitaminB1' | 'vitaminB2' | 'vitaminB3' | 'vitaminB6'
  | 'vitaminB9' | 'vitaminB12' | 'vitaminC' | 'vitaminD' | 'vitaminE' | 'vitaminK'
  | 'calcium' | 'magnesium' | 'phosphorus' | 'potassium' | 'iron' | 'zinc' | 'selenium' | 'iodine';
export type NutrientUnit = 'kcal' | 'g' | 'mg' | 'µg';
export type NutrientSourceRef = Readonly<{
  kind: NutritionSource;
  referenceId: string;
  /** Human-readable origin; a fixture is never an actual label/database lookup. */
  label: string;
}>;
export type NutrientCoverage = Readonly<{
  knownItems: number;
  totalItems: number;
  state: 'complete' | 'partial' | 'missing';
}>;
export type NutrientValue = Readonly<{
  key: NutrientKey;
  label: string;
  unit: NutrientUnit;
  /** Null means no complete value. Zero is a measured/declared zero, never a substitute. */
  amount: number | null;
  /** Nullable, user-confirmed target; demo targets are illustrative, not recommendations. */
  target: number | null;
  /** Explicit subtotal when coverage is partial; must not be presented as a complete amount. */
  knownAmount: number | null;
  coverage: NutrientCoverage;
  sources: readonly NutrientSourceRef[];
  approximate: boolean;
}>;
export type PrimaryNutrientKey = 'energy' | 'protein' | 'fat' | 'carbohydrate' | 'fiber';
export type NutritionSummary = Readonly<Record<PrimaryNutrientKey, NutrientValue>>;
export type NutrientDataCoverage = Readonly<{
  totalNutrients: number;
  /** Nutrients with values for every recorded dish, not percentage of dietary needs. */
  completeNutrients: number;
  partialNutrients: number;
  missingNutrients: number;
}>;
export type DayNutrition = Readonly<{
  summary: NutritionSummary;
  nutrients: readonly NutrientValue[];
  dataCoverage: NutrientDataCoverage;
}>;

export type MealDish = Readonly<{
  id: string;
  name: string;
  grams: number;
  massSource: 'weighed' | 'label' | 'manual' | 'ai';
  barcode: string | null;
  source: NutritionSource;
  approximate: boolean;
  /** All amounts below describe this portion, not 100 g. */
  nutritionBasis: 'portion';
  nutrition: NutritionSummary;
  nutrients: readonly NutrientValue[];
}>;
export type MealPreview = Readonly<{
  id: string;
  isDemo: boolean;
  timestamp: Timestamp;
  timeZone: string;
  localDate: LocalDate;
  type: MealType;
  suggestedType: MealType;
  addMethod: MealAddMethod;
  photoUri: string | null;
  dishes: readonly MealDish[];
  nutrition: NutritionSummary;
  nutrients: readonly NutrientValue[];
  approximate: boolean;
  /** Compatibility display aliases, derived from type/timestamp/dishes by the data layer. */
  name: string;
  time: string;
  foods: readonly string[];
}>;

export type WorkoutSet = Readonly<{
  id: string;
  plannedReps: number;
  actualReps: number | null;
  weightKg: number | null;
  completed: boolean;
}>;
export type WorkoutExercise = Readonly<{
  id: string;
  name: string;
  sets: readonly WorkoutSet[];
}>;
export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type WorkoutPreview = Readonly<{
  id: string;
  isDemo: boolean;
  date: LocalDate;
  weekday: Weekday;
  weekdayLabel: string;
  name: string;
  exercises: readonly WorkoutExercise[];
  restTimerSeconds: number;
  restTimerRunning: boolean;
}>;

export type WeightPoint = Readonly<{ date: LocalDate; weightKg: number }>;
export type ExerciseBestPoint = Readonly<{ date: LocalDate; weightKg: number; reps: number }>;
export type ExerciseBestSeries = Readonly<{
  exerciseId: string;
  exerciseName: string;
  /** Compare best completed weight only at the same repetition count. Not an estimated 1RM. */
  metric: 'max-weight-at-reps';
  fixedReps: number;
  unit: 'kg';
  points: readonly ExerciseBestPoint[];
}>;
export type ProgressPreview = DemoRecord<{ id: string; name: string; description: string }>;

export type AssistantConnectionState = 'not-configured' | 'offline' | 'ready' | 'thinking';
export type AssistantMessage = Readonly<{
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  time: Timestamp;
}>;
export type AssistantViewData = Readonly<{
  isDemo: boolean;
  connectionState: AssistantConnectionState;
  messages: readonly AssistantMessage[];
}>;

export type ProfileFieldBase = Readonly<{ key: string; label: string }>;
export type NumberProfileField = ProfileFieldBase & Readonly<{
  type: 'number'; value: number | null; unit: string | null;
}>;
export type SelectProfileField = ProfileFieldBase & Readonly<{
  type: 'select'; value: string | null;
  options: readonly Readonly<{ value: string; label: string }>[];
}>;
export type TextProfileField = ProfileFieldBase & Readonly<{ type: 'text'; value: string | null }>;
export type ProfileField = NumberProfileField | SelectProfileField | TextProfileField;
export type ProfileFieldChange =
  | Readonly<{ key: string; type: 'number'; value: number | null }>
  | Readonly<{ key: string; type: 'select' | 'text'; value: string | null }>;
export type NormCalculationParameters = Readonly<{
  method: 'mifflin-st-jeor';
  ageYears: number | null;
  heightCm: number | null;
  weightKg: number | null;
  sexForFormula: 'female' | 'male' | null;
  activityMultiplier: number | null;
  /** Signed percentage: positive = surplus, negative = deficit, zero = maintenance. */
  energyAdjustmentPercent: number | null;
  proteinGramsPerKg: number | null;
}>;
export type ProfileViewData = Readonly<{
  isDemo: boolean;
  fields: readonly ProfileField[];
  goal: Goal | null;
  calculation: NormCalculationParameters;
  /** Visible form controls derived from calculation, not a second source of truth. */
  calculationFields: readonly ProfileField[];
  calculatedBmrKcal: number | null;
  calculatedDailyKcal: number | null;
}>;

export type MealActions = Readonly<{
  onAddMeal: (method: MealAddMethod) => void;
  onOpenMeal: (mealId: string) => void;
  onChangeMealType: (mealId: string, type: MealType) => void;
  onChangeMealTimestamp: (mealId: string, timestamp: Timestamp, timeZone: string) => void;
  onChangeDishGrams: (mealId: string, dishId: string, grams: number) => void;
  onDeleteMeal: (mealId: string) => void;
}>;
export type TodayScreenProps = Readonly<{
  isDemo: boolean;
  date: LocalDate;
  goal: Goal | null;
  dayNutrition: DayNutrition;
  meals: readonly MealPreview[];
  workout: WorkoutPreview;
  onOpenDiary: () => void;
  onOpenWorkouts: () => void;
}> & MealActions;
export type DiaryScreenProps = Readonly<{
  isDemo: boolean;
  date: LocalDate;
  dateLabel: string;
  meals: readonly MealPreview[];
  dayNutrition: DayNutrition;
  onSelectDate: (date: LocalDate) => void;
}> & MealActions;
export type WorkoutsScreenProps = Readonly<{
  isDemo: boolean;
  workouts: readonly WorkoutPreview[];
  onChangeSet: (workoutId: string, exerciseId: string, setId: string, change: Readonly<{
    actualReps: number | null; weightKg: number | null; completed: boolean;
  }>) => void;
  onReplaceExercise: (workoutId: string, exerciseId: string) => void;
  onStartRest: (workoutId: string, seconds: number) => void;
  onStopRest: (workoutId: string) => void;
}>;
export type ProgressScreenProps = Readonly<{
  isDemo: boolean;
  metrics: readonly ProgressPreview[];
  weightHistory: readonly WeightPoint[];
  exerciseBests: readonly ExerciseBestSeries[];
  onAddWeight: (date: LocalDate, weightKg: number) => void;
}>;
export type AssistantScreenProps = AssistantViewData & Readonly<{
  onSendMessage: (text: string) => void;
  onOpenSettings: () => void;
  onRetry: () => void;
}>;
export type ProfileScreenProps = ProfileViewData & Readonly<{
  onChangeField: (change: ProfileFieldChange) => void;
  onChangeGoal: (goal: Goal | null) => void;
  onChangeCalculation: (change: Partial<NormCalculationParameters>) => void;
  onSave: () => void;
}>;
