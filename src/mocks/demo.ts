import type {
  AssistantConnectionState, AssistantViewData, DayNutrition, DemoRecord, ExerciseBestSeries,
  MealAddMethod, MealDish, MealPreview, MealType, NormCalculationParameters, NutrientKey,
  NutrientSourceRef, NutrientUnit, NutrientValue, NutritionSource, NutritionSummary,
  PrimaryNutrientKey, ProfileField, ProfileViewData, ProgressPreview, WeightPoint, WorkoutPreview,
} from '../contracts/screens';

/** UI fixtures only: numbers, identities and sources below are invented examples, never user data.
 * These helpers compose fixtures; they are not the future production nutrition/calculation engine.
 * No network, device-clock reads, storage, medical recommendations or real database lookups here.
 */
export const demoDate = '2026-11-16';
export const demoTimeZone = 'Asia/Yekaterinburg';

const nutrientCatalog: readonly Readonly<{ key: NutrientKey; label: string; unit: NutrientUnit }>[] = [
  { key: 'energy', label: 'Энергия', unit: 'kcal' },
  { key: 'protein', label: 'Белки', unit: 'g' },
  { key: 'fat', label: 'Жиры', unit: 'g' },
  { key: 'carbohydrate', label: 'Углеводы', unit: 'g' },
  { key: 'fiber', label: 'Клетчатка', unit: 'g' },
  { key: 'sugar', label: 'Сахар', unit: 'g' },
  // Salt and sodium remain separate: the fixture never silently converts or adds them together.
  { key: 'salt', label: 'Соль', unit: 'g' },
  { key: 'sodium', label: 'Натрий', unit: 'mg' },
  { key: 'water', label: 'Вода в продуктах', unit: 'g' },
  { key: 'vitaminA', label: 'Витамин A', unit: 'µg' },
  { key: 'vitaminB1', label: 'Витамин B1', unit: 'mg' },
  { key: 'vitaminB2', label: 'Витамин B2', unit: 'mg' },
  { key: 'vitaminB3', label: 'Витамин B3', unit: 'mg' },
  { key: 'vitaminB6', label: 'Витамин B6', unit: 'mg' },
  { key: 'vitaminB9', label: 'Витамин B9', unit: 'µg' },
  { key: 'vitaminB12', label: 'Витамин B12', unit: 'µg' },
  { key: 'vitaminC', label: 'Витамин C', unit: 'mg' },
  { key: 'vitaminD', label: 'Витамин D', unit: 'µg' },
  { key: 'vitaminE', label: 'Витамин E', unit: 'mg' },
  { key: 'vitaminK', label: 'Витамин K', unit: 'µg' },
  { key: 'calcium', label: 'Кальций', unit: 'mg' },
  { key: 'magnesium', label: 'Магний', unit: 'mg' },
  { key: 'phosphorus', label: 'Фосфор', unit: 'mg' },
  { key: 'potassium', label: 'Калий', unit: 'mg' },
  { key: 'iron', label: 'Железо', unit: 'mg' },
  { key: 'zinc', label: 'Цинк', unit: 'mg' },
  { key: 'selenium', label: 'Селен', unit: 'µg' },
  { key: 'iodine', label: 'Йод', unit: 'µg' },
];

/** Illustration of filled target controls, not a norm calculated for this user. */
const demoTargets: Partial<Record<NutrientKey, number>> = {
  energy: 2400, protein: 140, fat: 80, carbohydrate: 280, fiber: 30,
};

function primary(rows: readonly NutrientValue[], key: PrimaryNutrientKey): NutrientValue {
  const row = rows.find((value) => value.key === key);
  if (!row) throw new Error(`Missing fixture nutrient: ${key}`);
  return row;
}

function summary(rows: readonly NutrientValue[]): NutritionSummary {
  return {
    energy: primary(rows, 'energy'), protein: primary(rows, 'protein'),
    fat: primary(rows, 'fat'), carbohydrate: primary(rows, 'carbohydrate'), fiber: primary(rows, 'fiber'),
  };
}

