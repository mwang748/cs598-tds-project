import { Bot, Check } from 'lucide-react';
import { ReplyText } from './ReplyText';

export function ResponseCard({ text, action, selected }: { text: string; action: boolean; selected?: boolean }) {
  if (action) return <div className="action-card">
    {selected !== undefined && <span className="action-radio" aria-hidden="true" />}
    <ReplyText text={text} />
  </div>;

  return <div className="reply-row">
    <span className="reply-avatar" aria-hidden="true"><Bot size={18} /></span>
    <div className="reply-bubble">
      <ReplyText text={text} />
      {selected && <span className="reply-selected" aria-hidden="true"><Check size={13} /> Selected</span>}
    </div>
  </div>;
}
