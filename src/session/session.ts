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
  | { screen: 'intro'; scenarioIndex: number; checkpointIndex?: number }
  | { screen: 'checkpoint'; scenarioIndex: number; checkpointIndex: number }
  | { screen: 'complete' };

export const answerKey = (scenarioId: string, checkpointId: string) => JSON.stringify([scenarioId, checkpointId]);
export const routeKey = (route: StudyRoute) => 'scenarioIndex' in route
  ? `${route.screen}-${route.scenarioIndex}-${route.checkpointIndex ?? ''}` : route.screen;
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

/** Group tasks across conditions without changing response IDs or factor metadata. */
export function orderedCheckpoints(study: Study): Extract<StudyRoute, { screen: 'checkpoint' }>[] {
  const checkpoints = study.scenarios.flatMap((scenario, scenarioIndex) => scenario.checkpoints.map((_, checkpointIndex) => ({
    screen: 'checkpoint' as const, scenarioIndex, checkpointIndex,
  })));
  const taskOrder = study.settings.taskOrder ?? (study.settings.firstTaskId ? [study.settings.firstTaskId] : []);
  if (!taskOrder.length) return checkpoints;
  const matches = (route: typeof checkpoints[number], id: string) => study.scenarios[route.scenarioIndex].checkpoints[route.checkpointIndex].id === id;
  return [...taskOrder.flatMap(id => checkpoints.filter(route => matches(route, id))), ...checkpoints.filter(route => !taskOrder.some(id => matches(route, id)))];
}

function participantRoutes(study: Study): StudyRoute[] {
  const grouped = study.settings.firstTaskId || study.settings.taskOrder?.length;
  const routes: StudyRoute[] = [{ screen: 'welcome' }];
  let previousTaskId: string | undefined;
  for (const checkpoint of orderedCheckpoints(study)) {
    const { scenarioIndex, checkpointIndex } = checkpoint;
    const taskId = study.scenarios[scenarioIndex].checkpoints[checkpointIndex].id;
    if (taskId !== previousTaskId && study.taskBriefs && Object.hasOwn(study.taskBriefs, taskId)) {
      routes.push({ screen: 'intro', scenarioIndex, checkpointIndex });
    } else if (previousTaskId === undefined || (!grouped && checkpointIndex === 0)) {
      routes.push({ screen: 'intro', scenarioIndex });
    }
    routes.push(checkpoint);
    previousTaskId = taskId;
  }
  routes.push({ screen: 'complete' });
  return routes;
}

function adjacentRoute(study: Study, route: StudyRoute, direction: -1 | 1): StudyRoute {
  const routes = participantRoutes(study);
  const key = routeKey(route);
  const index = routes.findIndex(item => routeKey(item) === key);
  return index < 0 ? route : routes[index + direction] ?? route;
}

export const nextRoute = (study: Study, route: StudyRoute) => adjacentRoute(study, route, 1);
export const previousRoute = (study: Study, route: StudyRoute) => adjacentRoute(study, route, -1);
