import { useRef } from 'react';
import { Bot, Check } from 'lucide-react';
import type { Checkpoint } from '../content/schema';

export function Choices({ checkpoint, selected, onSelect }: { checkpoint: Checkpoint; selected?: string; onSelect: (id: string) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return <div className="choice-group" role="radiogroup" aria-label={checkpoint.question}>
    {checkpoint.options.map((option, index) => <button
      key={option.id}
      ref={element => { refs.current[index] = element; }}
      type="button" role="radio" aria-checked={selected === option.id}
      tabIndex={selected ? (selected === option.id ? 0 : -1) : index === 0 ? 0 : -1}
      className={`choice-card ${selected === option.id ? 'selected' : ''}`}
      onClick={() => onSelect(option.id)}
      onKeyDown={event => {
        let next: number | undefined;
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % checkpoint.options.length;
        if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + checkpoint.options.length) % checkpoint.options.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = checkpoint.options.length - 1;
        if (next !== undefined) { event.preventDefault(); onSelect(checkpoint.options[next].id); refs.current[next]?.focus(); }
      }}
    >
      <span className="reply-avatar" aria-hidden="true"><Bot size={18} /></span>
      <span className="reply-bubble"><span className="choice-text">{option.text}</span>{selected === option.id && <span className="reply-selected" aria-hidden="true"><Check size={13} /> Selected</span>}</span>
    </button>)}
  </div>;
}
