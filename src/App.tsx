import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, Compass, Download, Eye, FileCheck2, Info, Settings2, X } from 'lucide-react';
import { checkpointCount, validateStudy, type Study } from './content/schema';
import { answerKey, chooseAnswer, countAnswered, createSession, hasUnexportedAnswers, nextCheckpoint, previousRoute, type ParticipantSession, type StudyRoute } from './session/session';
import { Blocks } from './components/Blocks';
import { Choices } from './components/Choices';
import { Modal } from './components/Modal';
import { ResearcherPanel } from './components/ResearcherPanel';
import { ScenarioMenu } from './components/ScenarioMenu';

interface Preview { study: Study; route: StudyRoute; selected?: string }

export function App({ initialStudy }: { initialStudy?: Study } = {}) {
  const [study, setStudy] = useState<Study | null>(initialStudy ?? null);
  const [loadError, setLoadError] = useState('');
  const [session, setSession] = useState<ParticipantSession | null>(null);
  const [participantRoute, setParticipantRoute] = useState<StudyRoute>({ screen: 'welcome' });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [researcherOpen, setResearcherOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportNotice, setExportNotice] = useState('');
  const [exportError, setExportError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (initialStudy) return;
    const controller = new AbortController();
    fetch('/study.default.json', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(`Unable to load study.default.json (${response.status})`);
      const result = validateStudy(await response.text());
      if (!result.success) throw new Error(result.errors.join('\n'));
      setStudy(result.study);
    }).catch(error => { if (error.name !== 'AbortError') setLoadError(error.message); });
    return () => controller.abort();
  }, [initialStudy]);

  useEffect(() => {
    if (!hasUnexportedAnswers(session)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [session]);

  const activeStudy = preview?.study ?? study;
  const route = preview?.route ?? participantRoute;
  const routeIdentity = route.screen + ('scenarioIndex' in route ? `-${route.scenarioIndex}` : '') + ('checkpointIndex' in route ? `-${route.checkpointIndex}` : '') + (preview ? '-preview' : '');
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    headingRef.current?.focus({ preventScroll: true });
  }, [routeIdentity, activeStudy?.studyId]);

  if (!activeStudy) return <div className="loading-screen"><Compass size={32} /><h1>{loadError ? 'The study needs attention' : 'Opening your study…'}</h1>{loadError && <><pre role="alert">{loadError}</pre><p>Fix public/study.default.json using the format in docs/JSON_FORMAT.md, then reload.</p></>}</div>;
  const total = checkpointCount(activeStudy);
  const scenario = 'scenarioIndex' in route ? activeStudy.scenarios[route.scenarioIndex] : undefined;
  const checkpoint = route.screen === 'checkpoint' ? scenario!.checkpoints[route.checkpointIndex] : undefined;
  const ordinal = route.screen === 'checkpoint' ? activeStudy.scenarios.slice(0, route.scenarioIndex).reduce((n, s) => n + s.checkpoints.length, 0) + route.checkpointIndex + 1 : 0;
  const answered = !preview && session ? countAnswered(activeStudy, session) : 0;
  const selected = preview ? preview.selected : session && scenario && checkpoint ? session.answers[answerKey(scenario.id, checkpoint.id)] : undefined;
  const progress = preview ? (route.screen === 'complete' ? 100 : Math.round(ordinal / total * 100)) : Math.round(answered / total * 100);

  const navigate = (next: StudyRoute) => {
    if (preview) setPreview({ ...preview, route: next, selected: undefined });
    else setParticipantRoute(next);
  };
  const start = () => {
    if (!preview) { setSession(createSession()); setExportNotice(''); setExportError(''); }
    navigate({ screen: 'intro', scenarioIndex: 0 });
  };
  const select = (optionId: string) => {
    if (preview) setPreview({ ...preview, selected: optionId });
    else if (session && route.screen === 'checkpoint') {
      setSession(chooseAnswer(session, activeStudy, route.scenarioIndex, route.checkpointIndex, optionId));
      setExportNotice('');
    }
  };
  const continueCheckpoint = () => {
    if (!selected || route.screen !== 'checkpoint') return;
    const next = nextCheckpoint(activeStudy, route.scenarioIndex, route.checkpointIndex);
    if (!preview && session && next.screen === 'complete') setSession({ ...session, completed: true });
    navigate(next);
  };
  const exportResults = async (format: 'xlsx' | 'csv') => {
    if (!session || !study || busy) return;
    setBusy(true); setExportError(''); setExportNotice('');
    const current = session;
    try {
      const { downloadResponses } = await import('./export/responses');
      await downloadResponses(study, current, format);
      setSession(value => value?.id === current.id ? { ...value, exportedRevision: current.revision } : value);
      setExportNotice(`${format.toUpperCase()} download requested. Check your browser’s downloads and retain the file. Your answers are still available here.`);
    } catch (error) { setExportError(`Download could not be created. ${error instanceof Error ? error.message : 'Try the CSV fallback.'}`); }
    finally { setBusy(false); }
  };
  const requestReset = () => { setResetConfirmed(false); setResetOpen(true); };
  const reset = () => {
    if (!resetConfirmed || busy) return;
    setSession(null); setParticipantRoute({ screen: 'welcome' }); setPreview(null); setResetOpen(false); setResearcherOpen(false); setExportNotice(''); setExportError('');
  };

  return <div className="app-shell">
    <a className="skip-link" href="#study-content">Skip to study content</a>
    {scenario && <ScenarioMenu scenario={scenario} />}
    {preview && <div className="preview-bar"><span><Eye size={16} /><strong>Researcher preview</strong><span>No participant results are recorded.</span></span><div><label htmlFor="preview-jump">Jump to</label><select id="preview-jump" value={route.screen === 'checkpoint' ? `${route.scenarioIndex}:${route.checkpointIndex}` : route.screen === 'intro' ? `${route.scenarioIndex}:intro` : route.screen} onChange={event => {
      const value = event.target.value;
      if (value === 'welcome' || value === 'complete') navigate({ screen: value });
      else { const [si, ci] = value.split(':'); navigate(ci === 'intro' ? { screen: 'intro', scenarioIndex: Number(si) } : { screen: 'checkpoint', scenarioIndex: Number(si), checkpointIndex: Number(ci) }); }
    }}><option value="welcome">Welcome & instructions</option>{activeStudy.scenarios.map((s, si) => <optgroup key={s.id} label={`${si + 1}. ${s.title}`}><option value={`${si}:intro`}>Scenario introduction</option>{s.checkpoints.map((cp, ci) => <option key={cp.id} value={`${si}:${ci}`}>{ci + 1}. {cp.title}</option>)}</optgroup>)}<option value="complete">Completion screen</option></select><button className="text-button" onClick={() => setPreview(null)}>Exit preview <X size={15} /></button></div></div>}
    <div className="study-layout">
      <main className="main-panel" id="study-content" ref={contentRef}>
        {route.screen !== 'welcome' && <div className="progress-area"><div><span>{preview ? 'Preview' : 'Travel chat'}</span><span>{preview ? (ordinal ? `Example ${ordinal} of ${total}` : `${total} examples`) : `${answered} of ${total} answered`}</span></div><div className="progress-track" role="progressbar" aria-label="Study progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div></div>}
        <div className={`study-page page-${route.screen}`} key={routeIdentity}>
          {route.screen === 'welcome' && <>
            <div className="assistant-message welcome-message"><div className="assistant-avatar"><Bot size={20} /></div><div className="message-body"><span className="message-author">Travel assistant</span><div className="assistant-bubble"><h1 ref={headingRef} tabIndex={-1}>Hi! Let’s plan a trip.</h1><p className="welcome-lede">Imagine a few trips and choose how you’d like a chatbot to help.</p><div className="welcome-instructions"><h2>A couple of things before we start</h2><ul>{activeStudy.instructions.map((instruction, index) => <li key={index}>{instruction}</li>)}</ul></div></div></div></div>
            <div className="welcome-bottom"><span>No names or sign-in needed.</span><button className="button primary" onClick={start}>Start study <ArrowRight size={17} /></button></div>
          </>}
          {route.screen === 'intro' && scenario && <>
            <div className="assistant-message"><div className="assistant-avatar"><Bot size={20} /></div><div className="message-body"><span className="message-author">Travel assistant</span><div className="assistant-bubble"><p className="conversation-note">{route.scenarioIndex === 0 ? 'Picture this trip…' : 'Let’s try a different trip.'}</p><h1 ref={headingRef} tabIndex={-1}>{scenario.title}</h1><Blocks blocks={scenario.introduction} /><dl className="inline-trip-summary">{scenario.summary.map((item, i) => <div key={i}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></div></div></div>
            <div className="independent-note"><Info size={17} /><p>Each checkpoint stands on its own. Earlier selections won’t change later examples.</p></div>
            <div className="page-actions">{activeStudy.settings.allowBackNavigation && route.scenarioIndex > 0 ? <button className="button ghost" onClick={() => navigate(previousRoute(activeStudy, route))}><ArrowLeft size={16} /> Back</button> : <span />}<button className="button primary" onClick={() => navigate({ screen: 'checkpoint', scenarioIndex: route.scenarioIndex, checkpointIndex: 0 })}>Begin scenario <ArrowRight size={17} /></button></div>
          </>}
          {route.screen === 'checkpoint' && checkpoint && <>
            <div className="checkpoint-heading"><h1 ref={headingRef} tabIndex={-1}>{checkpoint.title}</h1><span>Independent example</span></div>
            {checkpoint.context && checkpoint.context.length > 0 && <div className="assistant-message"><div className="assistant-avatar"><Bot size={20} /></div><div className="message-body"><span className="message-author">Travel assistant</span><div className="assistant-bubble"><Blocks blocks={checkpoint.context} /></div></div></div>}
            {checkpoint.travelerMessage && <div className="traveler-message"><span>You, in this scenario</span><p>{checkpoint.travelerMessage}</p></div>}
            <div className="question-section"><span className="alternatives-label">Alternative responses</span><h2>{checkpoint.question}</h2><p>Tap the reply you’d prefer. Each bubble is a separate alternative.</p><Choices checkpoint={checkpoint} selected={selected} onSelect={select} /></div>
            <div className="page-actions"><button className="button ghost" onClick={() => navigate(previousRoute(activeStudy, route))} disabled={!activeStudy.settings.allowBackNavigation}><ArrowLeft size={16} /> Back</button><span className="selection-hint">{selected ? <><Check size={14} /> One response selected</> : 'Select a response to continue'}</span><button className="button primary" disabled={!selected} onClick={continueCheckpoint}>Continue <ArrowRight size={17} /></button></div>
            <p className="keyboard-tip">Use <kbd>Tab</kbd> to focus choices, <kbd>↑</kbd> <kbd>↓</kbd> to select, and <kbd>Enter</kbd> or <kbd>Space</kbd> to choose.</p>
          </>}
          {route.screen === 'complete' && <div className="completion-content"><span className="completion-icon"><Bot size={28} /></span><h1 ref={headingRef} tabIndex={-1}>Thanks, that’s everything!</h1><p className="welcome-lede">You’ve shared how you’d like a travel chatbot to help.</p>
            <div className="completion-card"><FileCheck2 size={26} /><div><h2>{preview ? 'This is the completion preview' : 'Your responses are ready to download'}</h2><p>{preview ? 'Preview mode does not create a session or any exportable results.' : `${answered} checkpoints answered across ${activeStudy.scenarios.length} scenarios.`}</p>{!preview && session && <code>{session.id}</code>}</div></div>
            {preview ? <button className="button primary" onClick={() => setPreview(null)}>Exit preview <ArrowRight size={16} /></button> : <><button className="button primary download-main" disabled={busy} onClick={() => exportResults('xlsx')}><Download size={19} /> {busy ? 'Preparing download…' : 'Download responses'}<span>.xlsx</span></button><button className="text-button csv-fallback" disabled={busy} onClick={() => exportResults('csv')}>Download CSV instead <ArrowDownToLine size={14} /></button><p className="download-explainer">Keep the browser download for your records.<br />No server copy or backup is created.</p></>}
            <div className="completion-bottom">{activeStudy.settings.allowBackNavigation && <button className="text-button" onClick={() => navigate(previousRoute(activeStudy, route))}><ArrowLeft size={15} /> Review responses</button>}{!preview && <button className="text-button" disabled={busy} onClick={requestReset}>Next participant <ArrowRight size={15} /></button>}</div>
          </div>}
        </div>
        {!resetOpen && !researcherOpen && (exportNotice || exportError) && <div className={`export-notice ${exportError ? 'error' : ''}`} role={exportError ? 'alert' : 'status'}>{exportError ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}<p>{exportError || exportNotice}</p></div>}
        <footer className="study-footer"><div><p>{session ? 'Download before refreshing or closing. Answers are held in memory.' : 'Chat mockup · all assistant messages are prewritten.'}</p>{activeStudy.stimulusLabel && <p>{activeStudy.stimulusLabel}</p>}</div><button className="researcher-button" onClick={() => setResearcherOpen(true)}><Settings2 size={14} /> Researcher</button></footer>
      </main>
    </div>
    {study && <ResearcherPanel open={researcherOpen} study={study} session={session} busy={busy} onClose={() => setResearcherOpen(false)} onPreview={content => { setPreview({ study: content, route: { screen: 'welcome' } }); setResearcherOpen(false); }} onActivate={content => { if (session) return; setStudy(content); setPreview(null); setParticipantRoute({ screen: 'welcome' }); }} onReset={requestReset} onExport={exportResults} />}
    {researcherOpen && !resetOpen && (exportNotice || exportError) && <div className="toast" role={exportError ? 'alert' : 'status'}>{exportError || exportNotice}</div>}
    {resetOpen && <Modal title="Ready for the next participant?" onClose={() => setResetOpen(false)}><div className="reset-body"><div className="reset-warning"><AlertCircle size={22} /><p>Download this participant’s results before continuing. Resetting clears their answers from this browser, including any responses you haven’t downloaded.</p></div><div className="button-row"><button className="button primary small" disabled={busy} onClick={() => exportResults('xlsx')}><Download size={15} /> Download current results</button><button className="text-button" disabled={busy} onClick={() => exportResults('csv')}>CSV fallback</button></div>{(exportNotice || exportError) && <p className={exportError ? 'error-text' : 'success-text'} role="status">{exportError || exportNotice}</p>}<label className="confirmation-label"><input type="checkbox" checked={resetConfirmed} onChange={event => setResetConfirmed(event.target.checked)} /> I have retained the download, or I understand these responses will be lost.</label><div className="page-actions"><button className="button" onClick={() => setResetOpen(false)}>Keep session</button><button className="button danger" disabled={!resetConfirmed || busy} onClick={reset}>Confirm reset</button></div></div></Modal>}
  </div>;
}
