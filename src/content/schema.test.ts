import { describe, expect, it } from 'vitest';
import boston from '../../public/study.default.json';
import example from '../test/fixtures/study.example.json';
import template from '../../public/study.template.json';
import { checkpointCount, validateStudy } from './schema';

describe('researcher content validation', () => {
  it('keeps the trip overview to its original six fields without section assumptions', () => {
    boston.scenarios.forEach(scenario => {
      expect(scenario.summary.map(item => item.label)).toEqual(['Route', 'Flight budget', 'Flight departure', 'Hotel budget', 'Hotel stay dates', 'Travel party']);
    });
  });
  it('uses consistent headings and states the 12-to-3 shortlist in the fourth flight question', () => {
    const task = boston.scenarios.find(scenario => scenario.id === 'flexible-flexible')!.checkpoints.find(checkpoint => checkpoint.id === 'flight-selection')!;
    expect(task.options.find(option => option.id === 'A')!.text).toMatch(/^Search and choose myself\n\n/);
    const search = task.options.find(option => option.id === 'B')!.text;
    expect(search).toMatch(/^Chatbot searches; I choose\n\n/);
    expect(search.split('\n').filter(line => line.startsWith('- '))).toHaveLength(12);
    const recommendation = task.options.find(option => option.id === 'C')!.text;
    expect(recommendation).toContain('I found 12 flights that meet your requirements. Here are 3 I recommend comparing.');
    expect(recommendation.split('\n').filter(line => line.startsWith('- '))).toHaveLength(3);
    expect(recommendation).toContain('You make the final choice.');
  });
  it('makes the higher-budget fixed-schedule conditions and shortlist tradeoffs explicit', () => {
    const task = boston.scenarios.find(scenario => scenario.id === 'flexible-tight')!.checkpoints.find(checkpoint => checkpoint.id === 'flight-selection')!;
    const context = JSON.stringify(task.context);
    expect(context).toContain('Budget: $700 maximum, including taxes and one checked bag.');
    expect(context).toContain('Required departure: Friday, 9 a.m.–noon CT.');
    expect(context).toContain('prefer 10 a.m.–noon when the price is reasonable.');
    expect(context).not.toContain('You will first choose');
    const recommendation = task.options.find(option => option.id === 'C')!.text;
    expect(recommendation).toContain('I found 5 flights that meet your requirements. Here are 3 I recommend comparing:');
    expect(recommendation).toContain('MJ 314 leaves 50 minutes earlier than LF 222 but costs $120 more.');
    expect(task.options.find(option => option.id === 'D')!.text).toContain('without asking for approval');
  });
  it('keeps flight recommendations as shortlists with the final choice left to the user', () => {
    boston.scenarios.forEach((scenario, index) => {
      const task = scenario.checkpoints.find(checkpoint => checkpoint.id === 'flight-selection')!;
      const recommendation = task.options.find(option => option.id === 'C')!.text;
      expect(recommendation).toContain('Chatbot recommends a shortlist; I choose');
      expect(recommendation).toContain('You make the final choice');
      expect(recommendation).not.toMatch(/approve|I selected/);
      expect(recommendation.split('\n').filter(line => line.startsWith('- '))).toHaveLength([1, 3, 3, 3][index]);
    });
  });
  it('does not assume a preferred departure window in flexible-schedule flight tasks', () => {
    boston.scenarios.filter(scenario => scenario.factors.schedule === 'flexible').forEach(scenario => {
      const task = scenario.checkpoints.find(checkpoint => checkpoint.id === 'flight-selection')!;
      const context = JSON.stringify(task.context);
      expect(context).toContain('you have no preferred departure time.');
      expect(context).not.toContain('Consider the tradeoff');
      expect(context).not.toContain('10 a.m.');
      const recommendation = task.options.find(option => option.id === 'C')!.text;
      const automatic = task.options.find(option => option.id === 'D')!.text;
      expect(recommendation + automatic).not.toMatch(/preferred.*window/);
      expect(automatic).toContain('I selected HarborLink HL 120 ($310).');
      expect(automatic).toContain('without asking for approval');
      expect(recommendation).toContain('HarborLink Airways HL 120');
    });
  });
  it('accepts the draft and the editable starter template', () => {
    expect(validateStudy(JSON.stringify(boston)).success).toBe(true);
    expect(validateStudy(JSON.stringify(example)).success).toBe(true);
    expect(validateStudy(JSON.stringify(template)).success).toBe(true);
  });
  it('supports JSON-only insertion, removal, reordering, arbitrary factors and varied option counts', () => {
    const content = structuredClone(example);
    content.scenarios.reverse();
    content.scenarios[0].checkpoints.reverse();
    content.scenarios[0].checkpoints[0].options.reverse();
    content.scenarios[1].checkpoints.pop();
    const added = structuredClone(content.scenarios[0]);
    added.id = 'another-scenario';
    content.scenarios.push(added);
    const result = validateStudy(JSON.stringify(content));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.study.scenarios.map(s => s.id)).toEqual(['coast-flexible', 'city-fixed', 'another-scenario']);
      expect(checkpointCount(result.study)).toBe(5);
      expect(result.study.scenarios[0].checkpoints[0].options[0].id).toBe('manual');
    }
  });
  it.each([
    ['empty study', (c: any) => { c.scenarios = []; }, 'scenarios'],
    ['blank text', (c: any) => { c.scenarios[0].checkpoints[0].question = '  '; }, 'question'],
    ['duplicate scenario', (c: any) => { c.scenarios.push(c.scenarios[0]); }, 'Duplicate ID'],
    ['duplicate checkpoint', (c: any) => { c.scenarios[0].checkpoints.push(c.scenarios[0].checkpoints[0]); }, 'Duplicate ID'],
    ['duplicate option', (c: any) => { c.scenarios[0].checkpoints[0].options.push(c.scenarios[0].checkpoints[0].options[0]); }, 'Duplicate ID'],
    ['malformed table', (c: any) => { c.scenarios[0].checkpoints[0].context[1].rows[0].pop(); }, 'Expected 3 cells'],
    ['unsupported version', (c: any) => { c.schemaVersion = '2.0'; }, 'schemaVersion'],
    ['unsupported question type', (c: any) => { c.scenarios[0].checkpoints[0].responseType = 'multi-choice'; }, 'responseType'],
    ['empty options', (c: any) => { c.scenarios[0].checkpoints[0].options = []; }, 'options'],
    ['unknown first task', (c: any) => { c.settings.firstTaskId = 'missing-task'; }, 'firstTaskId'],
    ['unknown ordered task', (c: any) => { c.settings.taskOrder = ['missing-task']; }, 'taskOrder'],
    ['duplicate ordered task', (c: any) => { c.settings.taskOrder = ['hotel-selection', 'hotel-selection']; }, 'duplicate'],
  ])('rejects %s with a field path', (_name, mutate, message) => {
    const content = structuredClone(example);
    mutate(content);
    const result = validateStudy(JSON.stringify(content));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.join('\n')).toContain(message);
  });
  it('allows the same checkpoint ID in separate scenarios', () => {
    const content = structuredClone(example);
    content.scenarios[1].checkpoints[0].id = content.scenarios[0].checkpoints[0].id;
    expect(validateStudy(JSON.stringify(content)).success).toBe(true);
  });
  it('identifies scenario, checkpoint and field, and handles invalid JSON safely', () => {
    const content = structuredClone(example);
    content.scenarios[0].checkpoints[0].question = '';
    const result = validateStudy(JSON.stringify(content));
    if (!result.success) expect(result.errors[0]).toMatch(/question.*city-fixed.*hotel-selection/);
    for (const input of ['{', 'null', '[]', '"text"', '{"scenarios":[null]}']) expect(validateStudy(input).success).toBe(false);
  });
});
