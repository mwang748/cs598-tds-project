import { useState } from 'react';
import { Menu } from 'lucide-react';
import type { Scenario } from '../content/schema';
import { Blocks } from './Blocks';
import { Modal } from './Modal';

/** A reminder of the current trip, without moving away from the conversation. */
export function ScenarioMenu({ scenario }: { scenario: Scenario }) {
  const [open, setOpen] = useState(false);
  return <>
    <button
      className="scenario-menu-toggle"
      aria-label="Open travel scenario"
      aria-haspopup="dialog"
      aria-expanded={open}
      title="Travel scenario"
      onClick={() => setOpen(true)}
    ><Menu size={22} /></button>
    {open && <Modal title="Travel scenario" onClose={() => setOpen(false)}>
      <div className="scenario-reminder">
        <h3>{scenario.title}</h3>
        <dl className="inline-trip-summary">{scenario.summary.map((item, index) => <div key={index}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
        <Blocks blocks={scenario.introduction} />
        <button className="button primary" onClick={() => setOpen(false)}>Back to chat</button>
      </div>
    </Modal>}
  </>;
}