function dish(input: Readonly<{
  id: string; name: string; grams: number; source: NutritionSource;
  massSource: MealDish['massSource']; approximate?: boolean; barcode?: string;
  amounts: Partial<Record<NutrientKey, number | null>>;
}>): MealDish {
  const source: NutrientSourceRef = {
    kind: input.source, referenceId: input.id, label: `Демо-источник: ${input.source}; не реальные сведения о продукте`,
  };
  const nutrients = nutrientCatalog.map<NutrientValue>((meta) => {
    const amount = input.amounts[meta.key] ?? null;
    return {
      ...meta, amount, target: null, knownAmount: amount,
      coverage: { knownItems: amount === null ? 0 : 1, totalItems: 1, state: amount === null ? 'missing' : 'complete' },
      sources: amount === null ? [] : [source], approximate: amount !== null && (input.approximate ?? false),
    };
  });
  return {
    id: input.id, name: input.name, grams: input.grams, massSource: input.massSource,
    barcode: input.barcode ?? null, source: input.source, approximate: input.approximate ?? false,
    nutritionBasis: 'portion', nutrition: summary(nutrients), nutrients,
  };
}

/** Sum only known values; the complete amount stays null whenever any dish lacks a value. */
function aggregate(dishes: readonly MealDish[], withTargets = false): readonly NutrientValue[] {
  return nutrientCatalog.map<NutrientValue>((meta) => {
    const known = dishes.flatMap((item) => item.nutrients.filter((row) => row.key === meta.key && row.amount !== null));
    const knownItems = known.length;
    const complete = dishes.length > 0 && knownItems === dishes.length;
    const knownAmount = knownItems === 0 ? null : Math.round(known.reduce((sum, row) => sum + (row.amount as number), 0) * 1000) / 1000;
    const sources = [...new Map(known.flatMap((row) => row.sources).map((source) => [`${source.kind}:${source.referenceId}`, source])).values()];
    return {
      ...meta, amount: complete ? knownAmount : null, knownAmount,
      target: withTargets ? demoTargets[meta.key] ?? null : null,
      coverage: { knownItems, totalItems: dishes.length, state: complete ? 'complete' : knownItems > 0 ? 'partial' : 'missing' },
      sources, approximate: known.some((row) => row.approximate),
    };
  });
}

const mealLabels: Readonly<Record<MealType, string>> = {
  breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус',
};

/** Demo time suggestion: 05–10 breakfast, 11–15 lunch, 16–21 dinner, otherwise snack.
 * Only a suggestion; user choice always wins. Real creation uses device-local time in stage 2.
 */
function suggestedMealType(localHour: number): MealType {
  if (localHour >= 5 && localHour < 11) return 'breakfast';
  if (localHour >= 11 && localHour < 16) return 'lunch';
  if (localHour >= 16 && localHour < 22) return 'dinner';
  return 'snack';
}

function meal(input: Readonly<{
  id: string; time: string; type?: MealType; addMethod: MealAddMethod;
  dishes: readonly MealDish[]; photoUri?: string;
}>): DemoRecord<MealPreview> {
  const suggestedType = suggestedMealType(Number(input.time.slice(0, 2)));
  const type = input.type ?? suggestedType;
  const nutrients = aggregate(input.dishes);
  return {
    id: input.id, isDemo: true, timestamp: `${demoDate}T${input.time}:00+05:00`,
    timeZone: demoTimeZone, localDate: demoDate, type, suggestedType,
    addMethod: input.addMethod, photoUri: input.photoUri ?? null, dishes: input.dishes,
    nutrition: summary(nutrients), nutrients, approximate: input.dishes.some((item) => item.approximate),
    name: mealLabels[type], time: input.time, foods: input.dishes.map((item) => item.name),
  };
}

/** Embedded 1×1 placeholder only, not an actual meal photo; no external request is needed. */
const demoPhotoUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

