import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkoutSession, WorkoutTemplate } from '../src/features/workouts/model';
import { suggestedTemplate } from '../src/features/workouts/workoutLibrary';

const timestamp = '2026-11-01T12:00:00Z';
function template(id: string, archived = false): WorkoutTemplate {
  return { id, name: id, archived, weekday: null, exercises: [], createdAt: timestamp, updatedAt: timestamp };
}
function session(templateId: string, day: string, status: WorkoutSession['status'] = 'completed'): WorkoutSession {
  const start = `${day}T12:00:00Z`;
  return { id: `${templateId}-${day}`, templateId, name: templateId, status, startedAt: start,
    finishedAt: start, timeZone: 'UTC', exercises: [], restEndsAt: null };
}

test('workout suggestion skips archives, prefers never completed, then least recently completed', () => {
  const library = [template('archived', true), template('a'), template('b'), template('c')];
  const history = [session('a', '2026-11-01'), session('b', '2026-11-07'), session('a', '2026-11-12'),
    session('c', '2026-11-11', 'abandoned')];
  assert.equal(suggestedTemplate(library, history)?.id, 'c');
  assert.equal(suggestedTemplate(library, [...history, session('c', '2026-11-15')])?.id, 'b');
  assert.equal(suggestedTemplate(library, [])?.id, 'a');
  assert.equal(suggestedTemplate([template('archived', true)], []), undefined);
});
