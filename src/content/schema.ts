import { z } from 'zod';

const text = z.string().refine(value => value.trim().length > 0, 'Required text cannot be blank');
const id = text.refine(value => value.trim() === value, 'IDs cannot start or end with whitespace');

export const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text }).strict(),
  z.object({ type: z.literal('bullet-list'), items: z.array(text).min(1, 'Add at least one list item') }).strict(),
  z.object({ type: z.literal('table'), columns: z.array(text).min(1), rows: z.array(z.array(z.string())).min(1) }).strict(),
]);

const optionSchema = z.object({ id, kind: z.enum(['manual', 'chatbot']), text }).strict();
const checkpointSchema = z.object({
  id, title: text,
  context: z.array(blockSchema).optional(),
  taskInstruction: text.optional(),
  travelerMessage: text.optional(),
  question: text,
  responseType: z.literal('single-choice'),
  options: z.array(optionSchema).min(1, 'Add at least one response option'),
  researcherMetadata: z.record(z.unknown()).optional(),
}).strict();

const scenarioSchema = z.object({
  id, title: text,
  factors: z.record(text).optional(),
  introduction: z.array(blockSchema).min(1, 'Add at least one introduction block'),
  summary: z.array(z.object({ label: text, value: text }).strict()).min(1, 'Add at least one summary item'),
  checkpoints: z.array(checkpointSchema).min(1, 'Add at least one checkpoint'),
}).strict();

export const studySchema = z.object({
  schemaVersion: z.literal('1.0'),
  studyId: id,
  contentVersion: text,
  title: text,
  stimulusLabel: text.optional(),
  instructions: z.array(text).min(1, 'Add at least one instruction'),
  settings: z.object({ allowBackNavigation: z.boolean() }).strict(),
  scenarios: z.array(scenarioSchema).min(1, 'A study needs at least one scenario'),
}).strict().superRefine((study, ctx) => {
  const unique = (items: { id: string }[], path: (string | number)[]) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) ctx.addIssue({ code: 'custom', path: [...path, index, 'id'], message: `Duplicate ID "${item.id}"` });
      seen.add(item.id);
    });
  };
  const tables = (blocks: Block[] | undefined, path: (string | number)[]) => {
    blocks?.forEach((block, bi) => {
      if (block.type === 'table') block.rows.forEach((row, ri) => {
        if (row.length !== block.columns.length) ctx.addIssue({ code: 'custom', path: [...path, bi, 'rows', ri], message: `Expected ${block.columns.length} cells; received ${row.length}` });
      });
    });
  };
  unique(study.scenarios, ['scenarios']);
  study.scenarios.forEach((scenario, si) => {
    unique(scenario.checkpoints, ['scenarios', si, 'checkpoints']);
    tables(scenario.introduction, ['scenarios', si, 'introduction']);
    scenario.checkpoints.forEach((checkpoint, ci) => {
      unique(checkpoint.options, ['scenarios', si, 'checkpoints', ci, 'options']);
      tables(checkpoint.context, ['scenarios', si, 'checkpoints', ci, 'context']);
    });
  });
});

export type Block = z.infer<typeof blockSchema>;
export type Study = z.infer<typeof studySchema>;
export type Scenario = Study['scenarios'][number];
export type Checkpoint = Scenario['checkpoints'][number];
export type ResponseOption = Checkpoint['options'][number];

export type ValidationResult = { success: true; study: Study } | { success: false; errors: string[] };

/** Validation never mutates the live configuration. Text remains exactly as authored. */
export function validateStudy(source: string): ValidationResult {
  let raw: unknown;
  try { raw = JSON.parse(source); }
  catch (error) { return { success: false, errors: [`JSON syntax: ${error instanceof Error ? error.message : 'Unable to parse JSON'}`] }; }
  const result = studySchema.safeParse(raw);
  if (result.success) return { success: true, study: result.data };
  const root = raw as Partial<Study> | null;
  return { success: false, errors: result.error.issues.map(issue => {
    const parts = issue.path;
    let label = parts.length ? parts.join('.') : 'study';
    // Add stable IDs to the original field path, even for partially valid input.
    if (parts[0] === 'scenarios' && typeof parts[1] === 'number') {
      const scenario = root?.scenarios?.[parts[1]];
      if (scenario?.id) label += ` — scenario "${scenario.id}"`;
      if (parts[2] === 'checkpoints' && typeof parts[3] === 'number') {
        const cp = scenario?.checkpoints?.[parts[3]];
        if (cp?.id) label += `, checkpoint "${cp.id}"`;
      }
    }
    return `${label}: ${issue.message}`;
  }) };
}

export const checkpointCount = (study: Study) => study.scenarios.reduce((sum, scenario) => sum + scenario.checkpoints.length, 0);
