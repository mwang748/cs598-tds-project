import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import submit from '../../api/submit';
import results from '../../api/results';
import study from '../../public/study.default.json';
import { answerKey } from '../session/session';

const blob = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), list: vi.fn() }));
vi.mock('@vercel/blob', () => blob);

const submissionKey = 'fb1c245a-bb77-4d17-a90b-c3a6b7ade003';
const data = {
  submissionKey, studyId: study.studyId, contentVersion: study.contentVersion, participantId: 'P-012345abcdef',
  answers: Object.fromEntries(study.scenarios.flatMap(scenario =>
    scenario.checkpoints.map(task => [answerKey(scenario.id, task.id), task.options[0].id]))),
  followUps: { [answerKey(study.scenarios[0].id, study.scenarios[0].checkpoints[0].id)]: 'This is a test follow-up.' },
};
const request = (input: unknown = data) => new Request('https://example.edu/api/submit', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
});
const storageBody = (value: string) => ({ statusCode: 200, stream: new Response(value).body });

describe('site results', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SITE_RESULTS_ENABLED', 'true');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-blob-token');
    vi.stubEnv('RESEARCHER_RESULTS_PASSWORD', 'researcher-test-password');
    vi.resetAllMocks();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('saves the complete response privately and acknowledges the same record on retry', async () => {
    blob.put.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Already exists'));
    expect(await (await submit.fetch(request())).json()).toEqual({ saved: true });
    const [pathname, stored, options] = blob.put.mock.calls[0];
    expect(options).toMatchObject({ access: 'private', allowOverwrite: false, addRandomSuffix: false });
    expect(JSON.parse(stored)).toMatchObject({ participantId: data.participantId, responses: [
      expect.objectContaining({ followUp: 'This is a test follow-up.' }), ...Array.from({ length: 15 }, () => expect.any(Object)),
    ] });
    blob.get.mockResolvedValueOnce(storageBody(stored));
    expect(await (await submit.fetch(request())).json()).toEqual({ saved: true });
    expect(blob.put.mock.calls[1][0]).toBe(pathname);
    expect(blob.get).toHaveBeenCalledWith(pathname, expect.objectContaining({ access: 'private' }));
  });

  it('rejects incomplete, stale or invalid answers before writing to storage', async () => {
    const scenario = study.scenarios[0];
    const key = answerKey(scenario.id, scenario.checkpoints[0].id);
    const incompleteAnswers = { ...data.answers };
    delete incompleteAnswers[key];
    expect((await submit.fetch(request({ ...data, answers: incompleteAnswers, followUps: {} }))).status).toBe(400);
    expect((await submit.fetch(request({ ...data, contentVersion: 'old' }))).status).toBe(400);
    expect((await submit.fetch(request({ ...data, answers: { ...data.answers, [key]: 'invalid-option' } }))).status).toBe(400);
    expect(blob.put).not.toHaveBeenCalled();
  });

  it('rejects submissions when site storage is disabled', async () => {
    vi.stubEnv('VITE_SITE_RESULTS_ENABLED', 'false');
    const response = await submit.fetch(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ saved: false });
    expect(blob.put).not.toHaveBeenCalled();
  });

  it('requires the researcher password before reading storage and prevents caching', async () => {
    const url = 'https://example.edu/api/results';
    expect((await results.fetch(new Request(url))).status).toBe(401);
    expect((await results.fetch(new Request(url, { headers: { Authorization: 'Bearer wrong' } }))).status).toBe(401);
    expect(blob.list).not.toHaveBeenCalled();
    blob.list.mockResolvedValueOnce({ blobs: [{ pathname: 'waypoint/study-responses/test.json' }], hasMore: true, cursor: 'next' });
    blob.get.mockResolvedValueOnce(storageBody(JSON.stringify({
      submissionKey, studyId: data.studyId, contentVersion: data.contentVersion, participantId: data.participantId,
      savedAt: '2026-11-08T00:00:00.000Z', responses: [],
    })));
    const authorized = await results.fetch(new Request(url, { headers: { Authorization: 'Bearer researcher-test-password' } }));
    expect(authorized.status).toBe(200);
    expect(authorized.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await authorized.json()).toMatchObject({ results: [{ participantId: data.participantId }], cursor: 'next' });
  });
});
