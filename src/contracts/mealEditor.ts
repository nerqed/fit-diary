import type { MealType, NutrientKey, NutrientSourceRef, NutrientUnit, NutrientValue, NutritionSource } from './screens';

/** MVP-2 contract only. No catalogue values, provider, camera or recognition are implemented yet. */
export type FoodCatalogEntry = Readonly<{
  id: string; name: string; aliases: readonly string[];
  state: 'raw' | 'cooked' | 'as-sold';
  barcode: string | null;
  source: NutritionSource;
  /** Every imported book row needs edition/table/page provenance and a verified source. */
  reference: Readonly<{ title: string; edition: string; page: string; row: string; version: string }> | null;
  per100g: readonly Readonly<{
    key: NutrientKey; label: string; unit: NutrientUnit; amount: number | null;
    source: NutrientSourceRef | null; approximate: boolean;
  }>[];
}>;
export type RecognizedFood = Readonly<{
  name: string;
  grams: number;
  /** Normalized confidence in [0, 1]; this is not a nutrient measurement. */
  confidence: number;
}>;
export interface FoodRecognitionAdapter {
  readonly kind: 'mock' | 'gemini' | 'bridge';
  recognize(photo: Readonly<{ uri: string; requestId: string }>): Promise<readonly RecognizedFood[]>;
}
export type PhotoRecognitionJob = Readonly<{
  id: string; mealId: string; photoUri: string; createdAt: string;
  state: 'queued' | 'recognizing' | 'failed' | 'completed' | 'cancelled';
  error: string | null;
}>;
export type MealEditorItem = Readonly<{
  id: string; name: string; catalogId: string | null;
  grams: number | null; source: NutritionSource | null; approximate: boolean;
  /** Complete snapshot selected from the catalogue or a manually entered label. */
  per100g: FoodCatalogEntry['per100g'];
}>;
export type MealEditorScreenProps = Readonly<{
  id: string; timestamp: string; timeZone: string; type: MealType;
  photoUri: string | null; items: readonly MealEditorItem[];
  totals: readonly NutrientValue[];
  catalogResults: readonly FoodCatalogEntry[];
  recognition: PhotoRecognitionJob | null;
  pending: boolean; error: string | null;
  onChangeGrams: (itemId: string, grams: number | null) => void;
  onAdjustGrams: (itemId: string, delta: -10 | -5 | 5 | 10) => void;
  /** Selecting a different food changes its name AND per-100g source, not just display text. */
  onReplaceFood: (itemId: string, foodId: string) => void;
  onSearch: (query: string) => void;
  onAddFood: (foodId: string) => void;
  onAddText: (text: string) => void;
  onSetLabel: (itemId: string, label: FoodCatalogEntry['per100g']) => void;
  onDeleteItem: (itemId: string) => void;
  onSave: () => Promise<void>;
  onRetryRecognition: () => Promise<void>;
  onCancelRecognition: () => Promise<void>;
}>;
