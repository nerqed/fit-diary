import type { WorkoutSession } from './model';

/** Civil days stay independent of the device's current offset (travel and DST). */
export function validateDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new RangeError('Укажите дату в формате ГГГГ-ММ-ДД.');
  const value = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== day || day.startsWith('0000-')) {
    throw new RangeError('Укажите существующую дату.');
  }
  return day;
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();

export function localDay(date = new Date(), timeZone?: string): string {
  if (!timeZone) {
    return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')].join('-');
  }
  let format = dayFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFormats.set(timeZone, format);
  }
  const parts = format.formatToParts(date);
  const part = (type: 'year' | 'month' | 'day') => parts.find((entry) => entry.type === type)!.value;
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
}

export function sessionDay(session: Pick<WorkoutSession, 'startedAt' | 'timeZone'>): string {
  return localDay(new Date(session.startedAt), session.timeZone);
}

export function addDays(day: string, offset: number): string {
  const value = new Date(`${validateDay(day)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

const shortDate = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short' });

export function formatDay(day: string): string {
  return shortDate.format(new Date(`${validateDay(day)}T00:00:00Z`)).replace(/\.$/, '');
}

/** The user supplies a day, without inventing a start or duration in their diary. */
export function workoutStart(
  day: string | undefined, now: string, timeZone: string, sessions: readonly WorkoutSession[],
): { startedAt: string; backdated: boolean } {
  const today = localDay(new Date(now), timeZone);
  if (day === undefined || day === today) return { startedAt: now, backdated: false };
  if (validateDay(day) > today) throw new RangeError('Выберите сегодня или прошедший день.');

  // Pick an instant inside that local calendar day, including zones east of UTC+12.
  let start = new Date(`${day}T12:00:00Z`);
  if (localDay(start, timeZone) !== day) start = new Date(`${day}T00:00:00Z`);
  if (localDay(start, timeZone) !== day) throw new RangeError('Этого дня нет в выбранном часовом поясе.');
  for (const session of sessions) {
    if (session.finishedAt === null) continue;
    const next = new Date(Date.parse(session.finishedAt) + 1);
    if (next > start && localDay(next, timeZone) === day) start = next;
  }
  return { startedAt: start.toISOString(), backdated: true };
}
