# `COURSE.md` Grill Session Handoff

Status: active discovery; no implementation has been authorized.

## How to resume

Continue using the repository's `grilling` skill at
`.agents/skills/grilling/SKILL.md`:

- Ask exactly one decision question at a time.
- Include a recommended answer with every question.
- Wait for the learner's answer before advancing.
- Resolve factual questions from the repository rather than asking the learner.
- Do not implement the idea until the learner explicitly confirms that shared
  understanding has been reached.

Start by asking the unresolved question at the end of this document. After that,
continue walking the decision tree and update this handoff or a final design
record only when the learner requests it.

## Original idea

The learner wants a course-level equivalent of files such as `DESIGN.md` and
`AGENTS.md`: a durable document—tentatively `COURSE.md`—through which a learner
can specify the design, pedagogy, rules, requirements, style, and other creative
direction for a personalized course.

The learner may also describe inspiration through recognizable educational
creators or formats, such as Veritasium or 3Blue1Brown. This part has not yet
been resolved: the system still needs a principled way to translate creator
references into inspectable attributes rather than blindly copying a creator.

The learner later added that Course Studio should provide presets based on
popular, mature pedagogical methods and established education practices.

## Relevant repository facts already established

- `DESIGN.md` decision 11 already calls for a design guide injected into every
  session, cold-started with Brilliant-style interaction pedagogy and curated by
  the user over time.
- The current standing guide is compiled into
  `server/course/designGuide.ts` as `DESIGN_GUIDE`.
- Course sequencing remains in `server/course/prompt.ts`; the existing
  architectural rule is that taste belongs in the standing guide while phase
  sequencing belongs in the per-turn prompt.
- Courses must remain self-contained directories of plain HTML, CSS, and
  JavaScript with no build step.
- English and Simplified Chinese are first-class under
  `docs/language-policy.md`.
- The existing course-birth sequence is a short interview, then a syllabus,
  followed by lazy lesson generation.
- The project currently favors personal course design rather than starter
  templates. Pedagogical presets therefore need to be reconciled with that
  principle instead of silently becoming fixed course templates.

## Accepted decisions

### 1. Three-layer ownership model

The learner accepted three distinct layers:

1. **Studio constitution** — non-overridable technical and behavioral rules,
   including the plain-web constraint, selection semantics, and language
   guarantees.
2. **Learner defaults** — reusable cross-course preferences, such as learning
   preferences, tone, visual taste, and accessibility needs.
3. **Course-specific `COURSE.md`** — an editable creative and pedagogical brief
   containing the goals, teaching approach, visual direction, requirements,
   references, and course-specific exceptions to learner defaults.

### 2. Snapshot semantics

The learner accepted that relevant learner defaults are copied or distilled
into `COURSE.md` when a course is created. Later changes to global defaults do
not silently affect existing courses. Importing later preference updates into an
existing course must be explicit.

### 3. Visible pre-syllabus artifact

The learner accepted `COURSE.md` as a first-class, learner-visible artifact
created and approved before the syllabus.

The agreed high-level birth sequence is:

```text
topic -> interview -> draft COURSE.md -> learner approval -> syllabus -> lessons
```

The agent may infer and draft the document, but the learner must be able to
inspect and edit the assumptions before they govern course generation.

## Recommendation awaiting a decision

Pedagogical presets should be editable starting philosophies that seed
`COURSE.md`, not fixed page or HTML templates. Examples include Socratic
questioning, mastery learning, worked examples with fading support,
problem-based learning, visual intuition before formalism, and project-based
learning.

The previous recommendation was to allow **one primary pedagogical preset plus
up to two supporting approaches**. This supplies useful composition without
allowing an unlimited mixture to turn the course brief into an incoherent list
of methods.

## Next question—ask this first

Should a learner select exactly one primary pedagogical preset, or compose
several?

Recommended answer: allow one primary preset plus up to two supporting
approaches, with the course-birth interview reconciling conflicts and writing
the resulting commitments into editable prose in `COURSE.md`.

## Important unresolved branches after that question

These are a queue, not questions to ask all at once. Their order may change as
dependencies emerge.

- Whether preset selection is optional and whether the agent may recommend a
  preset from the interview instead of making the learner choose unaided.
- Whether presets are stored as named source definitions, expanded prose inside
  `COURSE.md`, or both; and what must remain inspectable after expansion.
- What qualifies a pedagogical preset for inclusion and who curates/version
  controls the built-in library.
- How to handle conflicts among the primary method, supporting methods, learner
  defaults, accessibility needs, subject matter, and Studio constitution.
- Whether `COURSE.md` is reread on every turn and governs edits to existing
  lessons as well as initial generation.
- Whether changing `COURSE.md` should trigger no automatic restyling, an offered
  migration, or an explicit learner-requested regeneration workflow.
- The document schema: free-form prose, required headings, structured front
  matter, or a hybrid.
- Which dimensions belong in `COURSE.md`: learning outcomes, prior knowledge,
  assessment, lesson rhythm, interaction model, voice, visual system,
  accessibility, cultural context, evidence standards, and prohibited patterns.
- How creator/style references are converted into concrete traits, how the
  learner approves that interpretation, and where imitation boundaries sit.
- Whether pedagogical presets and presentation/style presets are separate
  systems. They likely should be, because teaching method and visual voice are
  independent dimensions.
- How presets and `COURSE.md` behave across English and Simplified Chinese.
- Whether learners edit `COURSE.md` directly, conversationally through the
  agent, through a guided UI, or through all three views over one source.
- How existing courses without `COURSE.md` are migrated without changing their
  established character.
- How compliance is evaluated: prompt-only guidance, a generation checklist,
  critique/revision passes, automated checks, or some combination.
- What belongs in the eventual product UI and what can remain file-first for the
  first milestone.

## Suggested opening message in the new session

> Read `course-md-grill-handoff.md` and resume the `/grilling` session from its
> next unresolved question. Ask one question at a time, recommend an answer, and
> do not implement anything until I explicitly confirm shared understanding.
