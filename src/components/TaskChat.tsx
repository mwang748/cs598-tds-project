import { useEffect, useRef, useState, type Ref } from 'react';
import { Bot, Send } from 'lucide-react';
import type { Checkpoint } from '../content/schema';
import { Blocks } from './Blocks';
import { Choices } from './Choices';

const REPLY_DELAY_MS = 3000;

interface Props {
  checkpoint: Checkpoint;
  headingRef: Ref<HTMLHeadingElement>;
  message?: string;
  selected?: string;
  onSend: (message: string) => void;
  onSelect: (optionId: string) => void;
}

export function TaskChat({ checkpoint, headingRef, message, selected, onSend, onSelect }: Props) {
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
    {!!checkpoint.context?.length && <div className="assistant-message">
      <div className="assistant-avatar" aria-hidden="true"><Bot size={20} /></div>
      <div className="message-body">
        <span className="message-author">Travel assistant</span>
        <div className="assistant-bubble"><Blocks blocks={checkpoint.context} /></div>
      </div>
    </div>}
    {!message ? <form className="task-composer" onSubmit={event => {
      event.preventDefault();
      const text = draft.trim();
      if (!text) return;
      focusReplies.current = true;
      setIsThinking(true);
      onSend(text);
    }}>
      <label htmlFor="task-message" className="composer-label">Your message</label>
      <p id="task-instruction" className="task-instruction">
        {checkpoint.taskInstruction ?? 'Send a message asking for help with this task.'}
      </p>
      {checkpoint.travelerMessage && <p id="task-message-example" className="task-message-example">For example, “{checkpoint.travelerMessage}”</p>}
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
        <h2 id="task-replies-heading" ref={repliesHeading} tabIndex={-1}>Choose the reply you’d prefer</h2>
        <Choices checkpoint={checkpoint} selected={selected} onSelect={onSelect} labelledBy="task-replies-heading" />
      </div>}
    </>}
  </>;
}
