# Waypoint · Travel planning preference study

A desktop-first React + TypeScript + Vite app for a university HCI preference study. Scenarios and replies are prewritten in JSON. The app defaults to local Excel/CSV export and can optionally save completed sessions to private storage on the study site.

The participant view is a simple chat mockup. Alternative responses look like selectable message bubbles, and the hamburger button reopens the current scenario details. There is no persistent header or study journey sidebar. Researcher tools are available through the small **Researcher** link beneath the chat.

## Install and run

Install [Node.js](https://nodejs.org/) 22 LTS or newer. In PowerShell:

```powershell
cd "C:\Users\minch\Code\cs598-tds-project"
npm ci
npm run dev
```

Open the Local URL printed by Vite, normally **http://127.0.0.1:5173**. The server listens on loopback only. Keep the terminal running. Press Ctrl+C when finished. Internet is needed for dependency installation, then the study and export work locally. No remote fonts or assets are loaded.

```powershell
npm test          # validation, session, export and participant/researcher flow tests
npm run build    # TypeScript checks and production build
npm run preview  # serve the production build on loopback
npm run sample   # regenerate the clearly marked test-data workbook
```

## Run one participant

1. Review the fictional example stimuli before research use. Replace them with your own study content.
2. Open the app. Read the instructions and click **Start study**. The app generates an anonymous ID, without collecting identifying information.
3. Read each scenario brief and click **Begin scenario**. For each **New task**, type a message and select **Send**. Choose an AI reply or select an option under **Do it yourself**, when available. Where a follow-up is provided, you can also write your own approach. **Next task** collapses the exchange. **Next scenario** introduces a fresh trip. The exports record selected options and written follow-up answers. The opening chat messages stay in memory for display.
4. Use **Back** to review or change answers, if enabled in the JSON. Responses use stable IDs and exports retain the latest selection.
5. At completion, click **Download responses** for a formatted `.xlsx`. CSV is available as a fallback. Check your browser’s download list and retain the file. Downloading does not clear answers or prove that a file was permanently saved.
6. Click **Next participant**, download if needed, then click **Confirm reset**. This clears responses and returns to the welcome screen. The next **Start study** generates a new ID. Cancelling keeps the existing session.

For an early departure, choose **Researcher → Export partial**. A partial workbook includes every checkpoint, with unanswered rows explicitly marked. End/reset through that workspace before the next participant.

**Refresh and closing can lose responses.** Answers are held in memory, and there is no persistent session recovery. The footer reminds participants; a best-effort `beforeunload` warning runs while answers have changed since the last download request. Browsers control whether they show it. Retain every download before resetting, refreshing or closing.

## Store results on the study site

1. In Vercel, create a **Private** Blob store and connect it to the study project for **Production**. The connection adds `BLOB_READ_WRITE_TOKEN` on the server.
2. In the project’s Production environment, set `VITE_SITE_RESULTS_ENABLED=true` and add a long, unique `RESEARCHER_RESULTS_PASSWORD` as a **Secret**. Keep the password with the study team.
3. Redeploy from this branch. Finish a test run and open **Researcher → Saved results**. After entering the password, expand a session to review its answers. Use **Load more** if shown, then **Download all results (.csv)** to export one row per answered task.

The site saves a completed session when the participant clicks **Finish study**. If saving cannot be confirmed, use **Retry saving responses** or download a local copy. Studies activated from JSON use the local flow. Excel and CSV downloads are also available for partial sessions.

## Change the study through JSON

- Boston travel study / startup content: [`public/study.default.json`](public/study.default.json).
- Minimal editable starter: [`public/study.template.json`](public/study.template.json).
- Full format and validation rules: [`docs/JSON_FORMAT.md`](docs/JSON_FORMAT.md).
- Types and runtime Zod schema: [`src/content/schema.ts`](src/content/schema.ts).

Use **Researcher** to upload a `.json` file or paste text. Click **Validate JSON**. Invalid content shows field paths and available scenario/checkpoint IDs; the active study remains intact. A valid candidate shows its title, version, scenarios and counts. Click **Activate study** to use it for the next participant. If a session is active, use **End / reset session** first. The researcher workspace stays open with the validated file ready to activate.

Imported content lasts only until refresh. To change startup content permanently, save the validated JSON over `public/study.default.json` and reload between sessions. Add/remove/reorder scenarios, checkpoints and options directly in their arrays. Titles, questions, constraints, products, prices and dates all come from JSON. Settings and factors have no hidden effect on stimuli. No response randomization or branching occurs.

## Workbook and CSV

The production export function also generates [`outputs/sample/TEST-DATA_travel-study_P-TESTONLY_2026-11-05_1430.xlsx`](outputs/sample/TEST-DATA_travel-study_P-TESTONLY_2026-11-05_1430.xlsx). The study title and session ID explicitly identify this as fictional test data. It is not a participant record.

Each Excel workbook has **Session summary** and **Responses** sheets, bold headers, frozen first rows, filters, wrapped text, readable column widths and alternating row shading. The response sheet has one unmerged row per checkpoint, in JSON order. Scenario factors become individual columns named `Factor: <key>` using the union of authored factor keys. Checkpoint positions are local to their scenario, starting at 1. Dates include the session’s IANA timezone, the applicable offset, and UTC timestamps. Selecting **Finish study** with every question answered marks the session Complete. Earlier exports are Partial.

XLSX exports write strings as literal values, including strings beginning with `=`. CSV contains the same response table and UTF-8 BOM, with quoted fields and escaped quotes. To prevent formula evaluation in spreadsheet software, CSV prefixes a single apostrophe to formula-like fields (including leading whitespace followed by `=`, `+`, `-`, `@`, tabs or line breaks). Use XLSX for exact unmodified text. CSV does not contain the session summary; keep the XLSX when session metadata is needed.

## Code map

```text
public/                    editable default + starter JSON, local favicon
src/content/schema.ts      JSON types, validation and counts
src/session/session.ts     anonymous sessions, latest answers and navigation
src/components/            blocks, reply bubbles, scenario reminder and researcher UI
src/export/responses.ts    analysis rows, workbook, CSV and browser downloads
src/App.tsx                participant flow and researcher workspace
src/styles.css             desktop layout and accessible interaction styles
scripts/generate-sample.ts reproducible test-data workbook from the real exporter
```

Tab moves between controls. In the message box, Enter sends and Shift+Enter inserts a line break. Arrow keys change the focused reply, Home/End jump within the reply group, and Space/Enter select. Native dialogs trap focus, support Escape, and restore focus on close. Motion respects the operating system’s reduced-motion preference.

## Scope

The Boston travel study uses four combinations of budget and schedule. Each scenario contains flight selection, reservation preparation, hotel selection, and room and rate selection in that order. Add further tasks for a condition to that scenario’s `checkpoints` array. Each task presents four fixed replies and a written follow-up. The demonstration study used by the sample workbook lives in `src/test/fixtures/study.example.json`.
