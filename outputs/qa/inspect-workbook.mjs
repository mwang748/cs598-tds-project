import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load('outputs/sample/TEST-DATA_travel-study_P-TESTONLY_2026-11-05_1430.xlsx'));
console.log((await workbook.inspect({ kind: 'sheet', include: 'id,name', maxChars: 1500 })).ndjson);
for (const [sheetName, range, name] of [
  ['Session summary', 'A1:B11', 'summary'],
  ['Responses', 'H1:M5', 'responses'],
]) {
  const rendered = await workbook.render({ sheetName, range, scale: 1.5, format: 'png' });
  await fs.writeFile(`outputs/qa/${name}.png`, new Uint8Array(await rendered.arrayBuffer()));
  console.log(`Rendered ${name}`);
}
