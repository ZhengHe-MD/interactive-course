# Course Studio

A local web app where a learner co-designs personalized interactive HTML courses with a coding agent.

## Docs map

- [DESIGN.md](DESIGN.md) — founding decisions and rationale. Read before changing anything architectural.
- [design-brief.md](design-brief.md) — self-contained UI brief, written to hand off to Claude Design for the first visual design.
- [grill-qa.md](grill-qa.md) — the founding Q&A: each design fork, the debate, and the owner's reasoning in their own words.

## Hard rules

- Courses are plain HTML/CSS/JS directories. Never add a build step to a course.
- The agent backend is Codex `app-server`, behind a thin seam. Don't widen the seam.
- Quality over cost.
