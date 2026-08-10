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
| 5 | Selection | Free-form text or DOM-block context; no imposed block vocabulary. New context replaces old by default, with an explicit Multiple switch for additive selection. Payload = `outerHTML` snippet + highlighted screenshot + location hint | HTML is the shared human↔agent language; models locate raw snippets reliably, while single-selection default prevents accidental context accumulation. Principle: **quality over cost** |
| 6 | Surface | One surface, no modes: preview iframe + always-present chat; highlighted text or selected blocks attach as context chips | Learner and designer are the same person in the same moment |
| 7 | Answer contract | Intent-first: selection supplies context, questions are answered in chat, and course edits require an explicit request | Asking about what one is reading and redesigning it are one flow without making every question mutate the course |
| 8 | Learner profile | Studio-level free-form `profile.html`, first-class document edited via the same loop; agent free-writes updates with visible one-liner mentions in chat | Converts the "agent doesn't know me" tax into a compounding asset. *Open branch: knowledge organization, deliberately deferred* |
| 9 | Edit mechanics | Auto-apply, sandboxed to course dir; live reload; git auto-commit per turn in a dedicated external course library (`~/.courses` by default); one-click revert | Tight iteration is the bet; git gives timeline + undo for free without coupling learner material to the Studio source repository |
| 10 | Course birth | Short interview → syllabus (an HTML doc, refined via the same loop) → lazy per-lesson generation | Moves each lesson's creation to the moment of maximum knowledge about the learner |
| 11 | Taste | A design guide injected into every session; cold-started with Brilliant-style interaction pedagogy; curated by the user over time. No starter kit | Taste is prose the user owns and compounds; earned abstractions only |
| 12 | Telemetry | No ambient behavioral telemetry. Every learner message does snapshot a semantic reading anchor—current page plus nearest section—and explicit selections add precise DOM context. The last page and scroll position are kept locally as interface state so reopening resumes there; that bookmark is not sent to the agent on its own | Turn-local reading position helps interpret questions without building a surveillance-style event stream; other in-widget actions remain invisible to the agent |
| 13 | Roadmap | **M1 The Loop** (preview + chat + selection + auto-apply + checkpoints) → *judge the whole bet* → **M2 The Mind** (profile, design guide, answer contract, birth flow) → **M3 The Home** (library, timeline). Studio stack: Node/TS + Vite/React — no-build applies to courses, not the studio | M1 alone answers the founding question: is select-and-edit co-design better than chatting with an agent over files? |
| 14 | Publication | A finished course exports as one standalone HTML reader containing the course material and an embedded, collapsible read-only **Co-Design Companion** drawer (questions, answers, and design reasoning). Before bundling, the learner may give a one-off prompt; a separate coding-agent session applies it to a temporary course copy. The derived artifact carries TIL-compatible metadata and body markers | Preserves the clean learning view while making the co-design story accessible on personal sites without cluttering the main text (amended 2026-08-10, ADR 0001) |
| 15 | Course packaging & portability | Courses package into portable `.zip` archives containing source files, assets, `course.json`, `COURSE.md`, and `conversations.json`. Studio supports one-click export, drag-and-drop import, and collision resolution ("Replace" vs "Import as copy"). Imported conversations are read-only historical sessions on the new device | Solves cross-device portability without requiring cloud synchronization infrastructure; self-contained files preserve independence from machine-local agent databases (ADR 0001) |

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
