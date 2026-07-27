# Course Studio

Course Studio is a local workspace where a learner and Codex co-design an interactive course. The core loop stays in one place: highlight text or select blocks in the preview, ask a question or request a change, and return to an earlier course checkpoint when needed.

## What is included

- A three-pane studio with course navigation, a live lesson preview, and persistent agent chat.
- Ordinary text highlighting plus free-form block selection inside the preview. A new selection replaces the current context by default; an explicit Multiple switch accumulates several parts into one prompt. Selection chips can be expanded to a parent element. Questions are answered in chat; explicit edit requests update the course.
- A thin WebSocket/JSON-RPC seam over `codex app-server`, with streamed progress, per-item activity, mid-turn interrupt, and automatic preview refreshes.
- Git-backed checkpoints after successful agent turns, plus one-click revert. Revert is forward-only: it restores the previous tree and commits that, so undo is itself undoable.
- A course-birth flow that starts with a blank directory, asks what the learner wants to learn, and builds the syllabus and lessons from their answers.
- A design guide ([`server/course/designGuide.ts`](server/course/designGuide.ts)) carried into every session, so the agent knows the studio's taste and pedagogy. Edit it freely — it is meant to compound.

Courses deliberately have no build step. [`courses/current`](courses/current) begins without course material; Course Studio shows its own empty state while the agent interviews the learner, then creates `syllabus.html` as ordinary HTML. Once approved, that syllabus remains available while lessons are added as `session1.html`, `session2.html`, and later pages. Existing `index.html` courses remain readable as legacy syllabi.

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

The browser/server boundary is intentionally narrow. `shared/protocol.ts` is the whole contract; `server/codex/CodexClient.ts` owns the app-server protocol (typed in `server/codex/types.ts`); `server/course/CourseManager.ts` owns course files, checkpoints, and the outline the chrome renders. The studio never parses course HTML in the browser — the material list is derived from the course's HTML files, and each page's table of contents comes from its own `<h2>` headings. An optional `course.json` may provide additional outline metadata. See [`DESIGN.md`](DESIGN.md) for the architectural decisions behind the project.