export const demoMeals: readonly DemoRecord<MealPreview>[] = [
  meal({
    id: 'demo-meal-breakfast', time: '07:00', addMethod: 'manual',
    dishes: [
      dish({ id: 'demo-oats', name: 'Овсяная каша — пример', grams: 200, source: 'reference', massSource: 'weighed',
        amounts: { energy: 220, protein: 7, fat: 4, carbohydrate: 39, fiber: 4, sugar: 1, sodium: 4, water: 145, magnesium: 60, iron: 2, vitaminB1: 0.15 } }),
      dish({ id: 'demo-yogurt', name: 'Йогурт — пример этикетки', grams: 150, source: 'label', massSource: 'label', barcode: '2000000000015',
        amounts: { energy: 105, protein: 6, fat: 4.5, carbohydrate: 10, fiber: 0, sugar: 10, salt: 0.15, calcium: 180 } }),
    ],
  }),
  meal({
    id: 'demo-meal-lunch', time: '13:10', addMethod: 'photo', photoUri: demoPhotoUri,
    dishes: [dish({ id: 'demo-photo-lunch', name: 'Гречка с курицей — пример оценки', grams: 350, source: 'ai', massSource: 'ai', approximate: true,
      amounts: { energy: 510, protein: 42, fat: 14, carbohydrate: 54, fiber: null, sugar: null } })],
  }),
  meal({
    id: 'demo-meal-snack', time: '16:30', type: 'snack', addMethod: 'label', photoUri: demoPhotoUri,
    dishes: [
      dish({ id: 'demo-curd', name: 'Творог — пример карточки OFF', grams: 200, source: 'off', massSource: 'weighed', barcode: '2000000000022',
        amounts: { energy: 240, protein: 32, fat: 10, carbohydrate: 6, fiber: 0, sugar: 6 } }),
      dish({ id: 'demo-juice', name: 'Сок — пример карточки магазина', grams: 200, source: 'store', massSource: 'manual', barcode: '2000000000039',
        amounts: { energy: 90, protein: 0, fat: 0, carbohydrate: 22, fiber: 0, sugar: 20, vitaminC: 12 } }),
    ],
  }),
  meal({
    id: 'demo-meal-dinner', time: '19:15', addMethod: 'text',
    dishes: [dish({ id: 'demo-stew', name: 'Овощное рагу — пример рецепта', grams: 300, source: 'recipe', massSource: 'weighed',
      amounts: { energy: 270, protein: 8, fat: 10, carbohydrate: 37, fiber: 8, sugar: 9, water: 220, potassium: 620, vitaminC: 24 } })],
  }),
];

const dayNutrients = aggregate(demoMeals.flatMap((item) => item.dishes), true);
export const demoDayNutrition: DayNutrition = {
  summary: summary(dayNutrients), nutrients: dayNutrients,
  dataCoverage: {
    totalNutrients: dayNutrients.length,
    completeNutrients: dayNutrients.filter((row) => row.coverage.state === 'complete').length,
    partialNutrients: dayNutrients.filter((row) => row.coverage.state === 'partial').length,
    missingNutrients: dayNutrients.filter((row) => row.coverage.state === 'missing').length,
  },
};

