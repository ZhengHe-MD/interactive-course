# Course Studio

A local workspace where a learner and a coding agent co-design a personalized,
interactive HTML course — and the learner studies the subject _through_ the
co-design conversation. This is **M1 "The Loop"**: inspect the lesson, point at
part of the preview, describe a change, watch Codex edit the course, and step
back to an earlier checkpoint when needed.

See [DESIGN.md](DESIGN.md) for the founding decisions and
[design-brief.md](design-brief.md) for the UI brief this implements.

## What's here

- **One surface, three panes** — course navigation, a live lesson preview, and a
  persistent agent chat. No modes; the learner and the designer are the same
  person in the same moment.
- **Free-form selection** — DevTools-style. Turn on _Inspect_, click any element
  in the preview, and it attaches to the composer as a context chip (its HTML
  snippet, a location hint, and a screenshot). No imposed block vocabulary.
- **Course-first answers** — the agent folds substantive answers _into the
  course_ and keeps its chat reply short. The course accretes everything the
  learner struggled with.
- **Auto-apply + checkpoints** — edits are sandboxed to the course directory and
  applied live; the preview reloads in place (scroll preserved). Every turn is a
  git checkpoint, and _Revert_ is one click.
- **Course birth** — the studio starts **empty**. The agent asks what you want to
  learn, has a short interview, then writes your first lesson — which appears in
  the preview live as it's generated. Courses are plain HTML/CSS/JS with
  **no build step**.
- **An example course** — a polished Bayes-theorem lesson (live base-rate
  simulator + quick check) ships in [`courses/bayes-intuition`](courses/bayes-intuition)
  as a reference for the target taste. Load it with `COURSE_ID=bayes-intuition`.

## Architecture

```
src/          React studio chrome (Vite) — Header · Sidebar · Preview · Chat
server/       Express + WebSocket studio server
  codex/      the thin seam over `codex app-server` (JSON-RPC over stdio)
  course/     CourseManager (files + git checkpoints), the design guide, prompts
  assets/     preview-bridge.js — injected into course HTML for selection & reload
shared/       the WebSocket protocol shared by browser and server
courses/      optional course templates / examples (e.g. bayes-intuition)
.workspace/   live course copies with their own git history (git-ignored)
```

The browser/server boundary is deliberately narrow: one WebSocket carries every
live message. `server/codex/CodexClient.ts` owns the Codex protocol and nothing
above it knows the wire format (DESIGN.md decision 3 — _don't widen the seam_).

## Run locally

Requires **Node.js 24+** and a working **Codex** CLI session
(`codex login` — the studio uses `codex app-server`).

```bash
npm install
npm run dev
```

Open <http://localhost:4311> and tell the agent what you want to learn. `dev`
runs the studio server (port 4310) and Vite together. To run on other ports:
`PORT=4320 WEB_PORT=4321 npm run dev`. To open the example lesson instead of a
blank course: `COURSE_ID=bayes-intuition npm run dev`.

Production-style local server:

```bash
npm run build
npm start   # serves the built studio on http://127.0.0.1:4310
```

## Verify

```bash
npm run typecheck
npm test
npm run build
```
