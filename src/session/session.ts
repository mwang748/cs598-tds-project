import { checkpointCount, type Study } from '../content/schema.js';

export interface ParticipantSession {
  id: string;
  startedAt: string;
  timezone: string;
  answers: Record<string, string>;
  followUps?: Record<string, string>;
  /** Increases for answer changes only; downloads do not remove answers. */
  revision: number;
  exportedRevision: number;
  completed: boolean;
}

export type StudyRoute =
  | { screen: 'welcome' }
  | { screen: 'intro'; scenarioIndex: number }
  | { screen: 'checkpoint'; scenarioIndex: number; checkpointIndex: number }
  | { screen: 'complete' };

export const answerKey = (scenarioId: string, checkpointId: string) => JSON.stringify([scenarioId, checkpointId]);
export function createSession(): ParticipantSession {
  return {
    id: `P-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    startedAt: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    answers: {}, revision: 0, exportedRevision: -1, completed: false,
  };
}

export function chooseAnswer(session: ParticipantSession, study: Study, si: number, ci: number, optionId?: string): ParticipantSession {
  const scenario = study.scenarios[si];
  const checkpoint = scenario?.checkpoints[ci];
  if (!checkpoint) return session;
  if (optionId === undefined ? !checkpoint.followUp : !checkpoint.options.some(option => option.id === optionId)) return session;
  const key = answerKey(scenario.id, checkpoint.id);
  if (session.answers[key] === optionId) return session;
  const answers = { ...session.answers };
  if (optionId === undefined) delete answers[key];
  else answers[key] = optionId;
  return { ...session, answers, revision: session.revision + 1, completed: false };
}

export function writeFollowUp(session: ParticipantSession, key: string, value: string): ParticipantSession {
  if ((session.followUps?.[key] ?? '') === value) return session;
  return {
    ...session,
    followUps: { ...session.followUps, [key]: value },
    revision: session.revision + 1,
    completed: false,
  };
}

export function countAnswered(study: Study, session: ParticipantSession): number {
  return study.scenarios.reduce((count, scenario) => count + scenario.checkpoints.filter(checkpoint => {
    const key = answerKey(scenario.id, checkpoint.id);
    return checkpoint.options.some(option => option.id === session.answers[key])
      || !!(checkpoint.followUp && session.followUps?.[key]?.trim());
  }).length, 0);
}

export const isComplete = (study: Study, session: ParticipantSession) => session.completed && countAnswered(study, session) === checkpointCount(study);
export const hasUnexportedAnswers = (session: ParticipantSession | null) => !!session && session.revision > 0 && session.exportedRevision !== session.revision;

export function nextCheckpoint(study: Study, si: number, ci: number): StudyRoute {
  if (ci + 1 < study.scenarios[si].checkpoints.length) return { screen: 'checkpoint', scenarioIndex: si, checkpointIndex: ci + 1 };
  if (si + 1 < study.scenarios.length) return { screen: 'intro', scenarioIndex: si + 1 };
  return { screen: 'complete' };
}

export function previousRoute(study: Study, route: StudyRoute): StudyRoute {
  if (route.screen === 'checkpoint') {
    if (route.checkpointIndex > 0) return { ...route, checkpointIndex: route.checkpointIndex - 1 };
    return { screen: 'intro', scenarioIndex: route.scenarioIndex };
  }
  if (route.screen === 'intro' && route.scenarioIndex > 0) {
    return { screen: 'checkpoint', scenarioIndex: route.scenarioIndex - 1, checkpointIndex: study.scenarios[route.scenarioIndex - 1].checkpoints.length - 1 };
  }
  if (route.screen === 'complete') {
    const si = study.scenarios.length - 1;
    return { screen: 'checkpoint', scenarioIndex: si, checkpointIndex: study.scenarios[si].checkpoints.length - 1 };
  }
  return route;
}
