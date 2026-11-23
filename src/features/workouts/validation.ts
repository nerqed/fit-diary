import type {
  BodyWeight, Exercise, PerformedSet, PlannedSet, SessionExercise, SetResult, WorkoutData, WorkoutSession, WorkoutSettings,
  WorkoutTemplate, WorkoutWeekday,
} from './model';
import { defaultWorkoutSettings } from './model';
import { validateDay } from './workoutDates';

const weekdays: readonly WorkoutWeekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MAX_TOTAL_SETS = 200_000;
type WorkoutFormat = 1 | 2 | 3;

export class WorkoutValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'WorkoutValidationError'; }
}

function fail(path: string, reason: string): never { throw new WorkoutValidationError(`${path}: ${reason}`); }
function object(value: unknown, keys: readonly string[], path: string, optional: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'ожидался объект');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key) && !optional.includes(key)) || keys.some((key) => !Object.hasOwn(record, key))) {
    fail(path, 'состав полей не соответствует формату');
  }
  return record;
}
function array(value: unknown, max: number, path: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(path, `ожидался массив, не более ${max} записей`);
  return value;
}
function text(value: unknown, path: string, max = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value !== value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) {
    fail(path, 'нужна непустая строка допустимой длины без управляющих символов');
  }
  return value;
}
export function validateWorkoutId(value: unknown, path = 'id'): string {
  const id = text(value, path, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) fail(path, 'недопустимый идентификатор');
  return id;
}
export function validateWorkoutTimestamp(value: unknown, path = 'timestamp'): string {
  const timestamp = text(value, path, 40);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(timestamp);
  if (!match || !Number.isFinite(Date.parse(timestamp))) fail(path, 'нужна дата ISO 8601 с часовым смещением');
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const hour = Number(match[4]); const minute = Number(match[5]); const second = Number(match[6]);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days || hour > 23 || minute > 59 || second > 59) fail(path, 'несуществующая дата или время');
  return timestamp;
}
export function validateWorkoutTimeZone(value: unknown): string {
  const zone = text(value, 'timeZone', 100);
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(0); } catch { fail('timeZone', 'неизвестный часовой пояс'); }
  return zone;
}
function number(value: unknown, path: string, integer: boolean, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(path, 'число вне допустимого диапазона');
  return value;
}
function weight(value: unknown, path: string): number | null { return value === null ? null : number(value, path, false, 0, 10_000); }
function boolean(value: unknown, path: string): boolean { if (typeof value !== 'boolean') fail(path, 'ожидалось логическое значение'); return value; }
function unique(id: string, seen: Set<string>, path: string): void { if (seen.has(id)) fail(path, `повтор идентификатора ${id}`); seen.add(id); }

function optionalRir(row: Record<string, unknown>): { rir?: number | null } {
  if (!Object.hasOwn(row, 'rir')) return {};
  return { rir: row.rir === null ? null : number(row.rir, 'set.rir', true, 0, 3) };
}

export function validateBodyWeight(input: unknown): BodyWeight {
  const row = object(input, ['date', 'weightKg'], 'bodyWeight');
  if (typeof row.date !== 'string') fail('bodyWeight.date', 'нужна календарная дата');
  const date = validateDay(row.date);
  const weightKg = number(row.weightKg, 'bodyWeight.weightKg', false, 0, 10_000);
  if (weightKg === 0) fail('bodyWeight.weightKg', 'нужен положительный вес');
  return { date, weightKg };
}

export function validateWorkoutSettings(input: unknown): WorkoutSettings {
  const row = object(input, ['showRir', 'showNotes'], 'settings');
  return { showRir: boolean(row.showRir, 'settings.showRir'), showNotes: boolean(row.showNotes, 'settings.showNotes') };
}

