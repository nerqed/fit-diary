/** View contracts: screens render these values without reading storage or services. */
export type DemoRecord<T> = Readonly<T & { isDemo: true }>;

export type MealPreview = DemoRecord<{
  id: string;
  name: string;
  time: string;
  foods: readonly string[];
}>;

export type WorkoutPreview = DemoRecord<{
  id: string;
  name: string;
  exercises: readonly string[];
}>;

export type ProgressPreview = DemoRecord<{
  id: string;
  name: string;
  description: string;
}>;

export type TodayScreenProps = Readonly<{
  meals: readonly MealPreview[];
  workout: WorkoutPreview;
  onOpenDiary: () => void;
  onOpenWorkouts: () => void;
}>;

export type DiaryScreenProps = Readonly<{
  dateLabel: string;
  meals: readonly MealPreview[];
}>;

export type WorkoutsScreenProps = Readonly<{
  workouts: readonly WorkoutPreview[];
}>;

export type ProgressScreenProps = Readonly<{
  metrics: readonly ProgressPreview[];
}>;

export type AssistantScreenProps = Readonly<{
  connectionState: 'not-configured';
}>;

export type ProfileScreenProps = Readonly<{
  fields: readonly Readonly<{ key: string; label: string; value: null }>[];
}>;
