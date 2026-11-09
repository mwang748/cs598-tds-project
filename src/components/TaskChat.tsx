import type { Ref } from 'react';
import { ClipboardList } from 'lucide-react';
import type { Checkpoint } from '../content/schema';
import { Blocks } from './Blocks';
import { Choices } from './Choices';

interface Props {
  checkpoint: Checkpoint;
  headingRef: Ref<HTMLHeadingElement>;
  selected?: string;
  followUpAnswer: string;
  onSelect: (optionId?: string) => void;
  onFollowUp: (value: string) => void;
}

export function TaskChat({ checkpoint, headingRef, selected, followUpAnswer, onSelect, onFollowUp }: Props) {
  const hasChatbotAndManualOptions = checkpoint.options.some(option => option.kind === 'chatbot')
    && checkpoint.options.some(option => option.kind === 'manual');
  const choiceInstruction = checkpoint.choiceInstruction ?? (checkpoint.optionLayout !== 'cards' && hasChatbotAndManualOptions
    ? 'Focus on the kind of help each response offers. If you’d prefer to handle the task yourself, select the manual option.'
    : undefined);

  return <>
    <div className="task-divider"><span>New task</span></div>
    <div className="checkpoint-heading"><h1 ref={headingRef} tabIndex={-1}>{checkpoint.title}</h1></div>
    {!!checkpoint.context?.length && <section className="instruction-panel" aria-labelledby="task-instructions-heading">
      <h2 id="task-instructions-heading" className="instruction-label"><ClipboardList size={18} aria-hidden="true" /> Task instructions</h2>
      <Blocks blocks={checkpoint.context.filter(block => block.type !== 'paragraph' || block.text !== checkpoint.question)} />
    </section>}
    <div className="question-section">
      <div className="question-heading">
        <h2>{checkpoint.question}</h2>
        {choiceInstruction && <p className="task-instruction">{choiceInstruction}</p>}
      </div>
      <Choices checkpoint={checkpoint} selected={selected} onSelect={onSelect} />
      {checkpoint.followUp && <section className="instruction-panel follow-up" aria-labelledby="follow-up-heading">
        <h3 id="follow-up-heading" className="instruction-label">Optional follow-up</h3>
        <label htmlFor="task-follow-up" className="composer-label">{checkpoint.followUp}</label>
        <p id="task-follow-up-help" className="task-instruction">A short answer is fine.</p>
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
    </div>
  </>;
}
