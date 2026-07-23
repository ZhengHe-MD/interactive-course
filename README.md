# Course Studio

Course Studio is a local workspace where a learner and Codex co-design an interactive course. The first milestone keeps the whole loop in one place: inspect the lesson, point at something in the preview, describe a change, watch Codex edit the course, and return to an earlier checkpoint when needed.

## What is included

- A three-pane studio with course navigation, a live lesson preview, and persistent agent chat.
- Free-form element selection inside the preview, including a screenshot, DOM snippet, and location context for Codex.
- A thin WebSocket/JSON-RPC seam over `codex app-server`, with streamed progress and automatic preview refreshes.
- Git-backed checkpoints after successful agent turns, plus one-click revert.
- A plain HTML/CSS/JavaScript Bayes intuition course with a live prevalence simulator and a knowledge check.

Courses deliberately have no build step. The starter course lives in [`courses/bayes-intuition`](courses/bayes-intuition) and can be opened directly as ordinary web files.

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

## Verify

```bash
npm run typecheck
npm test
npm run build
```

The browser/server boundary is intentionally narrow. `server/codex/CodexClient.ts` owns the app-server protocol, while `server/course/CourseManager.ts` owns course files and checkpoints. See [`DESIGN.md`](DESIGN.md) for the architectural decisions behind the project.