export function validateSetResult(input: unknown): SetResult {
  const data = object(input, ['actualReps', 'actualWeightKg', 'completed'], 'setResult', ['rir', 'editedFields']);
  const actualReps = data.actualReps === null ? null : number(data.actualReps, 'setResult.actualReps', true, 0, 10_000);
  const completed = boolean(data.completed, 'setResult.completed');
  if (completed && (actualReps === null || actualReps === 0)) fail('setResult.actualReps', 'выполненный подход требует положительного факта повторений');
  const fields = Object.hasOwn(data, 'editedFields') ? object(data.editedFields, [], 'setResult.editedFields', ['reps', 'weight']) : {};
  const editedFields = {
    ...(Object.hasOwn(fields, 'reps') ? { reps: boolean(fields.reps, 'setResult.editedFields.reps') } : {}),
    ...(Object.hasOwn(fields, 'weight') ? { weight: boolean(fields.weight, 'setResult.editedFields.weight') } : {}),
  };
  return { editedFields, actualReps, actualWeightKg: weight(data.actualWeightKg, 'setResult.actualWeightKg'), completed, ...optionalRir(data) };
}

export function validateExercise(input: unknown, version: WorkoutFormat = 3): Exercise {
  const data = object(input, ['id', 'name', 'aliases', 'origin', 'archived', 'createdAt', 'updatedAt'], 'exercise', version >= 2 ? ['note'] : []);
  const origin = data.origin;
  if (origin !== 'builtin' && origin !== 'custom') fail('exercise.origin', 'неизвестный тип');
  const createdAt = validateWorkoutTimestamp(data.createdAt, 'exercise.createdAt');
  const updatedAt = validateWorkoutTimestamp(data.updatedAt, 'exercise.updatedAt');
  if (Date.parse(updatedAt) < Date.parse(createdAt)) fail('exercise.updatedAt', 'раньше создания');
  return {
    id: validateWorkoutId(data.id), name: text(data.name, 'exercise.name'),
    aliases: array(data.aliases, 30, 'exercise.aliases').map((alias) => text(alias, 'exercise.alias')),
    origin, archived: boolean(data.archived, 'exercise.archived'), createdAt, updatedAt,
    ...(Object.hasOwn(data, 'note') && data.note !== '' ? { note: text(data.note, 'exercise.note', 1000) } : {}),
  };
}

export function validateTemplate(input: unknown, version: WorkoutFormat = 3): WorkoutTemplate {
  const data = object(input, ['id', 'name', 'weekday', 'exercises', 'createdAt', 'updatedAt'], 'template', version === 3 ? ['archived'] : []);
  if (data.weekday !== null && !weekdays.includes(data.weekday as WorkoutWeekday)) fail('template.weekday', 'неизвестный день недели');
  const createdAt = validateWorkoutTimestamp(data.createdAt, 'template.createdAt');
  const updatedAt = validateWorkoutTimestamp(data.updatedAt, 'template.updatedAt');
  if (Date.parse(updatedAt) < Date.parse(createdAt)) fail('template.updatedAt', 'раньше создания');
  const ids = new Set<string>([validateWorkoutId(data.id)]);
  const exercises = array(data.exercises, 100, 'template.exercises').map((inputExercise) => {
    const item = object(inputExercise, ['id', 'exerciseId', 'sets'], 'template.exercise');
    const id = validateWorkoutId(item.id); unique(id, ids, 'template.exercise.id');
    const sets = array(item.sets, 100, 'template.sets').map((inputSet): PlannedSet => {
      const row = object(inputSet, ['id', 'reps', 'weightKg'], 'template.set');
      const setId = validateWorkoutId(row.id); unique(setId, ids, 'template.set.id');
      return { id: setId, reps: number(row.reps, 'template.set.reps', true, 1, 10_000), weightKg: weight(row.weightKg, 'template.set.weightKg') };
    });
    if (sets.length === 0) fail('template.sets', 'упражнению нужен хотя бы один подход');
    return { id, exerciseId: validateWorkoutId(item.exerciseId), sets };
  });
  if (exercises.length === 0) fail('template.exercises', 'тренировке нужно хотя бы одно упражнение');
  const archived = Object.hasOwn(data, 'archived') && boolean(data.archived, 'template.archived');
  return {
    id: validateWorkoutId(data.id), name: text(data.name, 'template.name'), weekday: data.weekday as WorkoutWeekday | null,
    ...(archived ? { archived } : {}), exercises, createdAt, updatedAt,
  };
}

