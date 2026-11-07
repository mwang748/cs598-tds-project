# Study JSON format · schema 1.0

The default configuration is `public/study.default.json`; start from `public/study.template.json`. JSON requires double quotes and no comments or trailing commas. The runtime schema and derived TypeScript types are in `src/content/schema.ts` (`Study`, `Scenario`, `Checkpoint`, `ResponseOption`, `Block`). Validation uses Zod and runs at startup and on researcher imports.

## Study object

| Field | Type | Rule |
| --- | --- | --- |
| `schemaVersion` | string | Exactly `"1.0"`. |
| `studyId` | string | Nonblank stable study identifier. |
| `contentVersion` | string | Nonblank researcher-managed content version; increment when wording changes. |
| `title` | string | Nonblank study title. |
| `stimulusLabel` | string, optional | Optional participant-facing badge, e.g. `"Fictional draft stimuli"`. Change or omit it for your real stimuli. |
| `instructions` | string array | At least one nonblank instruction. |
| `settings.allowBackNavigation` | boolean | `true` enables reviewing earlier checkpoints; `false` disables Back and final review. |
| `scenarios` | scenario array | At least one scenario. Rendered in array order. |

Unknown fields are rejected outside `factors` and `researcherMetadata`. This catches misspelled field names rather than silently ignoring them. Required text must contain a non-whitespace character. Exact authored strings are retained, including spacing and line breaks. IDs cannot have leading/trailing whitespace. Unicode IDs are supported.

## Scenario

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | Unique within this study. |
| `title` | string | Nonblank. |
| `factors` | object, optional | Arbitrary named string factors, e.g. `{"budget":"tight","schedule":"flexible"}`. Values must be nonblank strings. Exported, with no branching or visual authority styling. |
| `introduction` | block array | At least one paragraph, bullet-list or table. |
| `summary` | array | At least one `{"label":"…","value":"…"}` pair, both nonblank. All pairs render in their supplied order. |
| `checkpoints` | checkpoint array | At least one. Rendered in order. |

Scenario IDs must be unique. Summary labels need not correspond to any fixed categories. Prices, dates, destinations and travel parties are ordinary editable text.

## Checkpoint

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | Unique within its scenario. May be reused in a different scenario. |
| `title` | string | Nonblank. |
| `context` | block array, optional | May be absent or empty. |
| `taskInstruction` | string, optional | Short, neutral instruction above the message box. If omitted, the app asks the participant to request help with the task. |
| `travelerMessage` | string, optional | Example wording shown below the instruction. The message box starts empty. |
| `question` | string | Exact nonblank question wording, included in the export. |
| `responseType` | string | Exactly `"single-choice"`. Other types are rejected. |
| `options` | option array | At least one. Any number is supported, in array order. |
| `researcherMetadata` | object, optional | Any JSON keys/values, e.g. researchQuestions or construct. Hidden from participant screens; not included in response exports. |

Each checkpoint appears as a separate chat task. After the participant sends one message, the app shows the authored alternatives in array order. The message is used for the in-memory chat display. Response exports record the selected option. Removing an optional field means removing its key, rather than setting it to `null`.

## Option

```json
{"id":"compare","kind":"chatbot","text":"Here are the alternatives. You can choose."}
```

`id` must be nonblank and unique within the checkpoint. `kind` is either `"chatbot"` or `"manual"`; it describes the source of the approach, not an authority category. Both kinds use exactly the same card appearance, prominence and interaction. `text` is the complete, nonblank response wording. Manual choices are optional: remove them or add them through JSON. Authority levels, products and research constructs are not enumerated in application code.

Answers are stored against `[scenario ID, checkpoint ID]`, with the selected option ID as value. Text and display positions are never used as answer identifiers. Keep IDs stable when rewording a stimulus, and increase `contentVersion` when changing any study wording. A new active configuration always starts with no participant session.

## Content blocks

### Paragraph

```json
{"type":"paragraph","text":"Imagine planning a three-night trip."}
```

### Bullet list

```json
{"type":"bullet-list","items":["Travel dates are flexible.","Keep the total under $900."]}
```

`items` must have at least one nonblank string.

### Table

```json
{
  "type":"table",
  "columns":["Hotel","Total price","Walk to transit"],
  "rows":[["Park Hotel","$600","12 minutes"],["Union Hotel","$660","5 minutes"]]
}
```

At least one nonblank column heading and one row are required. Each row must have exactly the same number of cells as `columns`. Table cells must be strings; empty cells are allowed. Use strings such as `"$600"`, not numeric values. Blocks can be combined freely in introductions and checkpoint contexts.

All block content is escaped by React and rendered safely as text. HTML, script tags, Markdown and external links are not executed or interpreted. Line breaks in paragraph or response text are preserved.

## Validation and activation

1. Upload or paste JSON in **Researcher**.
2. Click **Validate JSON**. Errors identify paths using zero-based array indexes, for example `scenarios.0.checkpoints.1.options.2.id`, with scenario/checkpoint IDs when available. Duplicates, blank required text, empty studies, malformed tables and unsupported versions/question types are rejected.
3. Review the configuration summary, then **Preview imported study**. Use the preview **Jump to** selector to inspect any introduction, checkpoint or completion screen. No results are created.
4. Return through **Researcher** and click **Activate study**. This is disabled while any participant session exists, even if it has been downloaded or completed. Export and end/reset it first.

Failed imports and edits to the draft editor never mutate active content. Even a valid candidate remains staged until explicitly activated. Candidate preview and participant state are separate. Imports are memory-only; to persist the study between refreshes, replace the default JSON file.
