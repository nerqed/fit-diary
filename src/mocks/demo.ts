import type {
  MealPreview,
  ProfileScreenProps,
  ProgressPreview,
  WorkoutPreview,
} from '../contracts/screens';

/** Fixtures are UI examples only. They must never be imported into a real diary. */
export const demoMeals: readonly MealPreview[] = [
  {
    id: 'demo-meal-breakfast',
    isDemo: true,
    name: 'Завтрак',
    time: '07:00',
    foods: ['Овсяная каша', 'Яблоко'],
  },
];

export const demoWorkout: WorkoutPreview = {
  id: 'demo-workout',
  isDemo: true,
  name: 'Пример тренировки',
  exercises: ['Приседание — пример упражнения', 'Тяга — пример упражнения'],
};

export const demoProgress: readonly ProgressPreview[] = [
  {
    id: 'demo-weight',
    isDemo: true,
    name: 'Вес и замеры',
    description: 'Место для будущей истории измерений.',
  },
  {
    id: 'demo-training',
    isDemo: true,
    name: 'Результаты упражнений',
    description: 'Место для будущего сравнения тренировок.',
  },
];

export const emptyProfileFields: ProfileScreenProps['fields'] = [
  { key: 'goal', label: 'Цель', value: null },
  { key: 'measurements', label: 'Параметры тела', value: null },
  { key: 'experience', label: 'Тренировочный опыт', value: null },
  { key: 'equipment', label: 'Оборудование', value: null },
  { key: 'schedule', label: 'Расписание', value: null },
  { key: 'preferences', label: 'Пищевые предпочтения и ограничения', value: null },
];
