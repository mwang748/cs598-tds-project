import ExcelJS from 'exceljs';
import type { Study } from '../content/schema';
import { answerKey, countAnswered, isComplete, type ParticipantSession } from '../session/session';
import { checkpointCount } from '../content/schema';
import type { ResultRecord } from '../results/record';

/** One rectangular record per checkpoint, in authored order. */
export function responseData(study: Study, session: ParticipantSession) {
  const factorKeys = [...new Set(study.scenarios.flatMap(scenario => Object.keys(scenario.factors ?? {})))];
  const includeFollowUps = study.scenarios.some(scenario => scenario.checkpoints.some(checkpoint => checkpoint.followUp));
  const followUpHeaders = includeFollowUps ? ['Follow-up question', 'Follow-up response'] : [];
  const headers = ['Scenario position', 'Scenario ID', 'Scenario title', ...factorKeys.map(key => `Factor: ${key}`), 'Checkpoint position', 'Checkpoint ID', 'Checkpoint title', 'Question', 'Selected option ID', 'Selected response text', ...followUpHeaders, 'Status'];
  const rows = study.scenarios.flatMap((scenario, si) => scenario.checkpoints.map((checkpoint, ci) => {
    const key = answerKey(scenario.id, checkpoint.id);
    const selected = checkpoint.options.find(option => option.id === session.answers[key]);
    const written = checkpoint.followUp ? session.followUps?.[key]?.trim() ?? '' : '';
    const followUpCells = includeFollowUps ? [checkpoint.followUp ?? '', written] : [];
    return [
      si + 1, scenario.id, scenario.title,
      ...factorKeys.map(key => Object.hasOwn(scenario.factors ?? {}, key) ? scenario.factors![key] : ''),
      ci + 1, checkpoint.id, checkpoint.title, checkpoint.question, selected?.id ?? '', selected?.text ?? '',
      ...followUpCells, selected || written ? 'Answered' : 'Unanswered',
    ];
  }));
  return { headers, rows };
}

function zonedTime(iso: string, timezone: string): string {
  const date = new Date(iso);
  return `${new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).format(date)} [${timezone}] (UTC: ${date.toISOString()})`;
}

export async function buildWorkbook(study: Study, session: ParticipantSession, exportedAt = new Date()): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Waypoint research study';
  workbook.created = exportedAt;
  workbook.modified = exportedAt;
  const summary = workbook.addWorksheet('Session summary', { views: [{ state: 'frozen', ySplit: 1 }] });
  summary.columns = [{ width: 29 }, { width: 110 }];
  summary.addRows([
    ['Session field', 'Value'],
    ['Study title', study.title], ['Study ID', study.studyId], ['Content version', study.contentVersion],
    ['Anonymous session ID', session.id], ['Session start', zonedTime(session.startedAt, session.timezone)],
    ['Export date/time', zonedTime(exportedAt.toISOString(), session.timezone)],
    ['Status', isComplete(study, session) ? 'Complete' : 'Partial'],
    ['Answered checkpoints', countAnswered(study, session)], ['Total checkpoints', checkpointCount(study)],
    ['Collection note', 'This workbook is a browser-generated copy of the participant’s responses.'],
  ]);
  summary.autoFilter = 'A1:B11';
  const data = responseData(study, session);
  const responses = workbook.addWorksheet('Responses', { views: [{ state: 'frozen', ySplit: 1 }] });
  responses.columns = data.headers.map(header => ({
    width: header === 'Selected response text' || header === 'Follow-up response' ? 78
      : header === 'Question' || header === 'Follow-up question' ? 58
      : header.endsWith('title') ? 34 : header.includes('position') ? 16 : 24,
  }));
  responses.addRow(data.headers);
  responses.addRows(data.rows);
  responses.autoFilter = { from: { row: 1, column: 1 }, to: { row: data.rows.length + 1, column: data.headers.length } };
  for (const sheet of [summary, responses]) {
    sheet.properties.defaultRowHeight = 25;
    sheet.eachRow((row, ri) => {
      let lines = 1;
      row.eachCell({ includeEmpty: true }, (cell, ci) => {
        // Values are strings/numbers, never ExcelJS formula objects or hyperlinks.
        cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF263B37' } };
        cell.alignment = { vertical: 'top', wrapText: true };
        const width = sheet.getColumn(ci).width ?? 24;
        const value = String(cell.value ?? '');
        lines = Math.max(lines, ...value.split(/\r?\n/).map(line => Math.ceil(line.length / Math.max(1, width - 5)) || 1));
        if (ri > 1 && ri % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F6F3' } };
      });
      row.height = Math.min(409, Math.max(30, lines * 17 + 14));
      if (ri === 1) {
        row.height = 33;
        row.eachCell(cell => {
          cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176553' } };
        });
      }
    });
  }
  return workbook;
}

/** CSV readers may evaluate formula-like strings, even when quoted. Prefix those only. XLSX retains exact text. */
export function safeCsvCell(value: string | number): string {
  const literal = String(value);
  const safe = /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(literal) ? `'${literal}` : literal;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function buildCsv(study: Study, session: ParticipantSession): string {
  const { headers, rows } = responseData(study, session);
  return '\uFEFF' + [headers, ...rows].map(row => row.map(safeCsvCell).join(',')).join('\r\n');
}

export function exportFilename(session: ParticipantSession, extension: 'xlsx' | 'csv', now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: session.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `travel-study_${session.id}_${get('year')}-${get('month')}-${get('day')}_${get('hour')}${get('minute')}.${extension}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadStoredResults(records: ResultRecord[]) {
  const headers = ['Participant ID', 'Study ID', 'Content version', 'Saved at (UTC)', 'Scenario ID', 'Scenario', 'Budget', 'Schedule', 'Task ID', 'Task', 'Selected option ID', 'Selected response', 'Written follow-up'];
  const rows = records.flatMap(record => record.responses.map(response => [
    record.participantId, record.studyId, record.contentVersion, record.savedAt,
    response.scenarioId, response.scenarioTitle, response.budget, response.schedule, response.taskId, response.taskTitle,
    response.optionId, response.optionText, response.followUp,
  ]));
  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(safeCsvCell).join(',')).join('\r\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'travel-study-results.csv');
}
export async function downloadResponses(study: Study, session: ParticipantSession, format: 'xlsx' | 'csv') {
  if (format === 'csv') download(new Blob([buildCsv(study, session)], { type: 'text/csv;charset=utf-8' }), exportFilename(session, format));
  else {
    const workbook = await buildWorkbook(study, session);
    const bytes = await workbook.xlsx.writeBuffer();
    download(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), exportFilename(session, format));
  }
}
