import { createHash } from 'node:crypto';
import type { Study } from '../content/schema';

export const participantTag = 'WPParticipantId';
export const versionTag = 'WPContentVersion';

export function studyFields(study: Study) {
  return study.scenarios.flatMap(scenario => scenario.checkpoints.map(checkpoint => {
    // Qualtrics question numbers have a 20-character limit.
    const identity = JSON.stringify([study.studyId, study.contentVersion, scenario.id, checkpoint.id]);
    const tag = `WP${createHash('sha256').update(identity).digest('hex').slice(0, 14)}`;
    return {
      scenario, checkpoint,
      choiceTag: `${tag}C`,
      followUpTag: `${tag}N`,
    };
  }));
}
