import { mkdir } from 'node:fs/promises';
import example from '../src/test/fixtures/study.example.json';
import { studySchema } from '../src/content/schema';
import { chooseAnswer, type ParticipantSession } from '../src/session/session';
import { buildWorkbook } from '../src/export/responses';

const study = studySchema.parse(example);
study.title = '[TEST DATA] ' + study.title;
let session: ParticipantSession = {
  id: 'P-TESTONLY', startedAt: '2026-11-05T20:00:00.000Z', timezone: 'America/Chicago',
  answers: {}, revision: 0, exportedRevision: -1, completed: false,
};
study.scenarios.forEach((scenario, si) => scenario.checkpoints.forEach((checkpoint, ci) => {
  session = chooseAnswer(session, study, si, ci, checkpoint.options[0].id);
}));
session.completed = true;
const workbook = await buildWorkbook(study, session, new Date('2026-11-05T20:30:00.000Z'));
await mkdir('outputs/sample', { recursive: true });
const path = 'outputs/sample/TEST-DATA_travel-study_P-TESTONLY_2026-11-05_1430.xlsx';
await workbook.xlsx.writeFile(path);
console.log(`Generated ${path} using the app’s export function. Fictional test data only.`);
