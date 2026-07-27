# Codex in-progress activity: protocol and UX research

_Researched 2026-07-27 against the official `openai/codex` repository. This is implementation guidance, not a frozen protocol copy; generate schemas from the installed Codex version before relying on exact types._

## Bottom line

Codex `app-server` already exposes enough structured data to avoid a silent chatbox while a turn is running. The robust model is not a single `thinking` flag. It is a turn lifecycle containing an ordered set of item lifecycles:

```text
turn/started
  item/started -> zero or more item-specific deltas -> item/completed
  item/started -> ...
turn/completed
```

The app-server documentation explicitly defines that lifecycle and says clients should render items incrementally. `item/completed` is authoritative for the final state, while `turn/completed` is the terminal state for the whole turn. [`app-server` event documentation](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md#turn-events)

The Codex desktop renderer is not open source. An OpenAI maintainer says it and the IDE extension are clients of the CLI's app-server APIs. The closest inspectable first-party UX reference is therefore the open-source Codex TUI plus the app-server protocol. [OpenAI maintainer answer](https://github.com/openai/codex/discussions/16538)

## Stable protocol surface to consume

Every item/delta notification is scoped by `threadId` and `turnId`; item deltas also carry `itemId`. Current generated schemas additionally put `startedAtMs` on `item/started` and `completedAtMs` on `item/completed`, which are useful for stable elapsed-time and ordering behavior. [Generated `ItemStartedNotification` / `ItemCompletedNotification`](https://github.com/openai/codex/blob/main/sdk/python/src/openai_codex/generated/v2_all.py#L7521-L7549)

| Notification | Important payload | Recommended UI effect |
|---|---|---|
| `thread/status/changed` | `{threadId, status}`; status is `notLoaded`, `idle`, `systemError`, or `active` | Thread-level fallback/reconciliation. `active` means something is running, even if an item delta was missed. [Docs](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md#example-track-thread-status-changes) |
| `turn/started` | `{threadId, turn: {id, status: "inProgress", startedAt, items: []}}` | Immediately create the assistant turn and show a generic **Working…** indicator. Do not wait for the first reasoning or tool item. [Schema](https://github.com/openai/codex/blob/main/sdk/python/src/openai_codex/generated/v2_all.py#L7858-L7918) |
| `item/started` | `{threadId, turnId, item, startedAtMs}` | Upsert a visible activity row keyed by `item.id`; start its spinner. |
| `item/completed` | `{threadId, turnId, item, completedAtMs}` | Replace the same row with the authoritative final item/status; never append a duplicate. |
| `item/agentMessage/delta` | `{threadId, turnId, itemId, delta}` | Append text to the matching assistant message in arrival order. [Schema](https://github.com/openai/codex/blob/main/sdk/python/src/openai_codex/generated/v2_all.py#L96-L103) |
| `item/reasoning/summaryPartAdded` | `{threadId, turnId, itemId, summaryIndex}` | Start a new user-readable reasoning-summary section. |
| `item/reasoning/summaryTextDelta` | same IDs + `summaryIndex`, `delta` | Append to that readable summary and use its short heading as the live status label. |
| `item/reasoning/textDelta` | same IDs + `contentIndex`, `delta` | Raw reasoning text is principally for models that expose it (for example, open-source models). Keep it separate from summaries and collapsed by default. [Reasoning event docs](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md#reasoning) |
| `item/plan/delta` | same IDs + `delta` (experimental) | Stream plan prose if enabled; concatenate by `itemId`. |
| `turn/plan/updated` | `{threadId, turnId, explanation?, plan: [{step,status}]}` | Show a compact checklist; replace the complete plan snapshot on every notification. Status is `pending`, `inProgress`, or `completed`. [Schema](https://github.com/openai/codex/blob/main/sdk/python/src/openai_codex/generated/v2_all.py#L7027-L7042) |
| `item/commandExecution/outputDelta` | same IDs + `delta` | Append live output into a capped/collapsible command panel. Final item supplies `aggregatedOutput`, `exitCode`, `durationMs`, parsed actions, and status. [Docs](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md#commandexecution) |
| `item/fileChange/patchUpdated` | same IDs + structured `changes` (feature-gated) | Update a live edit summary. For a complete turn-wide diff, prefer `turn/diff/updated`. |
| `turn/diff/updated` | `{threadId, turnId, diff}` | Replace the turn's current aggregate unified diff; do not stitch file-change items yourself. [Schema](https://github.com/openai/codex/blob/main/sdk/python/src/openai_codex/generated/v2_all.py#L4471-L4477) |
| `error` | `{error: {message, codexErrorInfo?, additionalDetails?}}` | Surface a non-silent error immediately, but wait for `turn/completed` to finalize turn state. [Docs](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md#errors) |
| `turn/completed` | `{threadId, turn}`; final status is `completed`, `interrupted`, or `failed` | Stop elapsed time/spinners, reconcile the final agent message fallback, and mark any still-open activity interrupted/failed. [Schema](https://github.com/openai/codex/blob/main/sdk/python/src/openai_codex/generated/v2_all.py#L7898-L7918) |

Run `codex app-server generate-ts --out DIR` (or `generate-json-schema`) from the same Codex binary the app launches. OpenAI documents that generated artifacts are version-specific and guaranteed to match that binary. Experimental fields require both `--experimental` during generation and `capabilities.experimentalApi: true` during initialization. [Schema generation and capability negotiation](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md#message-schema)

## Item types and learner-facing presentation

`ThreadItem` is a tagged union. The most relevant activity variants are `reasoning`, `plan`, `commandExecution`, `fileChange`, `mcpToolCall`, `collabToolCall`, `webSearch`, `imageView`, `sleep`, `contextCompaction`, plus `agentMessage`. The official field-level list is in the app-server README. [Thread item types](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md#items)

Suggested compact labels:

| `item.type` | While active | On completion / useful detail |
|---|---|---|
| `reasoning` | `Thinking…`, upgraded to the latest readable summary heading | Collapsible dim/secondary summary. Do not label raw hidden chain-of-thought as available: for most OpenAI models the protocol exposes summaries, while raw `content` applies to models that provide it. |
| `plan` | `Planning…` | Checklist or collapsed “Plan updated”. |
| `commandExecution` | `Running <friendly command action>…` | Success/failure icon, duration and a short output tail; details expand to full captured output. Prefer parsed `commandActions` (`read`, `listFiles`, `search`, `unknown`) over dumping a shell string when possible. |
| `fileChange` | `Editing <file>…` | `Updated <file>` and optional diff; multiple paths should be summarized, not reduced to the first path. |
| `mcpToolCall` | `<app/server>: <tool>…` | Status plus expandable result/error; avoid dumping raw arguments by default. |
| `collabToolCall` | `Starting / waiting for another agent…` | Agent status and target label if present. |
| `webSearch` | `Searching for <query>…` / `Opening page…` | `Searched the web`; details can show query/action/results. |
| `imageView` | `Inspecting <filename>…` | `Inspected <filename>`. |
| `sleep` | `Waiting…` | Usually collapse it unless the wait is long. |
| `contextCompaction` | `Optimizing conversation context…` | `Context optimized`; this is preferable to the deprecated `compacted` item. |

Server-initiated requests are distinct from passive activity. Approval and user-input requests must become focused inline interaction, not a spinner that appears stuck. Command/file approvals arrive after the corresponding `item/started`; `serverRequest/resolved` clears the pending prompt; final `item/completed` remains authoritative. [Approval lifecycle](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md#approvals)

## First-party Codex UX patterns worth copying

The TUI keeps a status row above the composer for the full task lifetime. It defaults to `Working`, includes an animated indicator, elapsed time, and the interrupt binding; it can add short details without allowing them to displace the core interrupt affordance. [Status indicator source](https://github.com/openai/codex/blob/main/codex-rs/tui/src/status_indicator_widget.rs)

Reasoning summaries are treated as progressive disclosure. The TUI accumulates reasoning deltas, extracts the first bold heading, and uses that heading as the live shimmer/status label. The full summary becomes transcript content after the reasoning block finishes. It also deliberately restores a generic status row if a commentary message finishes while the turn continues, preventing a silent gap. [Streaming state source](https://github.com/openai/codex/blob/main/codex-rs/tui/src/chatwidget/streaming.rs)

The TUI suppresses duplicate activity affordances while assistant text is visibly streaming, then restores the status indicator when the stream becomes idle but the turn remains active. This avoids showing both a typing stream and an unrelated spinner as equally prominent. [Streaming state source](https://github.com/openai/codex/blob/main/codex-rs/tui/src/chatwidget/streaming.rs)

Tool rows use meaningful verbs and bounded output. Read/list/search commands become an `Exploring` group; other commands use `Running` / `Ran`, success or failure coloring, and a capped head/tail output preview with an explicit full-transcript hint. [Command activity renderer](https://github.com/openai/codex/blob/main/codex-rs/tui/src/exec_cell/render.rs)

## Recommended state model for Course Studio

Use a small event reducer rather than ad-hoc booleans:

```ts
type ActiveTurn = {
  threadId: string;
  turnId: string;
  status: "inProgress" | "completed" | "interrupted" | "failed";
  startedAt: number;
  itemsById: Map<string, ActivityItem>;
  itemOrder: string[];
  plan?: PlanSnapshot;
  diff?: string;
  error?: string;
};
```

1. Create this state on the `turn/start` response and confirm/reconcile it on `turn/started`; show `Working…` immediately.
2. Upsert all item lifecycle notifications by `(turnId, item.id)`. Append deltas only to the matching `itemId` and index (`summaryIndex` / `contentIndex`) where supplied.
3. Derive the primary status from the newest active item, with a priority such as approval/user input > command/file/tool > reasoning heading > generic `Working`.
4. Keep completed activities in the assistant turn as compact history, but collapse routine successes after completion. Preserve failures and user decisions expanded.
5. Treat final items as reconciliation snapshots: replace delta-built text/output with completed item data when they differ. The Codex TUI explicitly treats item completion as authoritative so a saturated transport cannot leave truncated text. [TUI reconciliation comment](https://github.com/openai/codex/blob/main/codex-rs/tui/src/chatwidget/streaming.rs)
6. On `turn/completed`, stop all animation, finalize unresolved items according to turn status, and keep failed/interrupted state visible. Use `thread/status/changed` as a secondary guard against stale “working” state after reconnect/resume.
7. The stop action should call `turn/interrupt` with both `threadId` **and the active `turnId`**; that pair is required by the current schema. [Interrupt schema](https://github.com/openai/codex/blob/main/sdk/python/src/openai_codex/generated/v2_all.py#L4487-L4499)

For this course-first product, retain the existing restraint: the chat should explain that work is happening without becoming a developer console. A good default surface is one live line (`Thinking…`, `Editing lesson…`, `Checking the result…`) plus elapsed time and Stop. Expandable details can expose readable reasoning summaries, file names, command summaries, search queries, and failures. Raw command output, diffs, and tool payloads should be opt-in.

## Minimum high-value event set

If implementing in stages, the smallest set that eliminates the silent-working failure is:

1. `turn/started` and `turn/completed` for a reliable generic lifecycle.
2. `item/started` and `item/completed` for structured activity rows.
3. `item/reasoning/summaryTextDelta` + `summaryPartAdded` for meaningful live thinking summaries.
4. `item/agentMessage/delta` for text streaming.
5. `turn/plan/updated`, `item/commandExecution/outputDelta`, and `turn/diff/updated` for richer progress.
6. Approval/user-input server requests and `serverRequest/resolved` so blocked work never looks like ongoing computation.
