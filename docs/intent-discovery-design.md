# Intent Discovery Design Interview

_Started 2026-09-23. Design interview closed for the first version; end-to-end
walkthrough recorded for review. Application implementation has not begun._

Research: [Intent discovery before course design](intent-discovery-research.md).
Prior course-brief decisions: [COURSE.md interview handoff](../course-md-grill-handoff.md).

## Accepted decisions

### 1. Help learners discover a direction, not only clarify an existing one

The interview should help learners who do not know enough about a subject to
name a specific question. Concrete examples can help them discover a direction.
A broad overview remains a valid deliberate choice; learners need not diagnose
their own knowledge gaps or converge on the narrowest possible topic.

The learner accepted this recommendation with “yes.” This settles the purpose
of discovery, not a specific interface, assessment mechanism, or implementation
option from the research.

### 2. Use a soft checkpoint to give the learner control over interview depth

After roughly 3–5 learner answers, the agent summarizes its understanding and
offers to review the course brief or keep exploring. A sufficiently precise
opening request can reach this checkpoint earlier. The answer count is a pacing
guide, not a hard cap or proof that the learner's intention is understood.

The learner selected option B. With decision 5, this becomes review of the
already visible draft rather than its first creation. Choosing to review does not approve the
brief or syllabus; the previously accepted review stages still apply. How to
pace further exploration after this checkpoint remains unresolved.

### 3. Adapt question presentation to the learner's response

Ask one focused question per turn. Start with an open question so the learner
can express their own motivation or curiosity. Offer concrete options when the
learner is uncertain or when different interpretations need distinguishing;
always leave room for a custom answer.

The learner selected option C and its recommended one-question-per-turn cadence.
The options should help articulate intent rather than constrain the learner to
the agent's initial guesses. This settles conversational behavior, not whether
options are rendered as chat text or interactive controls.

### 4. Use optional examples to clarify prior understanding when needed

Offer a tiny, relevant example only when uncertainty about the learner's
background would materially change the course. The example is optional,
unscored, and easy to skip. Use the learner's explanation to inform a starting
point; do not treat one response as a comprehensive assessment of ability.

The learner selected option B. A diagnostic is not a mandatory interview stage.

### 5. Show the evolving brief during discovery

Show a compact, evolving brief beside the chat and update it as answers clarify
the learner's intention. Initially emphasize learning direction, starting point,
and unresolved assumptions so misunderstandings are visible early.

The learner selected option B. This is the same COURSE.md the learner later
reviews and approves, not an additional document. The soft checkpoint therefore
offers review of the current draft or further exploration. Draft visibility
does not imply approval or permission to generate the syllabus.

### 6. Propose teaching approaches and offer established methods as choices

Once the learning target and starting point are clear, the agent proposes a
teaching approach in the brief using the interview and any existing learner
preferences. Further interview questions about teaching or presentation are
needed only when their answers would materially change the course.

The learner selected option A and added: “I think there are mature best
practices in terms of teaching style, so let's just make them options for the
user to pick.” Offer selectable teaching approaches rather than requiring a
separate open-ended interview about pedagogy. The proposal remains editable.

This reinforces the pedagogical-preset direction in the prior COURSE.md
interview. It does not select the preset catalog, establish evidence for
particular methods, or decide how multiple approaches can be combined. Presets
describe teaching approaches, not fixed course content or HTML templates.

### 7. Select one teaching preset per course

The learner selected option A: one teaching approach for the whole course.
Do not expose primary/supporting preset combinations or unrestricted preset
mixing. The contents of each preset remain to be researched and defined; this
decision determines how many presets are selected, not every exercise technique
that a preset may contain.

### 8. Preselect the recommended teaching preset

The agent preselects one recommended teaching preset and explains why it fits
the learner's direction. The learner can change it during brief review.
Approval of the brief also confirms its teaching approach; a separate mandatory
preset-selection step is not required.

The learner selected option A. Preselection alone does not approve the brief.

### 9. Use the first version before designing further refinements

The learner requested an end-to-end review and explicitly chose not to explore
the remaining details now. Put the agreed discovery flow into use and let
experience reveal which refinements matter. Further speculative design is not
a prerequisite for the first version.

## First-use walkthrough

This walkthrough assembles the accepted decisions. The example is illustrative,
not a fixed question script or a finalized teaching-preset catalog.

1. **Name an interest.** The learner enters a topic in the existing welcome
   flow, for example “I want to learn quantum mechanics.”
2. **Find a direction together.** The agent asks one focused, open question
   about what sparked the interest. Subsequent questions follow the answers.
   If the learner cannot articulate a direction, the agent offers concrete
   possibilities to react to. A broad overview is allowed when that is what
   the learner wants.
3. **Make understanding visible.** A compact draft brief appears beside the
   chat and develops with the conversation. It captures the learning direction,
   starting point, and unresolved assumptions. The learner can correct the
   agent's interpretation through the conversation. An optional, unscored
   example can help clarify background when it matters.
4. **Propose how to teach it.** The brief includes one preselected teaching
   preset and a short explanation of why it fits. The learner can choose a
   different preset without another required interview stage.
5. **Offer a soft checkpoint.** After roughly 3–5 answers, or earlier if the
   direction is already clear, the agent summarizes the current brief and
   offers review or further exploration. Unknowns remain visible as assumptions;
   they need not all be eliminated before review.
6. **Approve the brief, then design the course.** The learner reviews and
   corrects the same COURSE.md that evolved during discovery. Approving it
   confirms the teaching approach and allows syllabus generation. The existing
   syllabus review and approval then lead to the first lesson, with later
   lessons generated lazily.

The intended change is a better-understood course direction before syllabus
generation, expressed in a durable brief that the learner can recognize and
correct. The interview should not require an explanation of every preference
or a demonstration of mastery before learning begins.

## First-version implementation discretion and later learning

Choose simple, reversible implementations for question controls, brief display,
and continuation pacing. Preserve the accepted behavior, external course
storage, bilingual Studio interface, plain course files, and thin agent seam.
Persistence and approval behavior still need to work in the implementation;
deferring further interview questions does not remove those requirements.

Choose a small initial teaching-preset catalog using primary educational
sources. The agent-harness research does not establish which pedagogical
methods are appropriate, and this interview has not approved a particular list.
That selection is implementation research rather than another design interview.

During ordinary use, note concrete cases where a follow-up fails to use an
answer, the brief misstates the learner's intention, the interview feels too
long, or the resulting course remains generic. Use those cases to decide the
next change. No elaborate evaluation system or ambient telemetry is required
for this pilot.

No ADR is warranted for the reversible choices settled here. The research and
this decision log retain their rationale without adding architectural ceremony.
