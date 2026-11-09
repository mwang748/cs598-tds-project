import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import content from '../../public/study.default.json';
import { studySchema } from '../content/schema';
import { Choices } from './Choices';

const study = studySchema.parse(content);

describe('separate package cards and embedded scrolling', () => {
  it.each([
    ['tight-flexible', 'hotel-selection', 8],
    ['flexible-flexible', 'hotel-selection', 11],
    ['tight-flexible', 'rental-car-selection', 7],
    ['flexible-flexible', 'rental-car-selection', 16],
  ] as const)('shows each dated package as a card in %s/%s', (scenarioId, taskId, count) => {
    const checkpoint = study.scenarios.find(scenario => scenario.id === scenarioId)!.checkpoints.find(task => task.id === taskId)!;
    render(<Choices checkpoint={checkpoint} onSelect={vi.fn()} />);
    const response = screen.getByRole('radio', { name: /Chatbot searches; I choose/ });
    const viewport = within(response).getByRole('region', { name: `Compare ${count} packages` });
    expect(viewport).toHaveClass('reply-list-window');
    expect(viewport).toHaveAttribute('tabindex', '0');
    const cards = within(viewport).getAllByRole('listitem');
    expect(cards).toHaveLength(count);
    for (const card of cards) {
      expect(card).toHaveClass('reply-list-item');
      expect(card.textContent?.match(/\$\d+/g)).toHaveLength(1);
      expect(card.textContent?.match(/Thursday–Sunday|Friday–Monday|Saturday–Tuesday/g)).toHaveLength(1);
    }
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    const ending = taskId === 'hotel-selection'
      ? 'Compare the packages and dates, then choose one. I have not ranked or recommended them.'
      : 'Compare and choose. I have not ranked or recommended them.';
    expect(viewport).not.toContainElement(within(response).getByText(ending));
  });

  it('keeps package scrolling separate from approach selection and retains keyboard activation', async () => {
    const checkpoint = study.scenarios[3].checkpoints.find(task => task.id === 'rental-car-selection')!;
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Choices checkpoint={checkpoint} onSelect={onSelect} />);
    const response = screen.getByRole('radio', { name: /Chatbot searches; I choose/ });
    const viewport = within(response).getByRole('region', { name: 'Compare 16 packages' });
    viewport.focus();
    await user.keyboard('{ArrowDown}{PageDown}{End} ');
    fireEvent.wheel(viewport, { deltaY: 300 });
    await user.click(within(viewport).getAllByRole('listitem')[0]);
    expect(onSelect).not.toHaveBeenCalled();
    response.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('B');
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenLastCalledWith('B');
    await user.keyboard('{ArrowDown}');
    expect(onSelect).toHaveBeenLastCalledWith('C');
  });

  it('scrolls only the 12-flight list and keeps its explanation and shortlist outside', async () => {
    const checkpoint = study.scenarios.find(scenario => scenario.id === 'flexible-flexible')!.checkpoints.find(task => task.id === 'flight-selection')!;
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Choices checkpoint={checkpoint} onSelect={onSelect} />);
    const response = screen.getByRole('radio', { name: /Chatbot searches; I choose/ });
    const viewport = within(response).getByRole('region', { name: 'Compare 12 flights' });
    expect(viewport).toHaveClass('reply-list-window');
    expect(within(viewport).getAllByRole('listitem')).toHaveLength(12);
    expect(viewport).not.toContainElement(within(response).getByText('Compare them and choose one. I have not ranked or recommended a flight.'));
    expect(screen.getAllByRole('region')).toHaveLength(1);
    await user.click(within(viewport).getAllByRole('listitem')[0]);
    expect(onSelect).not.toHaveBeenCalled();
    response.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('B');
  });

  it('keeps a six-flight list inline', () => {
    const checkpoint = study.scenarios.find(scenario => scenario.id === 'tight-flexible')!.checkpoints.find(task => task.id === 'flight-selection')!;
    render(<Choices checkpoint={checkpoint} onSelect={vi.fn()} />);
    const response = screen.getByRole('radio', { name: /Chatbot searches; I choose/ });
    expect(within(response).getAllByRole('listitem')).toHaveLength(6);
    expect(within(response).queryByRole('region')).not.toBeInTheDocument();
  });
});
