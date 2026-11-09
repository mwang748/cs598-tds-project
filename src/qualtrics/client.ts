import type { Study } from '../content/schema';
import type { ParticipantSession } from '../session/session';

export async function submitResponses(study: Study, session: ParticipantSession, submissionKey: string) {
  const response = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      submissionKey,
      studyId: study.studyId,
      contentVersion: study.contentVersion,
      participantId: session.id,
      answers: session.answers,
      followUps: session.followUps ?? {},
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok || (await response.json())?.saved !== true) throw new Error('Submission was not confirmed');
}