export function validateSession(input: unknown, version: WorkoutFormat = 3): WorkoutSession {
  const data = object(input, ['id', 'templateId', 'name', 'startedAt', 'finishedAt', 'timeZone', 'status', 'restEndsAt', 'exercises'], 'session', version >= 2 ? ['backdated', 'repeatedFromId'] : []);
  const status = data.status;
  if (status !== 'active' && status !== 'completed' && status !== 'abandoned') fail('session.status', 'неизвестное состояние');
  const startedAt = validateWorkoutTimestamp(data.startedAt, 'session.startedAt');
  const finishedAt = data.finishedAt === null ? null : validateWorkoutTimestamp(data.finishedAt, 'session.finishedAt');
  if ((status === 'active') !== (finishedAt === null)) fail('session.finishedAt', 'не соответствует состоянию сессии');
  if (finishedAt !== null && Date.parse(finishedAt) < Date.parse(startedAt)) fail('session.finishedAt', 'раньше начала');
  const restEndsAt = data.restEndsAt === null ? null : validateWorkoutTimestamp(data.restEndsAt, 'session.restEndsAt');
  if (status !== 'active' && restEndsAt !== null) fail('session.restEndsAt', 'таймер завершённой сессии должен быть пустым');
  if (restEndsAt !== null && Date.parse(restEndsAt) < Date.parse(startedAt)) fail('session.restEndsAt', 'раньше начала сессии');
  const ids = new Set<string>([validateWorkoutId(data.id)]);
  const exercises = array(data.exercises, 100, 'session.exercises').map((inputExercise): SessionExercise => {
    const item = object(inputExercise, ['id', 'exerciseId', 'name', 'sets'], 'session.exercise');
    const id = validateWorkoutId(item.id); unique(id, ids, 'session.exercise.id');
    const sets = array(item.sets, 100, 'session.sets').map((inputSet): PerformedSet => {
      const row = object(inputSet, ['id', 'plannedReps', 'plannedWeightKg', 'actualReps', 'actualWeightKg', 'completed', 'updatedAt'], 'session.set', version === 3 ? ['rir', 'copiedReps', 'copiedWeight'] : version === 2 ? ['rir'] : []);
      const setId = validateWorkoutId(row.id); unique(setId, ids, 'session.set.id');
      const actualReps = row.actualReps === null ? null : number(row.actualReps, 'session.set.actualReps', true, 0, 10_000);
      const completed = boolean(row.completed, 'session.set.completed');
      if (completed && (actualReps === null || actualReps === 0)) fail('session.set.actualReps', 'выполненный подход требует положительного факта повторений');
      const updatedAt = validateWorkoutTimestamp(row.updatedAt, 'session.set.updatedAt');
      if (Date.parse(updatedAt) < Date.parse(startedAt) || (version === 1 && finishedAt !== null && Date.parse(updatedAt) > Date.parse(finishedAt))) fail('session.set.updatedAt', 'вне времени сессии');
      const copiedReps = Object.hasOwn(row, 'copiedReps') && boolean(row.copiedReps, 'session.set.copiedReps');
      const copiedWeight = Object.hasOwn(row, 'copiedWeight') && boolean(row.copiedWeight, 'session.set.copiedWeight');
      if ((copiedReps || copiedWeight) && completed) fail('session.set', 'отмеченный подход не может содержать автоподстановку');
      if ((copiedReps && actualReps === null) || (copiedWeight && row.actualWeightKg === null)) fail('session.set', 'отсутствует значение автоподстановки');
      return {
        id: setId, plannedReps: number(row.plannedReps, 'session.set.plannedReps', true, 1, 10_000),
        plannedWeightKg: weight(row.plannedWeightKg, 'session.set.plannedWeightKg'),
        actualReps, actualWeightKg: weight(row.actualWeightKg, 'session.set.actualWeightKg'),
        completed, updatedAt, rir: optionalRir(row).rir ?? null,
        ...(copiedReps ? { copiedReps } : {}), ...(copiedWeight ? { copiedWeight } : {}),
      };
    });
    if (sets.length === 0) fail('session.sets', 'упражнению нужен хотя бы один подход');
    return { id, exerciseId: validateWorkoutId(item.exerciseId), name: text(item.name, 'session.exercise.name'), sets };
  });
  if (exercises.length === 0) fail('session.exercises', 'сессии нужно хотя бы одно упражнение');
  return {
    id: validateWorkoutId(data.id), templateId: data.templateId === null ? null : validateWorkoutId(data.templateId),
    name: text(data.name, 'session.name'), startedAt, finishedAt, timeZone: validateWorkoutTimeZone(data.timeZone), status, restEndsAt, exercises,
    ...(Object.hasOwn(data, 'backdated') && boolean(data.backdated, 'session.backdated') ? { backdated: true } : {}),
    ...(Object.hasOwn(data, 'repeatedFromId') ? { repeatedFromId: validateWorkoutId(data.repeatedFromId, 'session.repeatedFromId') } : {}),
  };
}

