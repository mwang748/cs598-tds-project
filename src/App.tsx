import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ClipboardList, Compass, Download, FileCheck2, MapPin, Settings2 } from 'lucide-react';
import { checkpointCount, validateStudy, type Study } from './content/schema';
import { answerKey, chooseAnswer, countAnswered, createSession, hasUnexportedAnswers, nextRoute, orderedCheckpoints, previousRoute, routeKey, writeFollowUp, type ParticipantSession, type StudyRoute } from './session/session';
import { Blocks } from './components/Blocks';
import { Modal } from './components/Modal';
import { ResearcherPanel } from './components/ResearcherPanel';
import { ScenarioMenu } from './components/ScenarioMenu';
import { TaskChat } from './components/TaskChat';
import { submitResponses } from './results/client';

export function App({ initialStudy }: { initialStudy?: Study } = {}) {
  const [study, setStudy] = useState<Study | null>(initialStudy ?? null);
  const [loadError, setLoadError] = useState('');
  const [session, setSession] = useState<ParticipantSession | null>(null);
  const [route, setRoute] = useState<StudyRoute>({ screen: 'welcome' });
  const [researcherOpen, setResearcherOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportNotice, setExportNotice] = useState('');
  const [exportError, setExportError] = useState('');
  const [usingBundledStudy, setUsingBundledStudy] = useState(true);
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'submitting' | 'submitted' | 'failed'>('idle');
  const submissionKey = useRef('');
  const submitInFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const siteResultsEnabled = import.meta.env.VITE_SITE_RESULTS_ENABLED === 'true';
  const saveToServer = siteResultsEnabled && usingBundledStudy;
  const submitting = submissionStatus === 'submitting';
  const submitted = submissionStatus === 'submitted';

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
    if (submitted || !hasUnexportedAnswers(session)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [session, submitted]);

  const routeIdentity = routeKey(route);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    headingRef.current?.focus();
  }, [routeIdentity, study?.studyId]);

  if (!study) return <div className="loading-screen"><Compass size={32} /><h1>{loadError ? 'The study needs attention' : 'Opening your study…'}</h1>{loadError && <><pre role="alert">{loadError}</pre><p>Fix public/study.default.json using the format in docs/JSON_FORMAT.md, then reload.</p></>}</div>;
  const { instructions } = study;
  const total = checkpointCount(study);
  const scenario = 'scenarioIndex' in route ? study.scenarios[route.scenarioIndex] : undefined;
  const openingBrief = study.openingBrief && route.screen === 'intro' && route.checkpointIndex === undefined && route.scenarioIndex === orderedCheckpoints(study)[0].scenarioIndex
    ? study.openingBrief : undefined;
  const brief = route.screen === 'intro' && route.checkpointIndex !== undefined
    ? study.taskBriefs?.[scenario!.checkpoints[route.checkpointIndex].id] : openingBrief;
  const checkpoint = route.screen === 'checkpoint' ? scenario!.checkpoints[route.checkpointIndex] : undefined;
  const answered = session ? countAnswered(study, session) : 0;
  const answers = session?.answers;
  const followUps = session?.followUps;
  const taskKey = scenario && checkpoint ? answerKey(scenario.id, checkpoint.id) : undefined;
  const selected = taskKey ? answers?.[taskKey] : undefined;
  const followUpAnswer = taskKey ? followUps?.[taskKey] ?? '' : '';
  const hasWrittenAnswer = !!(checkpoint?.followUp && followUpAnswer.trim());
  const canAdvance = !!(selected || hasWrittenAnswer);
  const next = nextRoute(study, route);
  const previousIntro = route.screen === 'intro' && study.settings.allowBackNavigation ? previousRoute(study, route) : undefined;
  const advanceLabel = next.screen === 'intro' ? (next.checkpointIndex === undefined ? 'Next scenario' : 'Next section')
    : next.screen === 'complete' ? 'Finish study' : 'Next task';
  const progress = Math.round(answered / total * 100);

  const start = () => {
    setSession(createSession());
    setSubmissionStatus('idle');
    submissionKey.current = '';
    setExportNotice('');
    setExportError('');
    setRoute(next);
  };
  const select = (optionId?: string) => {
    if (!taskKey) return;
    if (session && route.screen === 'checkpoint') {
      setSession(chooseAnswer(session, study, route.scenarioIndex, route.checkpointIndex, optionId));
      setExportNotice('');
    }
  };
  const saveFollowUp = (value: string) => {
    if (!taskKey || !checkpoint?.followUp) return;
    if (session) {
      setSession(writeFollowUp(session, taskKey, value));
      setExportNotice('');
    }
  };
  const submitCompletedStudy = async (completed: ParticipantSession) => {
    if (!study || submitInFlight.current || submitted) return;
    submitInFlight.current = true;
    setSubmissionStatus('submitting');
    try {
      submissionKey.current ||= crypto.randomUUID();
      await submitResponses(study, completed, submissionKey.current);
      setSubmissionStatus('submitted');
    } catch {
      setSubmissionStatus('failed');
    } finally {
      submitInFlight.current = false;
    }
  };
  const continueCheckpoint = () => {
    if (!canAdvance) return;
    if (session && next.screen === 'complete') {
      const completed = { ...session, completed: true };
      setSession(completed);
      if (saveToServer) void submitCompletedStudy(completed);
    }
    setRoute(next);
  };
  const exportResults = async (format: 'xlsx' | 'csv') => {
    if (!session || !study || busy || submitInFlight.current) return;
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
  const requestReset = () => setResetOpen(true);
  const reset = () => {
    if (busy || submitInFlight.current) return;
    setSubmissionStatus('idle');
    submissionKey.current = '';
    setSession(null); setRoute({ screen: 'welcome' }); setResetOpen(false); setExportNotice(''); setExportError('');
  };

  return <div className="app-shell">
    <a className="skip-link" href="#study-content">Skip to study content</a>
    {scenario && !brief && <ScenarioMenu scenario={scenario} />}
    <div className="study-layout">
      <main className="main-panel" id="study-content" ref={contentRef}>
        {route.screen !== 'welcome' && <div className="progress-area"><div><span>{brief?.title ?? scenario?.title ?? 'Travel chat'}</span><span>{answered} of {total} answered</span></div><div className="progress-track" role="progressbar" aria-label="Study progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div></div>}
        <div className={`study-page page-${route.screen}`} key={routeIdentity}>
          {route.screen === 'welcome' && <>
            <h1 className="welcome-heading" ref={headingRef} tabIndex={-1}>{study.title}</h1>
            <section className="instruction-panel welcome-instructions" aria-labelledby="study-instructions">
              <h2 id="study-instructions" className="instruction-label">
                <ClipboardList size={18} aria-hidden="true" /> {Array.isArray(instructions) ? 'Study instructions' : 'About this study'}
              </h2>
              {Array.isArray(instructions) ? <>
                <p className="instruction-callout"><strong>How each task works</strong> Read the task and choose your preferred approach. You can also describe another approach. Treat each task independently.</p>
                <ul>{instructions.map((instruction, index) => <li key={index}>{instruction}</li>)}</ul>
              </> : <>
                <p className="welcome-introduction">{instructions.introduction}</p>
                <ol>{instructions.steps.map(({ title, text }, index) => (
                  <li key={index}><strong>{title}</strong> {text}</li>
                ))}</ol>
                <p className="welcome-note">{instructions.note ?? <>Click <strong>Start Study</strong> to begin.</>}</p>
              </>}
            </section>
            <div className="welcome-bottom"><button className="button primary" onClick={start}>Start Study <ArrowRight size={17} /></button></div>
          </>}
          {route.screen === 'intro' && scenario && <>
            <section className="instruction-panel scenario-brief" aria-labelledby="scenario-title">
              <p className="instruction-label"><MapPin size={18} aria-hidden="true" /> {brief ? 'Scenario overview' : 'Trip scenario'}</p>
              <h1 id="scenario-title" ref={headingRef} tabIndex={-1}>{brief?.title ?? scenario.title}</h1>
              <Blocks blocks={brief?.blocks ?? scenario.introduction} />
              {!brief && <dl className="inline-trip-summary">
                {scenario.summary.map((item, index) => <div key={index}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
              </dl>}
              <p className="instruction-callout">Choose the response that best matches how you’d want the chatbot to help. You can also choose to handle the task yourself.</p>
            </section>
            <div className="page-actions">
              {previousIntro?.screen === 'checkpoint' ? <button className="button ghost" onClick={() => setRoute(previousIntro)}><ArrowLeft size={16} /> Back</button> : <span />}
              <button className="button primary" onClick={() => setRoute(next)}>{brief ? 'Begin scenarios' : 'Begin scenario'} <ArrowRight size={17} /></button>
            </div>
          </>}
          {route.screen === 'checkpoint' && scenario && checkpoint && <>
            <TaskChat
              checkpoint={checkpoint}
              headingRef={headingRef}
              selected={selected}
              followUpAnswer={followUpAnswer}
              onSelect={select}
              onFollowUp={saveFollowUp}
            />
            <div className="page-actions">
              <button className="button ghost" onClick={() => setRoute(previousRoute(study, route))} disabled={!study.settings.allowBackNavigation}><ArrowLeft size={16} /> Back</button>
              {canAdvance && <span className="selection-hint"><Check size={14} /> {selected ? 'One response selected' : 'Written response added'}</span>}
              <button className="button primary" disabled={!canAdvance} onClick={continueCheckpoint}>{advanceLabel} <ArrowRight size={17} /></button>
            </div>
            <p className="keyboard-tip">Use <kbd>Tab</kbd> to focus choices, <kbd>↑</kbd> <kbd>↓</kbd> to select, and <kbd>Enter</kbd> or <kbd>Space</kbd> to choose.</p>
          </>}
          {route.screen === 'complete' && <div className="completion-content"><span className="completion-icon"><Bot size={28} /></span><h1 ref={headingRef} tabIndex={-1}>{submitting ? 'Finishing the study…' : 'Thanks, that’s everything!'}</h1>
            <div className="completion-card"><FileCheck2 size={26} /><div>
              <h2 role={saveToServer ? (submissionStatus === 'failed' ? 'alert' : 'status') : undefined}>
                {submitted ? 'Your responses were saved' : submitting ? 'Submitting your responses…' : submissionStatus === 'failed' ? 'We couldn’t confirm that your responses were saved' : 'Your responses are ready to download'}
              </h2>
              <p>{answered} checkpoints answered across {study.scenarios.length} scenarios.</p>{session && <code>{session.id}</code>}
            </div></div>
            {submissionStatus === 'failed' && session && <div className="button-row"><button className="button primary" disabled={busy} onClick={() => submitCompletedStudy(session)}>Retry saving responses</button></div>}
            <button className="button primary download-main" disabled={busy || submitting} onClick={() => exportResults('xlsx')}><Download size={19} /> {busy ? 'Preparing download…' : 'Download responses'}<span>.xlsx</span></button>
            <button className="text-button csv-fallback" disabled={busy || submitting} onClick={() => exportResults('csv')}>Download CSV instead <ArrowDownToLine size={14} /></button>
            <div className="completion-bottom">{study.settings.allowBackNavigation && !saveToServer && <button className="text-button" onClick={() => setRoute(previousRoute(study, route))}><ArrowLeft size={15} /> Review responses</button>}<button className="text-button" disabled={busy || submitting} onClick={requestReset}>Next participant <ArrowRight size={15} /></button></div>
          </div>}
        </div>
        {!resetOpen && !researcherOpen && (exportNotice || exportError) && <div className={`export-notice ${exportError ? 'error' : ''}`} role={exportError ? 'alert' : 'status'}>{exportError ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}<p>{exportError || exportNotice}</p></div>}
        <footer><button className="researcher-button" disabled={submitting} onClick={() => setResearcherOpen(true)}><Settings2 size={14} /> Researcher</button></footer>
      </main>
    </div>
    <ResearcherPanel open={researcherOpen} study={study} session={session} busy={busy || submitting} siteResultsEnabled={siteResultsEnabled} onClose={() => setResearcherOpen(false)} onActivate={content => { if (session) return; setStudy(content); setUsingBundledStudy(false); setRoute({ screen: 'welcome' }); }} onReset={requestReset} onExport={exportResults} />
    {researcherOpen && !resetOpen && (exportNotice || exportError) && <div className="toast" role={exportError ? 'alert' : 'status'}>{exportError || exportNotice}</div>}
    {resetOpen && <Modal title="Ready for the next participant?" onClose={() => setResetOpen(false)}><div className="reset-body"><div className="reset-warning"><AlertCircle size={22} /><p>{submitted ? 'This participant’s responses are saved. Resetting clears the current session from this browser.' : 'Resetting clears this participant’s answers from this browser. Download their results first if you need a copy.'}</p></div><div className="button-row"><button className="button primary small" disabled={busy} onClick={() => exportResults('xlsx')}><Download size={15} /> Download current results</button><button className="text-button" disabled={busy} onClick={() => exportResults('csv')}>CSV fallback</button></div>{(exportNotice || exportError) && <p className={exportError ? 'error-text' : 'success-text'} role="status">{exportError || exportNotice}</p>}<div className="page-actions"><button className="button" onClick={() => setResetOpen(false)}>Keep session</button><button className="button danger" disabled={busy || submitting} onClick={reset}>Confirm reset</button></div></div></Modal>}
  </div>;
}
