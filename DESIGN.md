# Course Studio — Design Record

> Decisions from the founding grill session (2026-07-23). Each was debated and explicitly accepted. Change them deliberately, not incidentally.

## Thesis

In the AI-coding era, every learner should co-design a course tailored to their own background, culture, and learning style. Courses are interactive HTML — Brilliant-grade interactivity, anti-Brilliant philosophy: personal, not general. Learning happens *through* the co-design conversation. The studio makes "select that part, change it" as natural as a design tool.

## Decisions

| # | Area | Decision | Rationale |
|---|------|----------|-----------|
| 1 | Audience | Personal tool for one user; product-for-others deferred | Core loop must be proven by dogfooding before any product plumbing |
| 2 | Form | Local web app (`localhost`); no desktop shell | Identical capability, zero packaging friction; wrap in Tauri later if ever |
| 3 | Agent backend | Codex `app-server` (JSON-RPC), hardwired, behind a thin seam | Only backend where subscription-based programmatic use is documented and permitted; rich events (deltas, file-change items, approvals, mid-turn steering); Apache-2.0. ACP is the future multi-agent path |
| 4 | Course format | Self-contained static directory of plain HTML/CSS/JS per course; **no build step** | Rendered DOM ≈ source, which makes selection→edit cheap and reliable |
| 5 | Selection | Free-form, DevTools-style; no imposed block vocabulary. Payload = `outerHTML` snippet + highlighted screenshot + location hint | HTML is the shared human↔agent language; models locate raw snippets reliably. Principle: **quality over cost** |
| 6 | Surface | One surface, no modes: preview iframe + always-present chat; selection attaches as a context chip | Learner and designer are the same person in the same moment |
| 7 | Answer contract | Course-first: substantive answers must land in the course; chat is for the ephemeral; overridable per message | The course accretes everything the learner struggled with — that's what makes it theirs |
| 8 | Learner profile | Studio-level free-form `profile.html`, first-class document edited via the same loop; agent free-writes updates with visible one-liner mentions in chat | Converts the "agent doesn't know me" tax into a compounding asset. *Open branch: knowledge organization, deliberately deferred* |
| 9 | Edit mechanics | Auto-apply, sandboxed to course dir; live reload; git auto-commit per turn; one-click revert | Tight iteration is the bet; git gives timeline + undo for free |
| 10 | Course birth | Short interview → syllabus (an HTML doc, refined via the same loop) → lazy per-lesson generation | Moves each lesson's creation to the moment of maximum knowledge about the learner |
| 11 | Taste | A design guide injected into every session; cold-started with Brilliant-style interaction pedagogy; curated by the user over time. No starter kit | Taste is prose the user owns and compounds; earned abstractions only |
| 12 | Telemetry | None; conversation and course content are the adaptation channels | In-widget actions are invisible to the agent — accepted; the learner talks to the designer constantly |
| 13 | Roadmap | **M1 The Loop** (preview + chat + selection + auto-apply + checkpoints) → *judge the whole bet* → **M2 The Mind** (profile, design guide, answer contract, birth flow) → **M3 The Home** (library, timeline). Studio stack: Node/TS + Vite/React — no-build applies to courses, not the studio | M1 alone answers the founding question: is select-and-edit co-design better than chatting with an agent over files? |

## Accepted risks

- Snippet ambiguity on repeated markup — mitigated by location hint in the payload.
- Agents must write disciplined vanilla JS — the design guide's job.
- Subscription 5-hour rate windows bound bursty sessions.
- Design-guide improvements don't retroactively restyle old courses (copy-at-birth semantics).

## Open branches (deferred, not decided)

- Organizing the learner profile's knowledge beyond free-form HTML.
- Agent-improvised widget-state persistence (design-guide experiment, post-M1).
- Multi-agent support via ACP.
- Desktop shell (Tauri).
