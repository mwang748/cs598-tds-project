import { useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileJson, Upload } from 'lucide-react';
import { checkpointCount, validateStudy, type Study } from '../content/schema';
import { countAnswered, type ParticipantSession } from '../session/session';
import { Modal } from './Modal';
import { StoredResults } from './StoredResults';

interface Props {
  open: boolean;
  study: Study;
  session: ParticipantSession | null;
  busy: boolean;
  siteResultsEnabled?: boolean;
  onClose: () => void;
  onActivate: (study: Study) => void;
  onReset: () => void;
  onExport: (format: 'xlsx' | 'csv') => void;
}

export function ResearcherPanel({ open, study, session, busy, siteResultsEnabled, onClose, onActivate, onReset, onExport }: Props) {
  const [showResults, setShowResults] = useState(false);
  const [source, setSource] = useState(JSON.stringify(study, null, 2));
  const [candidate, setCandidate] = useState<Study | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const edit = (value: string) => { setSource(value); setCandidate(null); setErrors([]); setNotice(''); };
  const validate = () => {
    const result = validateStudy(source);
    setNotice('');
    if (result.success) { setCandidate(result.study); setErrors([]); }
    else { setCandidate(null); setErrors(result.errors); }
  };
  return <Modal title="Researcher workspace" onClose={() => { setShowResults(false); onClose(); }} wide open={open}>
    {open && (showResults ? <div className="researcher-body">
      <button className="text-button" onClick={() => setShowResults(false)}>Back to workspace</button>
      <StoredResults />
    </div> : <div className="researcher-body"><p className="muted">Edit your study and manage the current participant session.</p>
      {siteResultsEnabled && <button className="button small" onClick={() => setShowResults(true)}>Saved results</button>}
      <div className="research-session"><div><span className="eyebrow">CURRENT PARTICIPANT</span><strong>{session ? session.id : 'No active session'}</strong><span>{session ? `${countAnswered(study, session)} of ${checkpointCount(study)} checkpoints answered. Export before resetting.` : 'You can activate a validated study for the next participant.'}</span></div><div className="button-row">{session && <><button className="button small" disabled={busy} onClick={() => onExport('xlsx')}><Download size={15} /> Export {session.completed ? 'responses' : 'partial'}</button><button className="text-button" disabled={busy} onClick={() => onExport('csv')}>CSV</button><button className="button small danger" disabled={busy} onClick={onReset}>End / reset session</button></>}</div></div>
      <div className="research-section-heading"><h3><FileJson size={18} /> Study configuration</h3><div className="button-row"><a className="text-button" href="/study.template.json" download>Starter JSON <Download size={13} /></a><label className="button small upload-label"><Upload size={14} /> Upload JSON<input type="file" accept=".json,application/json" aria-label="Upload study JSON" onChange={async event => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        try { edit(await file.text()); } catch { setErrors(['Unable to read this file. Try pasting its JSON instead.']); }
        input.value = '';
      }} /></label></div></div>
      <label className="field-label" htmlFor="json-editor">Paste or edit study JSON</label>
      <textarea id="json-editor" className="json-editor" spellCheck={false} value={source} onChange={event => edit(event.target.value)} />
      <div className="button-row"><button className="button primary small" onClick={validate}><CheckCircle2 size={15} /> Validate JSON</button><span className="muted mini">Active: {study.contentVersion}</span></div>
      {errors.length > 0 && <div className="validation-errors" role="alert"><strong><AlertCircle size={16} /> Import needs attention</strong><p>The active configuration has been kept.</p><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
      {candidate && <div className="validation-success" role="status"><h3><CheckCircle2 size={18} /> Valid configuration</h3><strong>{candidate.title}</strong><p>{candidate.scenarios.length} scenarios · {checkpointCount(candidate)} checkpoints · {candidate.contentVersion}</p><ol>{candidate.scenarios.map(scenario => <li key={scenario.id}>{scenario.title} <span className="muted">({scenario.checkpoints.length} checkpoints)</span></li>)}</ol><div className="button-row"><button className="button primary small" disabled={!!session} onClick={() => { onActivate(candidate); setCandidate(null); setNotice('Study activated. The next participant will use this configuration.'); }}>Activate study</button></div><p className="mini">{session ? 'End/reset the active participant session before replacing the study.' : 'Activate this configuration for the next participant.'}</p></div>}
      {notice && <p className="success-text" role="status">{notice}</p>}
      <p className="mini muted">Imports last until refresh. To change the startup content, replace <code>public/study.default.json</code>. Study content is always rendered as plain text.</p>
    </div>)}
  </Modal>;
}
