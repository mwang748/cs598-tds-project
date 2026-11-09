import { useEffect, useRef, useState, type Ref } from 'react';
import { Bot, ClipboardList, Send } from 'lucide-react';
import type { Checkpoint } from '../content/schema';
import { Blocks } from './Blocks';
import { Choices } from './Choices';

const REPLY_DELAY_MS = 3000;

interface Props {
  checkpoint: Checkpoint;
  headingRef: Ref<HTMLHeadingElement>;
  message?: string;
  selected?: string;
  followUpAnswer: string;
  onSend: (message: string) => void;
  onSelect: (optionId?: string) => void;
  onFollowUp: (value: string) => void;
}

export function TaskChat({ checkpoint, headingRef, message, selected, followUpAnswer, onSend, onSelect, onFollowUp }: Props) {
  const [draft, setDraft] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const repliesHeading = useRef<HTMLHeadingElement>(null);
  const focusReplies = useRef(false);

  useEffect(() => {
    if (!message) return;
    if (isThinking) {
      const timer = window.setTimeout(() => setIsThinking(false), REPLY_DELAY_MS);
      return () => window.clearTimeout(timer);
    }
    if (focusReplies.current) {
      repliesHeading.current?.focus();
      focusReplies.current = false;
    }
  }, [message, isThinking]);

  return <>
    <div className="task-divider"><span>New task</span></div>
    <div className="checkpoint-heading"><h1 ref={headingRef} tabIndex={-1}>{checkpoint.title}</h1></div>
    {(!message || !!checkpoint.context?.length) && <section className="instruction-panel" aria-labelledby="task-instructions-heading">
      <h2 id="task-instructions-heading" className="instruction-label"><ClipboardList size={18} aria-hidden="true" /> Task instructions</h2>
      {!!checkpoint.context?.length && <Blocks blocks={checkpoint.context} />}
      {!message && <div className="instruction-callout">
        <strong>What to send</strong>
        <p id="task-instruction">{checkpoint.taskInstruction ?? 'Send a message asking for help with this task.'}</p>
        {checkpoint.travelerMessage && <p id="task-message-example" className="task-message-example">For example, “{checkpoint.travelerMessage}”</p>}
      </div>}
    </section>}
    {!message ? <form className="task-composer" onSubmit={event => {
      event.preventDefault();
      const text = draft.trim();
      if (!text) return;
      focusReplies.current = true;
      setIsThinking(true);
      onSend(text);
    }}>
      <label htmlFor="task-message" className="composer-label">Your message</label>
      <div className="composer-field">
        <textarea
          id="task-message"
          aria-describedby={checkpoint.travelerMessage ? 'task-instruction task-message-example' : 'task-instruction'}
          placeholder="Type a message…"
          rows={2}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button className="button primary" disabled={!draft.trim()}>Send <Send size={15} /></button>
      </div>
    </form> : <>
      <div className="traveler-message"><span>You</span><p>{message}</p></div>
      {isThinking ? <div className="assistant-message thinking-message" role="status">
        <span className="sr-only">Preparing replies…</span>
        <div className="assistant-avatar" aria-hidden="true"><Bot size={20} /></div>
        <div className="thinking-bubble" aria-hidden="true"><span /><span /><span /></div>
      </div> : <div className="question-section">
        <h2 ref={repliesHeading} tabIndex={-1}>
          {checkpoint.options.some(option => option.kind === 'chatbot') ? 'Choose the reply you’d prefer OR scroll and select the "Do it yourself" option ' : 'Choose how you’d proceed'}
        </h2>
        <Choices checkpoint={checkpoint} selected={selected} onSelect={onSelect} />
        {checkpoint.followUp && <section className="instruction-panel follow-up" aria-labelledby="follow-up-heading">
          <h3 id="follow-up-heading" className="instruction-label">Written follow-up</h3>
          <label htmlFor="task-follow-up" className="composer-label">{checkpoint.followUp}</label>
          <p id="task-follow-up-help" className="task-instruction">This is optional if you make a selection. You can describe a different approach here.</p>
          <textarea
            id="task-follow-up"
            aria-describedby="task-follow-up-help"
            placeholder="Write your response…"
            rows={3}
            maxLength={2000}
            value={followUpAnswer}
            onChange={event => onFollowUp(event.target.value)}
          />
          {selected && <button className="text-button" type="button" onClick={() => onSelect()}>Clear selection</button>}
        </section>}
      </div>}
    </>}
  </>;
}
