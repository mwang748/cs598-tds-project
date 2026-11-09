import { z } from 'zod';
import boston from '../public/study.default.json' with { type: 'json' };
import { studySchema } from '../src/content/schema.js';
import { answerKey } from '../src/session/session.js';
import { saveResult } from '../src/results/storage.js';

const study = studySchema.parse(boston);
const tasks = study.scenarios.flatMap(scenario => scenario.checkpoints.map(checkpoint => ({ scenario, checkpoint })));
const submission = z.object({
  submissionKey: z.string().uuid(),
  studyId: z.literal(study.studyId),
  contentVersion: z.literal(study.contentVersion),
  participantId: z.string().regex(/^P-[a-f0-9]{12}$/),
  answers: z.record(z.string()),
  followUps: z.record(z.string().max(2000)),
}).strict();

function qualifiedAnswers(data: z.infer<typeof submission>) {
  const keys = new Set(tasks.map(({ scenario, checkpoint }) => answerKey(scenario.id, checkpoint.id)));
  if ([...Object.keys(data.answers), ...Object.keys(data.followUps)].some(key => !keys.has(key))) return;
  const answers = tasks.map(task => {
    const key = answerKey(task.scenario.id, task.checkpoint.id);
    const selected = Object.hasOwn(data.answers, key) ? data.answers[key] : undefined;
    const written = data.followUps[key]?.trim();
    const validChoice = selected === undefined || task.checkpoint.options.some(option => option.id === selected);
    return { ...task, selected, written, valid: validChoice && (!written || !!task.checkpoint.followUp) && !!(selected || written) };
  });
  if (answers.every(answer => answer.valid)) return answers;
}

const failure = (status: number) => Response.json({ saved: false }, { status });

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) return failure(415);

    const body = await request.text().catch(() => '');
    if (body.length > 150_000) return failure(413);
    let input: unknown;
    try { input = JSON.parse(body); } catch { return failure(400); }
    const parsed = submission.safeParse(input);
    if (!parsed.success) return failure(400);
    const answers = qualifiedAnswers(parsed.data);
    if (!answers) return failure(400);

    const { BLOB_READ_WRITE_TOKEN, RESEARCHER_RESULTS_PASSWORD } = process.env;
    if (process.env.VITE_SITE_RESULTS_ENABLED !== 'true' || !BLOB_READ_WRITE_TOKEN || !RESEARCHER_RESULTS_PASSWORD?.trim()) {
      return failure(503);
    }
    const { submissionKey, studyId, contentVersion, participantId } = parsed.data;
    try {
      await saveResult({
        submissionKey, studyId, contentVersion, participantId,
        responses: answers.map(({ scenario, checkpoint, selected, written }) => ({
          scenarioId: scenario.id,
          scenarioTitle: scenario.title,
          budget: scenario.factors?.budget ?? '',
          schedule: scenario.factors?.schedule ?? '',
          taskId: checkpoint.id,
          taskTitle: checkpoint.title,
          optionId: selected ?? '',
          optionText: checkpoint.options.find(option => option.id === selected)?.text ?? '',
          followUp: written ?? '',
        })),
      }, BLOB_READ_WRITE_TOKEN);
      return Response.json({ saved: true });
    } catch {
      console.error('Could not save the completed study response to private storage.');
      return failure(502);
    }
  },
};
