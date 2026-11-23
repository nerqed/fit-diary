import type { WorkoutSession, WorkoutTemplate } from './model';

export function suggestedTemplate(templates: readonly WorkoutTemplate[], sessions: readonly WorkoutSession[]) {
  const latest = new Map<string, number>();
  for (const session of sessions) {
    if (session.status !== 'completed' || !session.templateId) continue;
    const lastStart = latest.get(session.templateId) ?? -Infinity;
    latest.set(session.templateId, Math.max(lastStart, Date.parse(session.startedAt)));
  }
  let suggested: WorkoutTemplate | undefined;
  let earliest = Infinity;
  for (const template of templates) {
    if (template.archived) continue;
    const lastStart = latest.get(template.id) ?? -Infinity;
    if (lastStart < earliest) {
      earliest = lastStart;
      suggested = template;
    }
  }
  return suggested;
}
