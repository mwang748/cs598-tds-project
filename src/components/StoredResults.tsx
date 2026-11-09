import { useState, type FormEvent } from 'react';
import type { ResultPage, ResultRecord } from '../results/record';

export function StoredResults() {
  const [password, setPassword] = useState('');
  const [records, setRecords] = useState<ResultRecord[] | null>(null);
  const [cursor, setCursor] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load(next?: string) {
    setBusy(true);
    setError('');
    try {
      const query = next ? `?cursor=${encodeURIComponent(next)}` : '';
      const response = await fetch(`/api/results${query}`, {
        headers: { Authorization: `Bearer ${password.trim()}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 401) {
        setRecords(null);
        setCursor(undefined);
        setError('The researcher password was not accepted.');
        return;
      }
      if (!response.ok) throw new Error();
      const page = await response.json() as ResultPage;
      setRecords(previous => [...(next ? previous ?? [] : []), ...page.results].sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
      setCursor(page.cursor);
    } catch {
      setError('Couldn’t load saved results. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && password.trim()) void load();
  }

  async function exportResults() {
    if (!records?.length) return;
    setError('');
    try {
      const { downloadStoredResults } = await import('../export/responses');
      downloadStoredResults(records);
    } catch {
      setError('Couldn’t create the results CSV.');
    }
  }

  return <section aria-labelledby="saved-results-heading">
    <h3 id="saved-results-heading">Saved results</h3>
    {records === null ? <form onSubmit={unlock}>
      <p className="muted">Enter the researcher password to view completed sessions.</p>
      <label className="field-label" htmlFor="research-results-password">Researcher password</label>
      <div className="button-row">
        <input id="research-results-password" type="password" value={password} autoComplete="current-password" onChange={event => setPassword(event.target.value)} />
        <button className="button primary small" disabled={busy || !password.trim()}>{busy ? 'Opening…' : 'Open results'}</button>
      </div>
    </form> : <>
      <p className="muted" role="status">{records.length ? `${records.length} completed sessions loaded.` : 'No completed sessions yet.'}</p>
      <div className="button-row">
        <button className="button primary small" disabled={busy || !records.length} onClick={exportResults}>{cursor ? 'Download loaded results (.csv)' : 'Download all results (.csv)'}</button>
        <button className="button small" disabled={busy} onClick={() => load()}>Refresh</button>
      </div>
      {records.length > 0 && <ol>
        {records.map(record => <li key={record.submissionKey}>
          <details>
            <summary><strong>{record.participantId}</strong> · {new Date(record.savedAt).toLocaleString()} · {record.contentVersion}</summary>
            <ul>
              {record.responses.map(response => <li key={JSON.stringify([response.scenarioId, response.taskId])}>
                <strong>{response.scenarioTitle} · {response.taskTitle}</strong>
                {response.optionText && <p>{response.optionText}</p>}
                {response.followUp && <p>{response.followUp}</p>}
              </li>)}
            </ul>
          </details>
        </li>)}
      </ol>}
      {cursor && <button className="button small" disabled={busy} onClick={() => load(cursor)}>{busy ? 'Loading…' : 'Load more'}</button>}
    </>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </section>;
}