/** Strict, bounded, deep-copying validation before any import touches the database. */
export function validateWorkoutData(input: unknown, version?: WorkoutFormat): WorkoutData {
  const keys = ['exercises', 'templates', 'sessions'];
  const progress = ['bodyWeights', 'settings'];
  if (version === 2 || version === 3) keys.push(...progress);
  const data = object(input, keys, 'data', version === undefined ? progress : []);
  const exercises = array(data.exercises, 10_000, 'data.exercises').map((exercise) => validateExercise(exercise, version));
  const templates = array(data.templates, 1_000, 'data.templates').map((item) => validateTemplate(item, version));
  const sessions = array(data.sessions, 10_000, 'data.sessions').map((session) => validateSession(session, version));
  const allIds = new Set<string>();
  const exerciseIds = new Set(exercises.map((item) => item.id));
  const templateIds = new Set(templates.map((item) => item.id));
  const completedIds = new Set(sessions.filter((item) => item.status === 'completed').map((item) => item.id));
  let setCount = 0;
  for (const exercise of exercises) unique(exercise.id, allIds, 'exercise.id');
  for (const template of templates) {
    unique(template.id, allIds, 'template.id');
    for (const exercise of template.exercises) {
      unique(exercise.id, allIds, 'template.exercise.id');
      if (!exerciseIds.has(exercise.exerciseId)) fail('template.exercise.exerciseId', 'упражнение отсутствует в справочнике');
      for (const set of exercise.sets) { unique(set.id, allIds, 'template.set.id'); setCount++; }
    }
  }
  let active = 0;
  for (const session of sessions) {
    unique(session.id, allIds, 'session.id');
    if (session.templateId !== null && !templateIds.has(session.templateId)) fail('session.templateId', 'шаблон отсутствует');
    if (session.repeatedFromId && (!completedIds.has(session.repeatedFromId) || session.repeatedFromId === session.id)) fail('session.repeatedFromId', 'исходная завершённая тренировка отсутствует');
    if (session.status === 'active') active++;
    for (const exercise of session.exercises) {
      unique(exercise.id, allIds, 'session.exercise.id');
      if (!exerciseIds.has(exercise.exerciseId)) fail('session.exercise.exerciseId', 'упражнение отсутствует в справочнике');
      for (const set of exercise.sets) { unique(set.id, allIds, 'session.set.id'); setCount++; }
    }
  }
  if (active > 1) fail('data.sessions', 'может быть только одна незавершённая тренировка');
  if (setCount > MAX_TOTAL_SETS) fail('data', 'слишком много подходов');
  const bodyWeights = array(data.bodyWeights === undefined ? [] : data.bodyWeights, 50_000, 'data.bodyWeights').map(validateBodyWeight);
  const dates = new Set<string>();
  for (const entry of bodyWeights) unique(entry.date, dates, 'bodyWeight.date');
  const settings = validateWorkoutSettings(data.settings === undefined ? defaultWorkoutSettings : data.settings);
  return { exercises, templates, sessions, bodyWeights, settings };
}
