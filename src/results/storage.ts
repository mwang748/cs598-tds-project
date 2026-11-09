import { get, list, put } from '@vercel/blob';
import { resultRecord, type ResultRecord } from './record.js';

const prefix = 'waypoint/study-responses/';

async function readResult(pathname: string, token: string) {
  const blob = await get(pathname, { access: 'private', token, useCache: false });
  if (!blob || blob.statusCode !== 200) throw new Error('Saved response is unavailable');
  return resultRecord.parse(await new Response(blob.stream).json());
}

export async function saveResult(record: Omit<ResultRecord, 'savedAt'>, token: string) {
  const pathname = `${prefix}${record.submissionKey.toLowerCase()}.json`;
  try {
    await put(pathname, JSON.stringify({ ...record, savedAt: new Date().toISOString() }), {
      access: 'private', token, addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json',
    });
  } catch (error) {
    // A retry after a lost acknowledgement can find a response that was already saved.
    const existing = await readResult(pathname, token).catch(() => null);
    if (!existing) throw error;
    const { savedAt, ...original } = existing;
    if (JSON.stringify(original) !== JSON.stringify(record)) throw error;
  }
}

export async function listResults(token: string, cursor?: string) {
  const page = await list({ prefix, cursor, limit: 25, token });
  const results = await Promise.all(page.blobs.map(blob => readResult(blob.pathname, token)));
  results.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return { results, cursor: page.hasMore ? page.cursor : undefined };
}
