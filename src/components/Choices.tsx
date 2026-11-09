import { useRef } from 'react';
import { Bot, Check } from 'lucide-react';
import type { Checkpoint } from '../content/schema';
import { ReplyText } from './ReplyText';

export function Choices({ checkpoint, selected, onSelect }: {
  checkpoint: Checkpoint;
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const replies = checkpoint.options.filter(option => option.kind === 'chatbot');
  const manualOptions = checkpoint.options.filter(option => option.kind === 'manual');
  const options = [...replies, ...manualOptions];

  function renderOption(option: Checkpoint['options'][number], index: number) {
    const manual = option.kind === 'manual';
    const checked = selected === option.id;
    return <div
      key={option.id}
      ref={element => { refs.current[index] = element; }}
      role="radio" aria-checked={checked} aria-label={option.text}
      tabIndex={(selected ? checked : index === 0) ? 0 : -1}
      className={`${manual ? 'manual-answer manual-choice' : 'choice-card'}${checked ? ' selected' : ''}`}
      onClick={() => onSelect(option.id)}
      onKeyDown={event => {
        // A focused package viewport uses arrow keys and Space for scrolling.
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(option.id);
          return;
        }
        let next: number | undefined;
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % options.length;
        if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + options.length) % options.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = options.length - 1;
        if (next !== undefined) { event.preventDefault(); onSelect(options[next].id); refs.current[next]?.focus(); }
      }}
    >
      {manual ? <>
        <span className="manual-choice-indicator" aria-hidden="true" />
        <ReplyText text={option.text} />
      </> : <>
        <span className="reply-avatar" aria-hidden="true"><Bot size={18} /></span>
        <span className="reply-bubble">
          <ReplyText text={option.text} />
          {checked && <span className="reply-selected" aria-hidden="true"><Check size={13} /> Selected</span>}
        </span>
      </>}
    </div>;
  }

  return <div className="choice-group" role="radiogroup" aria-label="Choose an approach">
    {replies.map(renderOption)}
    {manualOptions.length > 0 && <div className="manual-options">
      <h3>Do it yourself</h3>
      {manualOptions.map((option, index) => renderOption(option, replies.length + index))}
    </div>}
  </div>;
}
