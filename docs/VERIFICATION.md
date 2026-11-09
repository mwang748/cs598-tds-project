# Verification record

All interactions used fictional example content. No real participant data was collected.

## Automated checks

`npm test` covers:

- Example and starter validation; JSON-only scenario/checkpoint/option addition, removal and reordering; variable option counts.
- Empty content, whitespace-only required text, duplicate IDs, malformed tables, invalid JSON, unsupported versions and question types, and checkpoint IDs shared across scenarios.
- Helpful field paths and IDs. Invalid imports retain the active study. Validated imports can be activated as soon as the current session ends.
- Keyboard arrow, Home, End and Enter controls; back-navigation settings; selection retention and latest-answer replacement.
- Unchanged later stimuli after earlier choices. Literal HTML-like content and hidden researcher metadata.
- Full participant completion, direct confirmation of reset, cancelled reset preserving answers, and fresh sessions clearing selections.
- Complete and partial workbook data, exact questions/responses/IDs, all unanswered rows, scenario factors and positions.
- XLSX write/read round trip, literal formula-like strings, long responses, wrapped text and row height, bold headers, frozen panes, filters and no response-sheet merges.
- CSV quoting, BOM, formula-injection protection and timezone-based filenames.

`npm run build` performs strict TypeScript checking and builds the app. ExcelJS is loaded only when an export is requested. Vite reports a large export-library chunk; that chunk does not block the participant interface.

## Browser checks

Tested through the actual localhost Vite server in the desktop in-app browser:

- Welcome → scenario introduction → comparison table, traveler bubble and four alternatives.
- Keyboard arrow selection with visible focus and selection states.
- Independent recovery checkpoint and transition to the next scenario.
- Different option counts, final completion, prominent Excel download and CSV fallback.
- Actual partial and complete XLSX downloads, then reopened with ExcelJS to verify 4 response rows, Partial/Complete status, 2/4 versus 4/4 answers, correct first answer ID and question wording.
- Actual CSV download with the expected header and selected response row.
- Invalid JSON shows syntax errors without replacing content.

Browser QA session `P-01c6026519af` and its downloads are fictional test data. The QA session was reset after export. The separate reproducible sample uses `P-TESTONLY` and `[TEST DATA]` in the study title to distinguish it from research results.

## Workbook visual check

The sample workbook was imported and rendered with the bundled spreadsheet renderer. Both sheets were visually inspected: readable headers, no clipped values or timestamps, wrapped full response text, aligned rows and alternating shading. The export unit test additionally checks a response longer than 1,000 characters and preserves exact wording after XLSX reload. Native Excel rendering was not tested.
