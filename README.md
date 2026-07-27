# Course Studio

Course Studio is a local workspace where a learner and Codex co-design an interactive course. The first milestone keeps the whole loop in one place: inspect the lesson, point at something in the preview, describe a change, watch Codex edit the course, and return to an earlier checkpoint when needed.

## What is included

- A three-pane studio with course navigation, a live lesson preview, and persistent agent chat.
- Free-form element selection inside the preview, including a screenshot, DOM snippet, and location context for Codex. Selections stack, and any chip can be expanded to its parent element.
- A thin WebSocket/JSON-RPC seam over `codex app-server`, with streamed progress, per-item activity, mid-turn interrupt, and automatic preview refreshes.
- Git-backed checkpoints after successful agent turns, plus one-click revert. Revert is forward-only: it restores the previous tree and commits that, so undo is itself undoable.
- A course-birth flow that starts with a blank directory, asks what the learner wants to learn, and builds the syllabus and lessons from their answers.
- A design guide ([`server/course/designGuide.ts`](server/course/designGuide.ts)) carried into every session, so the agent knows the studio's taste and pedagogy. Edit it freely — it is meant to compound.

Courses deliberately have no build step. [`courses/current`](courses/current) begins without an `index.html`; Course Studio shows its own empty state while the agent interviews the learner, then creates a syllabus there as ordinary HTML. Lessons are added as plain HTML, CSS, and JavaScript only when the learner reaches them.

## Run locally

You need Node.js 24 or newer and a working Codex CLI session. If needed, authenticate first with `codex login`.

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:4311>. The development command runs the studio server and Vite together.

For the production-style local server:

```bash
npm run build
npm start
```

Then open <http://127.0.0.1:4310>.

Four environment variables tune the run:

| Variable | Default | What it does |
|---|---|---|
| `COURSE_STUDIO_COURSE` | `current` | Which directory under `courses/` is open |
| `COURSE_STUDIO_PORT` | `4310` | Studio server port |
| `CODEX_BIN` | `codex` | Path to the Codex CLI — useful for testing against a stub |
| `COURSE_STUDIO_DEBUG` | unset | Print app-server diagnostics to the server console |

## Verify

```bash
npm run typecheck
npm test
npm run build
```

The browser/server boundary is intentionally narrow. `shared/protocol.ts` is the whole contract; `server/codex/CodexClient.ts` owns the app-server protocol (typed in `server/codex/types.ts`); `server/course/CourseManager.ts` owns course files, checkpoints, and the outline the chrome renders. The studio never parses course HTML in the browser — the table of contents is derived on the server from the page's own `<h2>` headings, plus an optional `course.json` the agent may write. See [`DESIGN.md`](DESIGN.md) for the architectural decisions behind the project.