export const demoWorkout: DemoRecord<WorkoutPreview> = {
  id: 'demo-workout', isDemo: true, date: demoDate, weekday: 'monday', weekdayLabel: 'Понедельник',
  name: 'Пример: всё тело', restTimerSeconds: 90, restTimerRunning: false,
  exercises: [
    { id: 'demo-squat', name: 'Приседание', sets: [
      { id: 'demo-squat-1', plannedReps: 8, actualReps: 8, weightKg: 40, completed: true },
      { id: 'demo-squat-2', plannedReps: 8, actualReps: 7, weightKg: 40, completed: true },
      { id: 'demo-squat-3', plannedReps: 8, actualReps: null, weightKg: 40, completed: false },
    ] },
    { id: 'demo-bench', name: 'Жим лёжа', sets: [
      { id: 'demo-bench-1', plannedReps: 10, actualReps: 10, weightKg: 30, completed: true },
      { id: 'demo-bench-2', plannedReps: 10, actualReps: null, weightKg: null, completed: false },
    ] },
    { id: 'demo-row', name: 'Тяга горизонтального блока', sets: [
      { id: 'demo-row-1', plannedReps: 12, actualReps: null, weightKg: null, completed: false },
      { id: 'demo-row-2', plannedReps: 12, actualReps: null, weightKg: null, completed: false },
    ] },
    { id: 'demo-press', name: 'Жим гантелей сидя', sets: [
      { id: 'demo-press-1', plannedReps: 10, actualReps: null, weightKg: null, completed: false },
      { id: 'demo-press-2', plannedReps: 10, actualReps: null, weightKg: null, completed: false },
    ] },
    { id: 'demo-crunch', name: 'Скручивания', sets: [
      { id: 'demo-crunch-1', plannedReps: 15, actualReps: null, weightKg: 0, completed: false },
      { id: 'demo-crunch-2', plannedReps: 15, actualReps: null, weightKg: 0, completed: false },
    ] },
  ],
};

export const demoWeightHistory: readonly WeightPoint[] = [
  { date: '2026-11-02', weightKg: 74.6 }, { date: '2026-11-09', weightKg: 74.4 },
  { date: demoDate, weightKg: 74.5 },
];
export const demoExerciseBests: readonly ExerciseBestSeries[] = [
  { exerciseId: 'demo-squat', exerciseName: 'Приседание', metric: 'max-weight-at-reps', fixedReps: 8, unit: 'kg', points: [
    { date: '2026-11-02', weightKg: 35, reps: 8 }, { date: '2026-11-09', weightKg: 37.5, reps: 8 },
    { date: demoDate, weightKg: 40, reps: 8 },
  ] },
  { exerciseId: 'demo-bench', exerciseName: 'Жим лёжа', metric: 'max-weight-at-reps', fixedReps: 10, unit: 'kg', points: [
    { date: '2026-11-02', weightKg: 25, reps: 10 }, { date: '2026-11-09', weightKg: 27.5, reps: 10 },
    { date: demoDate, weightKg: 30, reps: 10 },
  ] },
];
export const demoProgress: readonly ProgressPreview[] = [
  { id: 'demo-weight', isDemo: true, name: 'Вес', description: 'Демонстрационная история по датам.' },
  { id: 'demo-training', isDemo: true, name: 'Результаты упражнений', description: 'Лучший вес при одинаковом числе повторений, пример.' },
];

export const demoAssistantStates: Readonly<Record<AssistantConnectionState, DemoRecord<AssistantViewData>>> = {
  'not-configured': { isDemo: true, connectionState: 'not-configured', messages: [] },
  offline: { isDemo: true, connectionState: 'offline', messages: [
    { id: 'demo-offline-user', role: 'user', text: 'Пример: покажи записи за вчера.', time: '2026-11-16T08:00:00+05:00' },
    { id: 'demo-offline-system', role: 'system', text: 'Демонстрация: нет подключения. Реальный запрос не отправлялся.', time: '2026-11-16T08:00:01+05:00' },
  ] },
  ready: { isDemo: true, connectionState: 'ready', messages: [
    { id: 'demo-ready-user', role: 'user', text: 'Пример: гречка 200 г, 2 яйца.', time: '2026-11-16T12:00:00+05:00' },
    { id: 'demo-ready-assistant', role: 'assistant', text: 'Пример уточнения: 200 г — масса готовой гречки? Ничего не сохранено.', time: '2026-11-16T12:00:02+05:00' },
  ] },
  thinking: { isDemo: true, connectionState: 'thinking', messages: [
    { id: 'demo-thinking-user', role: 'user', text: 'Пример: сравни две недели.', time: '2026-11-16T20:00:00+05:00' },
  ] },
};

