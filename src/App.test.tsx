import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import boston from '../public/study.default.json';
import example from './test/fixtures/study.example.json';
import { studySchema } from './content/schema';
import { App } from './App';

const study = studySchema.parse(example);
async function sendTaskMessage(user: ReturnType<typeof userEvent.setup>, message = 'Can you help?') {
  await user.type(screen.getByRole('textbox', { name: 'Your message' }), message);
  vi.useFakeTimers();
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    act(() => vi.advanceTimersByTime(3000));
  } finally {
    vi.useRealTimers();
  }
}

async function begin(content = study) {
  const user = userEvent.setup();
  render(<App initialStudy={content} />);
  await user.click(screen.getByRole('button', { name: /Start Study/ }));
  await user.click(screen.getByRole('button', { name: /Begin scenario/ }));
  return user;
}

describe('participant and researcher flows', () => {
  it('submits only after Finish, preserves the same payload on retry and waits for confirmation', async () => {
    const oneTask = structuredClone(study);
    oneTask.scenarios = oneTask.scenarios.slice(0, 1);
    oneTask.scenarios[0].checkpoints = oneTask.scenarios[0].checkpoints.slice(0, 1);
    const submit = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ saved: false }, { status: 502 }))
      .mockResolvedValueOnce(Response.json({ saved: true }));
    vi.stubGlobal('fetch', submit);
    vi.stubEnv('VITE_SITE_RESULTS_ENABLED', 'true');
    try {
      const user = userEvent.setup();
      render(<App initialStudy={oneTask} />);
      await user.click(screen.getByRole('button', { name: 'Start Study' }));
      await user.click(screen.getByRole('button', { name: 'Begin scenario' }));
      await sendTaskMessage(user, 'Could you help me pick a hotel?');
      await user.click(screen.getByRole('radio', { name: /I’d compare the hotels and make this choice myself/ }));
      expect(submit).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Finish study' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t confirm');
      expect(screen.getByRole('button', { name: /Download responses/ })).toBeEnabled();
      await user.click(screen.getByRole('button', { name: 'Retry saving responses' }));
      expect(await screen.findByText('Your responses were saved')).toBeVisible();
      expect(submit).toHaveBeenCalledTimes(2);
      expect(submit.mock.calls[1]).toEqual(submit.mock.calls[0]);
      const [url, init] = submit.mock.calls[0];
      expect(url).toBe('/api/submit');
      const payload = JSON.parse(init?.body as string);
      expect(Object.values(payload.answers)).toEqual(['manual']);
      expect(init?.body).not.toContain('Could you help me pick a hotel?');
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('completes the flight and hotel tasks before changing scenario conditions', async () => {
    const fetchStudy = vi.fn(async () => new Response(JSON.stringify(boston)));
    vi.stubGlobal('fetch', fetchStudy);
    try {
      const user = userEvent.setup();
      render(<App />);
      expect(await screen.findByRole('heading', { name: boston.title })).toBeVisible();
      expect(fetchStudy).toHaveBeenCalledWith('/study.default.json', expect.any(Object));
      const welcome = within(screen.getByRole('region', { name: 'About this study' }));
      expect(welcome.getAllByRole('listitem').map(item => item.querySelector('strong')?.textContent)).toEqual([
        'Planning your trip:', 'Preparing your reservations:', 'Completing the purchase:',
      ]);
      await user.click(screen.getByRole('button', { name: 'Start Study' }));
      expect(screen.getByRole('heading', { name: 'Boston · Tight budget, tight schedule' })).toBeVisible();
      expect(screen.getByText('$350 total, including taxes and one checked bag')).toBeVisible();
      expect(screen.getByText('$600 maximum, including taxes and fees')).toBeVisible();
      expect(screen.getByText(/choose the AI reply you’d prefer/)).toHaveTextContent('select the manual option below the replies');
      await user.click(screen.getByRole('button', { name: 'Begin scenario' }));
      expect(screen.getByRole('heading', { name: 'Finding and choosing a flight' })).toBeVisible();
      expect(screen.queryByText('HarborLink Airways HL 112')).not.toBeInTheDocument();
      await sendTaskMessage(user);
      const replies = screen.getAllByRole('radio');
      const comparison = screen.getByRole('radio', { name: /Here are all 2 nonstop flights/ });
      const manual = screen.getByRole('radio', { name: /I’d search for flights/ });
      const followUp = screen.getByRole('region', { name: 'Written follow-up' });
      expect(replies).toHaveLength(4);
      expect(replies.at(-1)).toBe(manual);
      expect(screen.getByRole('heading', { name: 'Do it yourself' })).toBeVisible();
      expect(manual.compareDocumentPosition(followUp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(comparison).getByText('HarborLink Airways HL 112')).toBeVisible();
      expect(within(comparison).getByText('ORD 9:10 a.m. CT')).toBeVisible();
      expect(within(comparison).getByText('$320 total')).toBeVisible();
      await user.click(comparison);
      await user.click(manual);
      expect(comparison).toHaveAttribute('aria-checked', 'false');
      expect(manual).toHaveAttribute('aria-checked', 'true');
      await user.click(screen.getByRole('button', { name: 'Next task' }));
      expect(screen.getByRole('heading', { name: 'Preparing the reservation' })).toBeVisible();
      await user.click(screen.getByText('Previous task · Finding and choosing a flight'));
      expect(screen.getByText('Do it yourself')).toBeVisible();
      expect(screen.getByText(/assume Lakefront Air LF 222 has already been selected/)).toBeVisible();
      expect(screen.getByText(/Do not enter your real information/)).toBeVisible();
      await sendTaskMessage(user);
      await user.click(screen.getAllByRole('radio')[0]);
      await user.click(screen.getByRole('button', { name: 'Next task' }));
      expect(screen.getByRole('heading', { name: 'Finding and choosing a hotel' })).toBeVisible();
      expect(screen.getByText('Boston · Tight budget, tight schedule')).toBeVisible();
      const instructions = screen.getByRole('region', { name: 'Task instructions' });
      expect(within(instructions).getByText('Which approach would you prefer?')).toBeVisible();
      expect(within(instructions).getByText('Ask for help choosing a hotel.')).toBeVisible();
      await sendTaskMessage(user);
      expect(screen.getAllByRole('radio')).toHaveLength(4);
      expect(screen.getByRole('radio', { name: /Here are all 5 eligible hotels/ })).toBeVisible();
      await user.click(screen.getAllByRole('radio')[0]);
      await user.click(screen.getByRole('button', { name: 'Clear selection' }));
      expect(screen.getByRole('button', { name: 'Next task' })).toBeDisabled();
      await user.type(screen.getByRole('textbox', { name: /Why would you prefer this approach/ }), 'I would ask for a map first.');
      await user.click(screen.getByRole('button', { name: 'Next task' }));
      expect(screen.getByRole('heading', { name: 'Finding and choosing a room and rate' })).toBeVisible();
      expect(screen.getByText(/assume Common Street Hotel has been selected/)).toBeVisible();
      await user.click(screen.getByRole('button', { name: /^Back$/ }));
      expect(screen.getByRole('textbox', { name: /Why would you prefer this approach/ })).toHaveValue('I would ask for a map first.');
      await user.click(screen.getByRole('button', { name: 'Next task' }));
      await sendTaskMessage(user);
      await user.click(screen.getAllByRole('radio')[0]);
      await user.click(screen.getByRole('button', { name: 'Next scenario' }));
      expect(screen.getByRole('heading', { name: 'Boston · Tight budget, flexible schedule' })).toBeVisible();
      expect(screen.getByText('Friday · any time CT')).toBeVisible();
    } finally {
      vi.unstubAllGlobals();
    }
  }, 12000);

  it('shows a thinking indicator before revealing the fixed replies under one prompt', async () => {
    const user = await begin();
    const composer = screen.getByRole('textbox', { name: 'Your message' });
    expect(screen.getByText('New task')).toBeVisible();
    expect(screen.getByText('Ask for help choosing a hotel.')).toBeVisible();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await user.type(composer, '   ');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.clear(composer);
    await user.type(composer, 'I need a quiet place to stay.{Enter}');
    expect(screen.getByText('I need a quiet place to stay.')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Your message' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Preparing replies…');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await screen.findByRole('heading', { name: /^Choose the reply you’d prefer/ }, { timeout: 4000 });
    expect(screen.getByRole('radiogroup', { name: 'Choose an approach' })).toBeVisible();
    expect(screen.queryByText('Alternative responses')).not.toBeInTheDocument();
    expect(screen.queryByText(study.scenarios[0].checkpoints[0].question)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const options = study.scenarios[0].checkpoints[0].options;
    expect(screen.getAllByRole('radio')).toHaveLength(options.length);
    options.forEach((option, index) => expect(screen.getAllByRole('radio')[index]).toHaveAccessibleName(option.text));
  }, 10000);

  it('opens the current scenario from the hamburger without changing the selected reply', async () => {
    const user = await begin();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByText('YOUR STUDY JOURNEY')).not.toBeInTheDocument();
    await sendTaskMessage(user);
    await user.click(screen.getAllByRole('radio')[1]);
    await user.click(screen.getByRole('button', { name: 'Open travel scenario' }));
    const reminder = screen.getByRole('dialog', { name: 'Travel scenario' });
    expect(within(reminder).getByText('Washington, DC')).toBeVisible();
    expect(within(reminder).getByText('$2,400 total')).toBeVisible();
    await user.click(within(reminder).getByRole('button', { name: 'Back to chat' }));
    expect(screen.queryByRole('dialog', { name: 'Travel scenario' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio')[1]).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Next task' })).toBeEnabled();
  });
  it('retains latest answers on back navigation, presents independent stimuli and completes', async () => {
    const user = await begin();
    expect(screen.getByRole('button', { name: 'Next task' })).toBeDisabled();
    await sendTaskMessage(user, 'Could you help me choose a room?');
    await user.click(screen.getAllByRole('radio')[1]);
    await user.click(screen.getByRole('button', { name: 'Next task' }));
    expect(screen.getByRole('heading', { name: 'When a plan needs a rethink' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Your message' })).toHaveValue('');
    expect(screen.getByText('Could you help me choose a room?')).not.toBeVisible();
    await user.click(screen.getByText('Previous task · Finding a place to stay'));
    expect(screen.getByText('Could you help me choose a room?')).toBeVisible();
    const stimulus = screen.getByText(/In this independent example, Union Hotel/).textContent;
    await user.click(screen.getByRole('button', { name: /^Back$/ }));
    expect(screen.getByText('Could you help me choose a room?')).toBeVisible();
    expect(screen.getAllByRole('radio')[1]).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getAllByRole('radio')[3]);
    await user.click(screen.getByRole('button', { name: 'Next task' }));
    expect(screen.getByText(/In this independent example, Union Hotel/).textContent).toBe(stimulus);
    await sendTaskMessage(user);
    await user.click(screen.getAllByRole('radio')[0]);
    await user.click(screen.getByRole('button', { name: 'Next scenario' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A weekend by the coast');
    await user.click(screen.getByRole('button', { name: /Begin scenario/ }));
    expect(screen.queryByText('Previous task · Finding a place to stay')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your message' })).toHaveValue('');
    await sendTaskMessage(user);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    await user.click(screen.getAllByRole('radio')[1]);
    await user.click(screen.getByRole('button', { name: 'Next task' }));
    await sendTaskMessage(user);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    await user.click(screen.getAllByRole('radio')[0]);
    await user.click(screen.getByRole('button', { name: 'Finish study' }));
    expect(screen.getByRole('button', { name: /Download responses/ })).toBeEnabled();
    expect(screen.getByText(/4 checkpoints answered across 2 scenarios/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Next participant/ }));
    const dialog = screen.getByRole('dialog', { name: /Ready for/ });
    expect(within(dialog).getByRole('button', { name: /Confirm reset/ })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: /Keep session/ }));
    expect(screen.getByRole('button', { name: /Download responses/ })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /Next participant/ }));
    await user.click(screen.getByRole('button', { name: /Confirm reset/ }));
    expect(screen.getByRole('button', { name: /Start Study/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Start Study/ }));
    await user.click(screen.getByRole('button', { name: /Begin scenario/ }));
    expect(screen.getByRole('textbox', { name: 'Your message' })).toHaveValue('');
    await sendTaskMessage(user);
    expect(screen.getAllByRole('radio').every(radio => radio.getAttribute('aria-checked') === 'false')).toBe(true);
  });
  it('supports radio arrow keys, Enter selection and disabled back navigation', async () => {
    const content = structuredClone(study);
    content.settings.allowBackNavigation = false;
    const user = userEvent.setup();
    render(<App initialStudy={content} />);
    await user.click(screen.getByRole('button', { name: /Start Study/ }));
    await user.click(screen.getByRole('button', { name: /Begin scenario/ }));
    await sendTaskMessage(user);
    const radios = screen.getAllByRole('radio');
    radios[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{End}');
    const manual = screen.getByRole('radio', { name: /I’d compare the hotels and make this choice myself/ });
    expect(manual).toHaveFocus();
    expect(manual).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Home}{Enter}');
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: /^Back$/ })).toBeDisabled();
  });
  it('rejects invalid JSON and activates a validated import directly', async () => {
    const user = userEvent.setup();
    render(<App initialStudy={study} />);
    await user.click(screen.getByRole('button', { name: /Researcher/ }));
    const editor = screen.getByLabelText('Paste or edit study JSON');
    fireEvent.change(editor, { target: { value: '{invalid' } });
    await user.click(screen.getByRole('button', { name: /Validate JSON/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('JSON syntax');
    expect(screen.getByRole('alert')).toHaveTextContent('active configuration has been kept');
    const imported = structuredClone(study);
    imported.title = 'A replacement study';
    imported.scenarios.reverse();
    fireEvent.change(editor, { target: { value: JSON.stringify(imported) } });
    await user.click(screen.getByRole('button', { name: /Validate JSON/ }));
    expect(screen.getByRole('button', { name: /Activate study/ })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /Activate study/ }));
    expect(screen.getByText(/Study activated/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A replacement study');
    await user.click(screen.getByRole('button', { name: /Start Study/ }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A weekend by the coast');
  });
  it('keeps an uploaded and validated study ready to activate after ending the current session', async () => {
    const user = await begin();
    await sendTaskMessage(user, 'Participant message');
    await user.click(screen.getAllByRole('radio')[0]);
    await user.click(screen.getByRole('button', { name: /^Researcher/ }));
    const researcher = within(screen.getByRole('dialog', { name: 'Researcher workspace' }));
    const imported = { ...study, title: 'Uploaded study' };
    const json = JSON.stringify(imported);
    const file = new File([json], 'study.json', { type: 'application/json' });
    // jsdom does not implement Blob.text().
    Object.assign(file, { text: async () => json });
    await user.upload(researcher.getByLabelText('Upload study JSON'), file);
    await researcher.findByDisplayValue(json);
    await user.click(researcher.getByRole('button', { name: 'Validate JSON' }));
    const activate = researcher.getByRole('button', { name: 'Activate study' });
    expect(activate).toBeDisabled();
    await user.click(researcher.getByRole('button', { name: 'End / reset session' }));
    const reset = within(screen.getByRole('dialog', { name: /Ready for/ }));
    expect(reset.getByRole('button', { name: 'Confirm reset' })).toBeEnabled();
    await user.click(reset.getByRole('button', { name: 'Confirm reset' }));
    expect(researcher.getByText('No active session')).toBeVisible();
    expect(activate).toBeEnabled();
    await user.click(activate);
    await user.click(researcher.getByRole('button', { name: 'Close dialog' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Uploaded study');
    expect(screen.getByRole('button', { name: 'Start Study' })).toBeVisible();
  });
  it('renders HTML-like stimulus text literally and never reveals metadata', async () => {
    const content = structuredClone(study);
    content.scenarios[0].checkpoints[0].context = [{ type: 'paragraph', text: '<script>window.stolen=true</script>' }];
    const user = userEvent.setup();
    render(<App initialStudy={content} />);
    await user.click(screen.getByRole('button', { name: /Start Study/ }));
    await user.click(screen.getByRole('button', { name: /Begin scenario/ }));
    expect(screen.getByText('<script>window.stolen=true</script>')).toBeVisible();
    expect(screen.queryByText('Preferred hotel-selection authority')).not.toBeInTheDocument();
    expect(document.querySelectorAll('script')).toHaveLength(0);
  });
});
