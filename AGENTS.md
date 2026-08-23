# Course Studio

A local web app where a learner co-designs personalized interactive HTML courses with a coding agent.

## Docs map

- [DESIGN.md](DESIGN.md) — founding decisions and rationale. Read before changing anything architectural.
- [design-brief.md](design-brief.md) — self-contained UI brief, written to hand off to Claude Design for the first visual design.
- [grill-qa.md](grill-qa.md) — the founding Q&A: each design fork, the debate, and the owner's reasoning in their own words.
- [docs/language-policy.md](docs/language-policy.md) — required bilingual product and development contract. Read before changing UI copy, language behavior, or course-agent prompts.
- [docs/desktop-app.md](docs/desktop-app.md) — the macOS desktop client: how it hosts the server, and what code signing does and does not allow. Read before changing `desktop/` or packaging.

## Hard rules

- Courses are plain HTML/CSS/JS directories. Never add a build step to a course.
- Learner course material lives in the external course library (`~/.courses` by default), never in this repository.
- The agent backend is Codex `app-server`, behind a thin seam. Don't widen the seam.
- Quality over cost.
- English and Simplified Chinese are first-class. Follow `docs/language-policy.md`; every new learner-visible Studio string ships in both languages.

## Where the agent's instructions live

- `server/course/designGuide.ts` — standing instructions: taste, pedagogy, the no-build rule, the course-first answer contract. Sent once, when the thread starts.
- `server/course/prompt.ts` — per-turn state: the selected element, and which of `empty` / `syllabus` / `learning` the course is in. The phase is read back out of the course's own `<meta name="course-studio-phase">` on every turn.

Keep the split. Taste belongs in the guide; sequencing belongs in the prompt.