const goalOptions = [
  { value: 'gain', label: 'Набор' }, { value: 'cut', label: 'Сушка' }, { value: 'maintain', label: 'Поддержание' },
] as const;
const emptyCalculation: NormCalculationParameters = {
  method: 'mifflin-st-jeor', ageYears: null, heightCm: null, weightKg: null, sexForFormula: null,
  activityMultiplier: null, energyAdjustmentPercent: null, proteinGramsPerKg: null,
};
function calculationFields(value: NormCalculationParameters): readonly ProfileField[] {
  return [
    { key: 'method', label: 'Формула BMR', type: 'select', value: value.method, options: [{ value: 'mifflin-st-jeor', label: 'Миффлин — Сан-Жеор' }] },
    { key: 'ageYears', label: 'Возраст', type: 'number', value: value.ageYears, unit: 'лет' },
    { key: 'heightCm', label: 'Рост', type: 'number', value: value.heightCm, unit: 'см' },
    { key: 'weightKg', label: 'Вес', type: 'number', value: value.weightKg, unit: 'кг' },
    { key: 'sexForFormula', label: 'Пол для формулы', type: 'select', value: value.sexForFormula, options: [{ value: 'female', label: 'Женский' }, { value: 'male', label: 'Мужской' }] },
    { key: 'activityMultiplier', label: 'Коэффициент активности', type: 'number', value: value.activityMultiplier, unit: null },
    { key: 'energyAdjustmentPercent', label: 'Профицит (+) / дефицит (−)', type: 'number', value: value.energyAdjustmentPercent, unit: '%' },
    { key: 'proteinGramsPerKg', label: 'Белок на массу тела', type: 'number', value: value.proteinGramsPerKg, unit: 'г/кг' },
  ];
}
export const emptyProfileFields: readonly ProfileField[] = [
  { key: 'goal', label: 'Цель', type: 'select', value: null, options: goalOptions },
  { key: 'waistCm', label: 'Обхват талии', type: 'number', value: null, unit: 'см' },
  { key: 'experience', label: 'Тренировочный опыт', type: 'select', value: null, options: [
    { value: 'beginner', label: 'Начальный' }, { value: 'intermediate', label: 'Есть опыт' }, { value: 'advanced', label: 'Продвинутый' },
  ] },
  { key: 'equipment', label: 'Оборудование', type: 'text', value: null },
  { key: 'schedule', label: 'Расписание', type: 'text', value: null },
  { key: 'preferences', label: 'Пищевые предпочтения', type: 'text', value: null },
  { key: 'restrictions', label: 'Пищевые ограничения', type: 'text', value: null },
];
export const emptyProfile: DemoRecord<ProfileViewData> = {
  isDemo: true, fields: emptyProfileFields, goal: null, calculation: emptyCalculation,
  calculationFields: calculationFields(emptyCalculation), calculatedBmrKcal: null, calculatedDailyKcal: null,
};
const sampleCalculation: NormCalculationParameters = {
  method: 'mifflin-st-jeor', ageYears: 30, heightCm: 178, weightKg: 74.5, sexForFormula: 'male',
  activityMultiplier: 1.4, energyAdjustmentPercent: 0, proteinGramsPerKg: 1.8,
};
/** Filled profile is for designer previews only; the running placeholder uses emptyProfile. */
export const demoProfile: DemoRecord<ProfileViewData> = {
  isDemo: true, goal: 'maintain', calculation: sampleCalculation,
  fields: [
    { key: 'goal', label: 'Цель', type: 'select', value: 'maintain', options: goalOptions },
    { key: 'waistCm', label: 'Обхват талии', type: 'number', value: 82, unit: 'см' },
    { key: 'equipment', label: 'Оборудование', type: 'text', value: 'Пример: гантели' },
    { key: 'restrictions', label: 'Пищевые ограничения', type: 'text', value: null },
  ],
  calculationFields: calculationFields(sampleCalculation),
  // Calculation implementation belongs to stage 2, not fixture values masquerading as a result.
  calculatedBmrKcal: null, calculatedDailyKcal: null,
};
