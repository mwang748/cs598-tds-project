import { createHash, timingSafeEqual } from 'node:crypto';
import { listResults } from '../src/results/storage.js';

const digest = (text: string) => createHash('sha256').update(text).digest();
const headers = { 'Cache-Control': 'private, no-store' };

export default {
  async fetch(request: Request) {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } });
    const { VITE_SITE_RESULTS_ENABLED, BLOB_READ_WRITE_TOKEN, RESEARCHER_RESULTS_PASSWORD } = process.env;
    if (VITE_SITE_RESULTS_ENABLED !== 'true' || !BLOB_READ_WRITE_TOKEN || !RESEARCHER_RESULTS_PASSWORD?.trim()) {
      return Response.json({ error: 'Results storage is not configured.' }, { status: 503, headers });
    }
    const credential = request.headers.get('Authorization') ?? '';
    if (!timingSafeEqual(digest(credential), digest(`Bearer ${RESEARCHER_RESULTS_PASSWORD.trim()}`))) {
      return Response.json({ error: 'Enter the researcher password to open saved results.' }, { status: 401, headers });
    }
    try {
      const cursor = new URL(request.url).searchParams.get('cursor') ?? undefined;
      return Response.json(await listResults(BLOB_READ_WRITE_TOKEN, cursor), { headers });
    } catch {
      return Response.json({ error: 'Saved results could not be loaded.' }, { status: 502, headers });
    }
  },
};
