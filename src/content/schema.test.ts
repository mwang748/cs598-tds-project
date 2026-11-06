import { describe, expect, it } from 'vitest';
import example from '../../public/study.default.json';
import template from '../../public/study.template.json';
import { checkpointCount, validateStudy } from './schema';

describe('researcher content validation', () => {
  it('accepts the draft and the editable starter template', () => {
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
