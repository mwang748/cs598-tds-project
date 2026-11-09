import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ClipboardList, Compass, Download, Eye, FileCheck2, MapPin, Settings2, X } from 'lucide-react';
import { checkpointCount, validateStudy, type Study } from './content/schema';
import { answerKey, chooseAnswer, countAnswered, createSession, hasUnexportedAnswers, nextCheckpoint, previousRoute, writeFollowUp, type ParticipantSession, type StudyRoute } from './session/session';
import { Blocks } from './components/Blocks';
import { Modal } from './components/Modal';
import { ResearcherPanel } from './components/ResearcherPanel';
import { ReplyText } from './components/ReplyText';
import { ScenarioMenu } from './components/ScenarioMenu';
import { TaskChat } from './components/TaskChat';
import { submitResponses } from './qualtrics/client';

interface Preview {
  study: Study;
  route: StudyRoute;
  messages: Record<string, string>;
  answers: Record<string, string>;
  followUps: Record<string, string>;
}

export function App({ initialStudy, qualtricsEnabled = import.meta.env.VITE_QUALTRICS_ENABLED === 'true' }: { initialStudy?: Study; qualtricsEnabled?: boolean } = {}) {
  const [study, setStudy] = useState<Study | null>(initialStudy ?? null);
  const [loadError, setLoadError] = useState('');
  const [session, setSession] = useState<ParticipantSession | null>(null);
  const [participantMessages, setParticipantMessages] = useState<Record<string, string>>({});
  const [participantRoute, setParticipantRoute] = useState<StudyRoute>({ screen: 'welcome' });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [researcherOpen, setResearcherOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmed, setResetConfirmed] = useState(false);
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
  const saveToServer = (siteResultsEnabled || qualtricsEnabled) && usingBundledStudy;
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

  const activeStudy = preview?.study ?? study;
  const route = preview?.route ?? participantRoute;
  const routeIdentity = route.screen + ('scenarioIndex' in route ? `-${route.scenarioIndex}` : '') + ('checkpointIndex' in route ? `-${route.checkpointIndex}` : '') + (preview ? '-preview' : '');
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    headingRef.current?.focus();
  }, [routeIdentity, activeStudy?.studyId]);

  if (!activeStudy) return <div className="loading-screen"><Compass size={32} /><h1>{loadError ? 'The study needs attention' : 'Opening your study…'}</h1>{loadError && <><pre role="alert">{loadError}</pre><p>Fix public/study.default.json using the format in docs/JSON_FORMAT.md, then reload.</p></>}</div>;
  const total = checkpointCount(activeStudy);
  const scenario = 'scenarioIndex' in route ? activeStudy.scenarios[route.scenarioIndex] : undefined;
  const checkpoint = route.screen === 'checkpoint' ? scenario!.checkpoints[route.checkpointIndex] : undefined;
  const ordinal = route.screen === 'checkpoint' ? activeStudy.scenarios.slice(0, route.scenarioIndex).reduce((n, s) => n + s.checkpoints.length, 0) + route.checkpointIndex + 1 : 0;
  const answered = !preview && session ? countAnswered(activeStudy, session) : 0;
  const messages = preview?.messages ?? participantMessages;
  const answers = preview?.answers ?? session?.answers;
  const followUps = preview?.followUps ?? session?.followUps;
  const taskKey = scenario && checkpoint ? answerKey(scenario.id, checkpoint.id) : undefined;
  const message = taskKey ? messages[taskKey] : undefined;
  const selected = taskKey ? answers?.[taskKey] : undefined;
  const followUpAnswer = taskKey ? followUps?.[taskKey] ?? '' : '';
  const hasWrittenAnswer = !!(checkpoint?.followUp && followUpAnswer.trim());
  const canAdvance = !!(message && (selected || hasWrittenAnswer));
  const nextTask = route.screen === 'checkpoint' ? nextCheckpoint(activeStudy, route.scenarioIndex, route.checkpointIndex) : undefined;
  const advanceLabel = nextTask?.screen === 'intro' ? 'Next scenario' : nextTask?.screen === 'complete' ? 'Finish study' : 'Next task';
  const progress = preview ? (route.screen === 'complete' ? 100 : Math.round(ordinal / total * 100)) : Math.round(answered / total * 100);

  const navigate = (next: StudyRoute) => {
    if (preview) setPreview({ ...preview, route: next });
    else setParticipantRoute(next);
  };
  const start = () => {
    if (!preview) {
      setSession(createSession());
      setParticipantMessages({});
      setSubmissionStatus('idle');
      submissionKey.current = '';
      setExportNotice('');
      setExportError('');
    }
    navigate({ screen: 'intro', scenarioIndex: 0 });
  };
  const sendMessage = (text: string) => {
    if (!taskKey || message) return;
    if (preview) setPreview({ ...preview, messages: { ...preview.messages, [taskKey]: text } });
    else setParticipantMessages(current => ({ ...current, [taskKey]: text }));
  };
  const select = (optionId?: string) => {
    if (!taskKey || !message) return;
    if (preview) {
      const answers = { ...preview.answers };
      if (optionId === undefined) delete answers[taskKey];
      else answers[taskKey] = optionId;
      setPreview({ ...preview, answers });
    }
    else if (session && route.screen === 'checkpoint') {
      setSession(chooseAnswer(session, activeStudy, route.scenarioIndex, route.checkpointIndex, optionId));
      setExportNotice('');
    }
  };
  const saveFollowUp = (value: string) => {
    if (!taskKey || !checkpoint?.followUp || !message) return;
    if (preview) setPreview({ ...preview, followUps: { ...preview.followUps, [taskKey]: value } });
    else if (session) {
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
    if (!canAdvance || !nextTask) return;
    if (!preview && session && nextTask.screen === 'complete') {
      const completed = { ...session, completed: true };
      setSession(completed);
      if (saveToServer) void submitCompletedStudy(completed);
    }
    navigate(nextTask);
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
  const requestReset = () => { setResetConfirmed(false); setResetOpen(true); };
  const reset = () => {
    if (!resetConfirmed || busy || submitInFlight.current) return;
    setParticipantMessages({});
    setSubmissionStatus('idle');
    submissionKey.current = '';
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
        {route.screen !== 'welcome' && <div className="progress-area"><div><span>{scenario?.title ?? (preview ? 'Preview' : 'Travel chat')}</span><span>{preview ? (ordinal ? `Task ${ordinal} of ${total}` : `${total} tasks`) : `${answered} of ${total} answered`}</span></div><div className="progress-track" role="progressbar" aria-label="Study progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div></div>}
        <div className={`study-page page-${route.screen}`} key={routeIdentity}>
          {route.screen === 'welcome' && <>
            <h1 className="welcome-heading" ref={headingRef} tabIndex={-1}>{activeStudy.title}</h1>
            <section className="instruction-panel welcome-instructions" aria-labelledby="study-instructions">
              <h2 id="study-instructions" className="instruction-label"><ClipboardList size={18} aria-hidden="true" /> Study instructions</h2>
              <p className="instruction-callout"><strong>How each task works</strong> Send one message per task, then choose how you’d proceed. Each task starts a separate chat. Use the trip details for the current scenario. Your choices from earlier tasks don’t carry over.</p>
              <ul>{activeStudy.instructions.map((instruction, index) => <li key={index}>{instruction}</li>)}</ul>
            </section>
            <div className="welcome-bottom"><span>No names or sign-in needed.</span><button className="button primary" onClick={start}>Start study <ArrowRight size={17} /></button></div>
          </>}
          {route.screen === 'intro' && scenario && <>
            <section className="instruction-panel scenario-brief" aria-labelledby="scenario-title">
              <p className="instruction-label"><MapPin size={18} aria-hidden="true" /> Trip scenario</p>
              <h1 id="scenario-title" ref={headingRef} tabIndex={-1}>{scenario.title}</h1>
              <Blocks blocks={scenario.introduction} />
              <dl className="inline-trip-summary">
                {scenario.summary.map((item, index) => <div key={index}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
              </dl>
              <p className="instruction-callout"><strong>For each task</strong> Use these trip details. Each task starts a separate chat. After you send a message, choose the AI reply you’d prefer or select the manual option below the replies when it’s available.</p>
            </section>
            <div className="page-actions">{activeStudy.settings.allowBackNavigation && route.scenarioIndex > 0 ? <button className="button ghost" onClick={() => navigate(previousRoute(activeStudy, route))}><ArrowLeft size={16} /> Back</button> : <span />}<button className="button primary" onClick={() => navigate({ screen: 'checkpoint', scenarioIndex: route.scenarioIndex, checkpointIndex: 0 })}>Begin scenario <ArrowRight size={17} /></button></div>
          </>}
          {route.screen === 'checkpoint' && scenario && checkpoint && <>
            {activeStudy.settings.allowBackNavigation && scenario.checkpoints.slice(0, route.checkpointIndex).map(previous => {
              const key = answerKey(scenario.id, previous.id);
              const reply = previous.options.find(option => option.id === answers?.[key]);
              const written = previous.followUp && followUps?.[key]?.trim();
              if (!messages[key] || (!reply && !written)) return null;
              return <details className="previous-task" key={key}>
                <summary>Previous task · {previous.title}</summary>
                <div className="traveler-message"><span>You</span><p>{messages[key]}</p></div>
                {reply && <div className="previous-reply">
                  <span>{reply.kind === 'manual' ? 'Do it yourself' : 'Preferred reply'}</span>
                  <div className={reply.kind === 'manual' ? 'manual-answer' : 'reply-bubble'}><ReplyText text={reply.text} /></div>
                </div>}
                {written && <div className="previous-reply"><span>Written response</span><p>{written}</p></div>}
              </details>;
            })}
            <TaskChat
              checkpoint={checkpoint}
              headingRef={headingRef}
              message={message}
              selected={selected}
              followUpAnswer={followUpAnswer}
              onSend={sendMessage}
              onSelect={select}
              onFollowUp={saveFollowUp}
            />
            <div className="page-actions">
              <button className="button ghost" onClick={() => navigate(previousRoute(activeStudy, route))} disabled={!activeStudy.settings.allowBackNavigation}><ArrowLeft size={16} /> Back</button>
              {canAdvance && <span className="selection-hint"><Check size={14} /> {selected ? 'One response selected' : 'Written response added'}</span>}
              <button className="button primary" disabled={!canAdvance} onClick={continueCheckpoint}>{advanceLabel} <ArrowRight size={17} /></button>
            </div>
            {message && <p className="keyboard-tip">Use <kbd>Tab</kbd> to focus choices, <kbd>↑</kbd> <kbd>↓</kbd> to select, and <kbd>Enter</kbd> or <kbd>Space</kbd> to choose.</p>}
          </>}
          {route.screen === 'complete' && <div className="completion-content"><span className="completion-icon"><Bot size={28} /></span><h1 ref={headingRef} tabIndex={-1}>{!preview && submitting ? 'Finishing the study…' : 'Thanks, that’s everything!'}</h1><p className="welcome-lede">You’ve shared how you’d like a travel chatbot to help.</p>
            <div className="completion-card"><FileCheck2 size={26} /><div>
              <h2 role={!preview && saveToServer ? (submissionStatus === 'failed' ? 'alert' : 'status') : undefined}>
                {preview ? 'This is the completion preview' : submitted ? 'Your responses were saved' : submitting ? 'Submitting your responses…' : submissionStatus === 'failed' ? 'We couldn’t confirm that your responses were saved' : 'Your responses are ready to download'}
              </h2>
              <p>{preview ? 'Preview mode does not create a session or any exportable results.' : `${answered} checkpoints answered across ${activeStudy.scenarios.length} scenarios.`}</p>{!preview && session && <code>{session.id}</code>}
            </div></div>
            {preview ? <button className="button primary" onClick={() => setPreview(null)}>Exit preview <ArrowRight size={16} /></button> : <>
              {submissionStatus === 'failed' && session && <div className="button-row"><button className="button primary" disabled={busy} onClick={() => submitCompletedStudy(session)}>Retry submission</button></div>}
              <button className="button primary download-main" disabled={busy || submitting} onClick={() => exportResults('xlsx')}><Download size={19} /> {busy ? 'Preparing download…' : 'Download responses'}<span>.xlsx</span></button>
              <button className="text-button csv-fallback" disabled={busy || submitting} onClick={() => exportResults('csv')}>Download CSV instead <ArrowDownToLine size={14} /></button>
              <p className="download-explainer">{submitted ? 'You’re done. A local copy is optional.' : submitting ? 'Keep this tab open until your submission is confirmed.' : submissionStatus === 'failed' ? 'Retry or download a backup before closing this tab.' : 'Keep the browser download for your records. No server copy is created.'}</p>
            </>}
            <div className="completion-bottom">{activeStudy.settings.allowBackNavigation && (preview || !saveToServer) && <button className="text-button" onClick={() => navigate(previousRoute(activeStudy, route))}><ArrowLeft size={15} /> Review responses</button>}{!preview && <button className="text-button" disabled={busy || submitting} onClick={requestReset}>Next participant <ArrowRight size={15} /></button>}</div>
          </div>}
        </div>
        {!resetOpen && !researcherOpen && (exportNotice || exportError) && <div className={`export-notice ${exportError ? 'error' : ''}`} role={exportError ? 'alert' : 'status'}>{exportError ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}<p>{exportError || exportNotice}</p></div>}
        <footer className="study-footer"><div><p>{session ? submitted ? 'Responses saved.' : saveToServer ? 'Answers are submitted when you finish. Keep this tab open.' : 'Download before refreshing or closing. Answers are held in memory.' : 'Chat mockup · all assistant messages are prewritten.'}</p>{activeStudy.stimulusLabel && <p>{activeStudy.stimulusLabel}</p>}</div><button className="researcher-button" disabled={submitting} onClick={() => setResearcherOpen(true)}><Settings2 size={14} /> Researcher</button></footer>
      </main>
    </div>
    {study && <ResearcherPanel open={researcherOpen} study={study} session={session} busy={busy || submitting} siteResultsEnabled={siteResultsEnabled} onClose={() => setResearcherOpen(false)} onPreview={content => { setPreview({ study: content, route: { screen: 'welcome' }, messages: {}, answers: {}, followUps: {} }); setResearcherOpen(false); }} onActivate={content => { if (session) return; setStudy(content); setUsingBundledStudy(false); setPreview(null); setParticipantRoute({ screen: 'welcome' }); }} onReset={requestReset} onExport={exportResults} />}
    {researcherOpen && !resetOpen && (exportNotice || exportError) && <div className="toast" role={exportError ? 'alert' : 'status'}>{exportError || exportNotice}</div>}
    {resetOpen && <Modal title="Ready for the next participant?" onClose={() => setResetOpen(false)}><div className="reset-body"><div className="reset-warning"><AlertCircle size={22} /><p>{submitted ? 'This participant’s responses are saved. Resetting clears the current session from this browser.' : 'Download this participant’s results before continuing. Resetting clears their answers from this browser, including any responses you haven’t downloaded.'}</p></div><div className="button-row"><button className="button primary small" disabled={busy} onClick={() => exportResults('xlsx')}><Download size={15} /> Download current results</button><button className="text-button" disabled={busy} onClick={() => exportResults('csv')}>CSV fallback</button></div>{(exportNotice || exportError) && <p className={exportError ? 'error-text' : 'success-text'} role="status">{exportError || exportNotice}</p>}<label className="confirmation-label"><input type="checkbox" checked={resetConfirmed} onChange={event => setResetConfirmed(event.target.checked)} /> {submitted ? 'I’m ready to start a new session.' : 'I have retained the download, or I understand these responses will be lost.'}</label><div className="page-actions"><button className="button" onClick={() => setResetOpen(false)}>Keep session</button><button className="button danger" disabled={!resetConfirmed || busy} onClick={reset}>Confirm reset</button></div></div></Modal>}
  </div>;
}
