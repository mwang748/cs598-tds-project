import { z } from 'zod';

export const resultRecord = z.object({
  submissionKey: z.string().uuid(),
  studyId: z.string(),
  contentVersion: z.string(),
  participantId: z.string(),
  savedAt: z.string().datetime(),
  responses: z.array(z.object({
    scenarioId: z.string(),
    scenarioTitle: z.string(),
    budget: z.string(),
    schedule: z.string(),
    taskId: z.string(),
    taskTitle: z.string(),
    optionId: z.string(),
    optionText: z.string(),
    followUp: z.string(),
  })),
});

export type ResultRecord = z.infer<typeof resultRecord>;
export type ResultPage = { results: ResultRecord[]; cursor?: string };
