import { z } from 'zod';
import boston from '../public/study.default.json' with { type: 'json' };
import { studySchema } from '../src/content/schema.js';
import { answerKey } from '../src/session/session.js';
import { participantTag, studyFields, versionTag } from '../src/qualtrics/studyFields.js';
import { saveResult } from '../src/results/storage.js';

const study = studySchema.parse(boston);
const fields = studyFields(study);
const submission = z.object({
  submissionKey: z.string().uuid(),
  studyId: z.literal(study.studyId),
  contentVersion: z.literal(study.contentVersion),
  participantId: z.string().regex(/^P-[a-f0-9]{12}$/),
  answers: z.record(z.string()),
  followUps: z.record(z.string().max(2000)),
}).strict();

const responseSchema = z.object({
  result: z.object({
    properties: z.object({
      values: z.object({
        properties: z.record(z.object({ exportTag: z.string().optional(), type: z.unknown(), oneOf: z.unknown() })),
      }),
    }),
  }),
});
const choicesSchema = z.array(z.object({ label: z.string(), const: z.number().int() }));
const receipt = z.object({ result: z.object({ responseId: z.string().min(1) }) });

function qualifiedAnswers(data: z.infer<typeof submission>) {
  const keys = new Set(fields.map(({ scenario, checkpoint }) => answerKey(scenario.id, checkpoint.id)));
  if ([...Object.keys(data.answers), ...Object.keys(data.followUps)].some(key => !keys.has(key))) return;
  const answers = fields.map(field => {
    const key = answerKey(field.scenario.id, field.checkpoint.id);
    const selected = Object.hasOwn(data.answers, key) ? data.answers[key] : undefined;
    const written = data.followUps[key]?.trim();
    const validChoice = selected === undefined || field.checkpoint.options.some(option => option.id === selected);
    return { ...field, selected, written, valid: validChoice && (!written || !!field.checkpoint.followUp) && !!(selected || written) };
  });
  if (answers.every(answer => answer.valid)) return answers;
}

function qualtricsValues(schema: z.infer<typeof responseSchema>, data: z.infer<typeof submission>, answers: NonNullable<ReturnType<typeof qualifiedAnswers>>) {
  const properties = Object.entries(schema.result.properties.values.properties);
  const used = new Set<string>();
  function field(tag: string, type: 'string' | 'number') {
    const expectedTag = tag.toUpperCase();
    const matches = properties.filter(([, value]) => {
      const exported = value.exportTag?.toUpperCase();
      return exported === expectedTag || (type === 'string' && exported === `${expectedTag}_TEXT`);
    });
    const [key, definition] = matches[0] ?? [];
    if (matches.length !== 1 || !key || definition?.type !== type || !/^QID[a-z0-9]+(?:_TEXT)?$/i.test(key) || used.has(key)) {
      throw new Error('Missing or mismatched survey field');
    }
    used.add(key);
    return { key, definition };
  }

  const values: Record<string, string | number> = {
    finished: 1,
    progress: 100,
    [field(participantTag, 'string').key]: data.participantId,
    [field(versionTag, 'string').key]: data.contentVersion,
  };
  for (const { checkpoint, choiceTag, followUpTag, selected, written } of answers) {
    const { key, definition } = field(choiceTag, 'number');
    const choices = choicesSchema.parse(definition.oneOf);
    const codes = checkpoint.options.map(option => {
      const matches = choices.filter(choice => choice.label.trim() === option.id);
      if (matches.length !== 1) throw new Error('Missing or ambiguous survey choice');
      return matches[0].const;
    });
    if (choices.length !== codes.length || new Set(codes).size !== codes.length) throw new Error('Mismatched survey choices');
    if (selected !== undefined) values[key] = codes[checkpoint.options.findIndex(option => option.id === selected)];
    if (checkpoint.followUp) {
      const note = field(followUpTag, 'string');
      if (written) values[note.key] = written;
    }
  }
  return values;
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
    if (process.env.VITE_SITE_RESULTS_ENABLED === 'true') {
      if (!BLOB_READ_WRITE_TOKEN || !RESEARCHER_RESULTS_PASSWORD?.trim()) return failure(503);
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
    }

    const { QUALTRICS_DATACENTER, QUALTRICS_SURVEY_ID, QUALTRICS_API_TOKEN } = process.env;
    if (!QUALTRICS_DATACENTER || !/^[a-z0-9]+$/i.test(QUALTRICS_DATACENTER)
      || !QUALTRICS_SURVEY_ID || !/^SV_[a-z0-9]+$/i.test(QUALTRICS_SURVEY_ID) || !QUALTRICS_API_TOKEN) return failure(503);

    const base = `https://${QUALTRICS_DATACENTER}.qualtrics.com/API/v3/surveys/${QUALTRICS_SURVEY_ID}`;
    const headers = { 'X-API-TOKEN': QUALTRICS_API_TOKEN, Accept: 'application/json' };
    try {
      const schema = await fetch(`${base}/response-schema`, { headers, signal: AbortSignal.timeout(8_000), redirect: 'error' });
      if (!schema.ok) return failure(502);
      const values = qualtricsValues(responseSchema.parse(await schema.json()), parsed.data, answers);
      const saved = await fetch(`${base}/responses`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Idempotency-Key': parsed.data.submissionKey },
        body: JSON.stringify({ values }),
        signal: AbortSignal.timeout(8_000),
        redirect: 'error',
      });
      if (!saved.ok || !receipt.safeParse(await saved.json()).success) return failure(502);
      return Response.json({ saved: true });
    } catch {
      return failure(502);
    }
  },
};
