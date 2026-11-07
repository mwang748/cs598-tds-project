import { useEffect, useRef, useState, type Ref } from 'react';
import { Bot, Send } from 'lucide-react';
import type { Checkpoint } from '../content/schema';
import { Blocks } from './Blocks';
import { Choices } from './Choices';

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
  const repliesHeading = useRef<HTMLHeadingElement>(null);
  const focusReplies = useRef(false);

  useEffect(() => {
    if (message && focusReplies.current) {
      repliesHeading.current?.focus();
      focusReplies.current = false;
    }
  }, [message]);

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
      <div className="question-section">
        <span className="alternatives-label">Alternative responses</span>
        <h2 ref={repliesHeading} tabIndex={-1}>{checkpoint.question}</h2>
        <p>Choose the reply you’d prefer to receive.</p>
        <Choices checkpoint={checkpoint} selected={selected} onSelect={onSelect} />
      </div>
    </>}
  </>;
}
