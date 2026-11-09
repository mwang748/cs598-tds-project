import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/submit';
import boston from '../../public/study.default.json';
import { studySchema } from '../content/schema';
import { answerKey } from '../session/session';
import { participantTag, studyFields, versionTag } from './studyFields';

const study = studySchema.parse(boston);
const fields = studyFields(study);
const key = (field: typeof fields[number]) => answerKey(field.scenario.id, field.checkpoint.id);
const submissionKey = 'fb1c245a-bb77-4d17-a90b-c3a6b7ade003';
const data = {
  submissionKey,
  studyId: study.studyId,
  contentVersion: study.contentVersion,
  participantId: 'P-012345abcdef',
  answers: Object.fromEntries(fields.slice(1).map(field => [key(field), 'A'])),
  followUps: { [key(fields[0])]: 'I would check with a friend first.' },
};

const upstreamFields = {
  QID1_TEXT: { type: 'string', exportTag: participantTag },
  QID2_TEXT: { type: 'string', exportTag: versionTag },
  ...Object.fromEntries(fields.flatMap(({ choiceTag, followUpTag }, i) => [
    [`QID${10 + i * 2}`, {
      type: 'number', exportTag: choiceTag,
      oneOf: ['D', 'A', 'C', 'B'].map((label, index) => ({ label, const: index + 41 })),
    }],
    [`QID${11 + i * 2}_TEXT`, { type: 'string', exportTag: followUpTag }],
  ])),
};
const schemaResponse = (properties: Record<string, unknown> = upstreamFields) =>
  Response.json({ result: { properties: { values: { properties } } } });
const request = (body: unknown) => new Request('https://example.edu/api/submit', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('Qualtrics submission', () => {
  beforeEach(() => {
    vi.stubEnv('QUALTRICS_DATACENTER', 'test1');
    vi.stubEnv('QUALTRICS_SURVEY_ID', 'SV_exampleSurvey');
    vi.stubEnv('QUALTRICS_API_TOKEN', 'test-server-only-token');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('submits one completed response using the survey’s actual values and the same retry key', async () => {
    const upstream = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(schemaResponse())
      .mockResolvedValueOnce(Response.json({ result: { responseId: 'R_test' } }));
    vi.stubGlobal('fetch', upstream);
    const result = await handler.fetch(request(data));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ saved: true });
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(upstream.mock.calls[0][0]).toMatch(/\/response-schema$/);
    const [url, init] = upstream.mock.calls[1];
    expect(url).toBe('https://test1.qualtrics.com/API/v3/surveys/SV_exampleSurvey/responses');
    expect(init?.headers).toMatchObject({ 'X-API-TOKEN': 'test-server-only-token', 'Idempotency-Key': submissionKey });
    const { values } = JSON.parse(init?.body as string);
    expect(values).toMatchObject({
      QID1_TEXT: data.participantId, QID2_TEXT: study.contentVersion,
      QID11_TEXT: data.followUps[key(fields[0])], QID12: 42, finished: 1, progress: 100,
    });
    expect(values).not.toHaveProperty('QID10');
  });

  it('rejects incomplete, stale or invalid answers before talking to Qualtrics', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    expect((await handler.fetch(request({ ...data, followUps: {} }))).status).toBe(400);
    expect((await handler.fetch(request({ ...data, contentVersion: 'old' }))).status).toBe(400);
    expect((await handler.fetch(request({ ...data, answers: { ...data.answers, [key(fields[1])]: 'other' } }))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('refuses to submit if a choice label or a field is missing from the destination survey', async () => {
    const upstream = vi.fn().mockResolvedValueOnce(schemaResponse({
      ...upstreamFields, QID12: { type: 'number', exportTag: fields[1].choiceTag, oneOf: [] },
    }));
    vi.stubGlobal('fetch', upstream);
    expect((await handler.fetch(request(data))).status).toBe(502);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
