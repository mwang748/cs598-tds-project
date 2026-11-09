import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import boston from '../../public/study.default.json';
import example from '../test/fixtures/study.example.json';
import { studySchema } from '../content/schema';
import { answerKey, chooseAnswer, countAnswered, createSession, hasUnexportedAnswers, nextCheckpoint, previousRoute, writeFollowUp } from '../session/session';
import { buildCsv, buildWorkbook, exportFilename, responseData, safeCsvCell } from './responses';

const study = studySchema.parse(example);
describe('state and export integrity', () => {
  it('exports a Boston written approach as answered with a blank option ID', async () => {
    const content = studySchema.parse(boston);
    const key = answerKey('tight-tight', 'hotel-selection');
    const written = 'I would start with a map of the area.';
    const session = writeFollowUp(createSession(), key, written);
    expect(countAnswered(content, session)).toBe(1);
    expect(hasUnexportedAnswers(session)).toBe(true);
    const { headers, rows } = responseData(content, session);
    expect(rows).toHaveLength(16);
    const rowIndex = rows.findIndex(row => row[headers.indexOf('Scenario ID')] === 'tight-tight' && row[headers.indexOf('Checkpoint ID')] === 'hotel-selection');
    expect(rowIndex).toBe(2);
    const row = rows[rowIndex];
    expect(row[headers.indexOf('Selected option ID')]).toBe('');
    expect(row[headers.indexOf('Follow-up response')]).toBe(written);
    expect(row.at(-1)).toBe('Answered');
    expect(buildCsv(content, session)).toContain(written);
    const workbook = await buildWorkbook(content, session);
    expect(workbook.getWorksheet('Responses')!.getCell(rowIndex + 2, headers.indexOf('Follow-up response') + 1).value).toBe(written);
  });

  it('generates an anonymous session and tracks latest answers without changing stimuli', () => {
    let session = createSession();
    expect(session.id).toMatch(/^P-[a-f0-9]{12}$/);
    const before = JSON.stringify(study);
    session = chooseAnswer(session, study, 0, 0, 'compare');
    session = chooseAnswer(session, study, 0, 0, 'manual');
    expect(session.answers[answerKey('city-fixed', 'hotel-selection')]).toBe('manual');
    expect(responseData(study, session).rows[0]).toContain('manual');
    expect(JSON.stringify(study)).toBe(before);
    expect(hasUnexportedAnswers(session)).toBe(true);
    session.exportedRevision = session.revision;
    expect(hasUnexportedAnswers(session)).toBe(false);
    session = chooseAnswer(session, study, 0, 0, 'recommend');
    expect(hasUnexportedAnswers(session)).toBe(true);
  });
  it('calculates authored transitions for arbitrary content and back navigation', () => {
    expect(nextCheckpoint(study, 0, 0)).toEqual({ screen: 'checkpoint', scenarioIndex: 0, checkpointIndex: 1 });
    expect(nextCheckpoint(study, 0, 1)).toEqual({ screen: 'intro', scenarioIndex: 1 });
    expect(previousRoute(study, { screen: 'intro', scenarioIndex: 1 })).toEqual({ screen: 'checkpoint', scenarioIndex: 0, checkpointIndex: 1 });
    expect(nextCheckpoint(study, 1, 1)).toEqual({ screen: 'complete' });
  });
  it('includes unanswered checkpoints, exact wording, factors, IDs and numeric positions in partial exports', async () => {
    const session = chooseAnswer(createSession(), study, 0, 0, 'recommend');
    const { headers, rows } = responseData(study, session);
    expect(rows).toHaveLength(4);
    expect(rows[0][headers.indexOf('Question')]).toBe(study.scenarios[0].checkpoints[0].question);
    expect(rows[0][headers.indexOf('Selected response text')]).toBe(study.scenarios[0].checkpoints[0].options[1].text);
    expect(rows[0][headers.indexOf('Factor: schedule')]).toBe('fixed');
    expect(rows[1].at(-1)).toBe('Unanswered');
    expect(rows[3][0]).toBe(2);
    const workbook = await buildWorkbook(study, session);
    expect(workbook.worksheets.map(s => s.name)).toEqual(['Session summary', 'Responses']);
    expect(workbook.getWorksheet('Session summary')!.getCell('B8').value).toBe('Partial');
    expect(workbook.getWorksheet('Responses')!.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(workbook.getWorksheet('Responses')!.autoFilter).toBeTruthy();
  });
  it('round-trips a complete XLSX and preserves literal formula-like text and long answers', async () => {
    const content = structuredClone(study);
    content.scenarios[0].checkpoints[0].options[0].text = '=HYPERLINK("https://example.invalid")\n' + 'A long fictional test response. '.repeat(45);
    let session = createSession();
    content.scenarios.forEach((s, si) => s.checkpoints.forEach((c, ci) => { session = chooseAnswer(session, content, si, ci, c.options[0].id); }));
    session.completed = true;
    const workbook = await buildWorkbook(content, session, new Date('2026-11-05T20:30:00Z'));
    const bytes = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(bytes);
    const sheet = reopened.getWorksheet('Responses')!;
    const { headers } = responseData(content, session);
    const cell = sheet.getCell(2, headers.indexOf('Selected response text') + 1);
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.value).toBe(content.scenarios[0].checkpoints[0].options[0].text);
    expect(cell.alignment.wrapText).toBe(true);
    expect(sheet.getRow(2).height).toBeGreaterThan(100);
    expect(reopened.getWorksheet('Session summary')!.getCell('B8').value).toBe('Complete');
    expect(String(reopened.getWorksheet('Session summary')!.getCell('B7').value)).toContain(session.timezone);
    expect(sheet.getRow(1).getCell(1).font.bold).toBe(true);
    expect(Object.keys(sheet.model.merges ?? {})).toHaveLength(0);
    expect(responseData(content, session).rows.every(row => row.at(-1) === 'Answered')).toBe(true);
  });
  it('quotes CSV safely, includes all rows and guards spreadsheet formula injection', () => {
    expect(safeCsvCell('=1+1')).toBe('"\'=1+1"');
    expect(safeCsvCell('  @SUM(1)')).toBe('"\'  @SUM(1)"');
    expect(safeCsvCell('Hello, "traveler"')).toBe('"Hello, ""traveler"""');
    const csv = buildCsv(study, createSession());
    expect(csv.split('\r\n')).toHaveLength(5);
    expect(csv).toContain('"Unanswered"');
    expect(exportFilename({ ...createSession(), id: 'P-TESTONLY', timezone: 'America/Chicago' }, 'xlsx', new Date('2026-11-05T20:30:00Z'))).toBe('travel-study_P-TESTONLY_2026-11-05_1430.xlsx');
  });
});
