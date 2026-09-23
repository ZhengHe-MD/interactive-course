## Problem Statement

When a learner starts a course with a broad topic, Course Studio can produce a generic syllabus before discovering what actually interests them. The current interview prompt requests a compact batch of questions about goals, depth, background, and time, then allows syllabus generation when there is enough direction. It does not define how answers should shape follow-up questions or what sufficient understanding looks like.

Learners may not know enough about an unfamiliar subject to name their own knowledge gaps. Asking them to supply a precise learning objective upfront can miss the question they really care about. Their background can also be misinterpreted, and those misunderstandings are difficult to spot before the syllabus appears.

The learner needs a short, adaptive Intent Discovery conversation that helps them find or clarify their direction, makes the agent's understanding visible, and feeds that understanding into a personalized course. A deliberately broad exploration remains a valid outcome.

## Solution

Add Intent Discovery before syllabus generation, using the existing chat and a compact, evolving Course Brief beside it.

The agent asks one focused question per turn. It starts openly, follows the learner's answers, and offers concrete possibilities when they are uncertain or when different interpretations need distinguishing. It may offer a tiny, optional, unscored example when uncertainty about prior understanding would materially change the course.

The same durable, editable Course Brief, represented by the course's `COURSE.md` artifact, develops during the conversation. It shows the emerging learning direction, starting point, and unresolved assumptions. It also contains one recommended Teaching Preset, preselected with a short rationale. The learner can select a different preset; presets guide pedagogy rather than supplying fixed course content or page designs.

After roughly 3–5 learner answers, or earlier when the direction is already clear, the agent summarizes its understanding and offers brief review or further exploration. This is a soft checkpoint, not a hard question limit or mandatory minimum.

The learner corrects and approves the brief before syllabus generation. Brief approval also confirms the selected Teaching Preset. The existing syllabus review and approval then lead to the first lesson; subsequent lessons continue to be generated lazily.

Deliver a usable first version and learn from ordinary use. Do not make further speculative product design a prerequisite for implementation.

## User Stories

1. As a learner, I want to begin with a broad subject, so that I can start exploring without inventing a precise objective first.
2. As a learner, I want the agent to help me discover a direction I cannot yet articulate, so that unfamiliarity with the subject does not prevent a useful course.
3. As a learner, I want a deliberately broad overview to remain an acceptable choice, so that discovery does not force me into an unwanted niche.
4. As a learner with a specific request, I want the agent to use the detail I already provided, so that I do not repeat myself in a compulsory questionnaire.
5. As a learner, I want one focused question per turn, so that I can think about and answer it without juggling a batch of unrelated questions.
6. As a learner, I want follow-up questions to respond to my previous answers, so that the conversation progressively clarifies my actual interests.
7. As a learner, I want to describe my curiosity in my own words, so that the agent's initial categories do not constrain my intention.
8. As an uncertain learner, I want concrete examples or possible directions to react to, so that I can recognize interests I cannot name unaided.
9. As a learner, I want to answer outside the suggested options, so that none of those suggestions becomes a forced interpretation.
10. As a learner, I want the agent to clarify my background only where it matters, so that discovery stays relevant to the course being designed.
11. As a learner, I want an optional tiny example when my starting point is unclear, so that my explanation can help the agent choose an appropriate entry point.
12. As a learner, I want to skip that example without a score or penalty, so that discovery does not become an entrance exam.
13. As a learner, I want to see the Course Brief develop beside the chat, so that I can spot misunderstandings before a syllabus is generated.
14. As a learner, I want the brief to distinguish established direction from unresolved assumptions, so that the agent's guesses are not presented as my decisions.
15. As a learner, I want to correct the emerging brief through the conversation, so that the course reflects what I mean as my thinking changes.
16. As a learner, I want the brief to stay compact, so that reviewing it does not become a second lengthy task.
17. As a learner, I want a recommended Teaching Preset with an explanation of its fit, so that I can benefit from established teaching practices without studying pedagogical terminology first.
18. As a learner, I want selectable alternative Teaching Presets, so that I can change an approach that does not suit me.
19. As a learner, I want one selected Teaching Preset for the course, so that I do not have to reconcile competing primary and supporting presets.
20. As a learner, I want the recommendation already selected, so that I can accept it through brief approval without an extra mandatory setup step.
21. As a learner, I want a soft checkpoint after several answers, so that I can decide whether further discovery is worth my time.
22. As a learner whose direction is already clear, I want an earlier route to brief review, so that a question quota does not delay me.
23. As a learner, I want to keep exploring at the checkpoint, so that a pacing guideline does not prematurely end a useful conversation.
24. As a learner, I want to review a brief with visible remaining assumptions, so that I can proceed without resolving every possible preference.
25. As a learner, I want to approve the current brief before the agent generates the syllabus, so that I can correct the course direction before planning begins.
26. As a learner, I want the syllabus and first lesson to use my approved direction and Teaching Preset, so that discovery changes the course rather than becoming disposable chat.
27. As a learner returning to an unfinished course, I want my saved brief and discovery context to remain available, so that I can continue without starting the interview over.
28. As a learner reopening an established course, I want to continue learning normally, so that this new birth flow does not force an existing course through onboarding.
29. As an English- or Simplified-Chinese-speaking learner, I want discovery, brief review, and preset controls to work naturally in my selected language, so that the new flow is equally usable in both languages.
30. As a learner transferring an existing Course Package, I want its Course Brief preserved, so that the course's design direction is not lost between installations.
31. As a learner, I want the syllabus to remain reviewable and lessons to be generated only as needed, so that the new discovery step preserves the existing co-design workflow.

## Implementation Decisions

- **Extend the existing course-birth workflow.** The learner-facing sequence is topic → adaptive discovery with evolving brief → brief approval → syllabus review → first lesson. Keep the existing chat-and-preview surface; no separate application or user-selected agent mode is required.
- **Preserve the existing agent boundary.** Continue using Codex app-server through the current thin adapter. Ordinary chat turns are sufficient for adaptive questions. Do not introduce another agent framework, orchestrator, or generalized discovery engine to implement this feature.
- **Keep standing guidance separate from turn state.** Conversational quality and pedagogical guidance belong in the standing course-agent instructions. Current discovery context, allowed next steps, and generation sequencing belong in per-turn instructions. Update the current birth instructions so writing a draft brief is permitted before syllabus generation.
- **Make questions adaptive rather than scripted.** Use the learner's answers to select the next consequential uncertainty. Start openly, avoid re-asking supplied information, and offer concrete alternatives only when useful. Preserve a free-text route. The first version can use simple controls and existing chat presentation.
- **Use examples selectively.** Offer a tiny, skippable, unscored example only when the answer could materially change the course's starting point. Do not infer a comprehensive ability rating from one response.
- **Keep pacing soft.** Roughly 3–5 answers should trigger a useful summary and an offer to review or continue. Earlier review is appropriate for an already precise request. Do not treat answer count as proof of understanding, a forced stop, or a minimum interview length. Continuation should remain adaptive.
- **Maintain one Course Brief.** The visible draft and the later approved brief are the same course-local artifact, not competing documents. Keep it compact and editable, initially emphasizing learning direction, starting point, and unresolved assumptions, then the proposed teaching approach. Conversational corrections must be supported; a rich document editor is not a prerequisite.
- **Persist useful context.** Save the brief in the external Course Library and make it available when resuming discovery and when designing the syllabus and lessons. Do not assume an arbitrary course document is automatically loaded by a fresh agent conversation. Preserve the existing conversation-history behavior.
- **Represent discovery before HTML exists.** Extend course state, the shared browser/server contract, and the visible phase guidance only as needed to distinguish discovery and brief review from syllabus and learning. The current course phase is derived from HTML that does not yet exist during discovery, so the implementation must account for pre-syllabus state. Exact field names and storage shape are implementation choices.
- **Keep approvals meaningful.** Showing or editing a draft, preselecting a preset, or reaching the soft checkpoint does not approve the brief. Approval applies to the current brief and confirms its teaching approach. Correcting the brief before generation must not silently use an outdated approval. Retain the separate syllabus approval before creating the first lesson. Use a simple, explicit transition rather than a general approval framework.
- **Select one Teaching Preset.** Offer a small initial catalog of established teaching approaches, automatically select the agent's recommendation, explain its fit, and allow the learner to choose a different one during review. Do not expose primary/supporting preset composition or unlimited mixing. A preset can contain several coherent teaching techniques without becoming several separately selected presets.
- **Research the initial preset catalog during implementation.** Use primary educational sources and document the basis for the included approaches. This conversation did not approve a specific list or establish that one method is universally best. Choosing a small, defensible catalog is delegated implementation work and does not require another product interview.
- **Keep presets course-specific and editable.** They supply pedagogical direction rather than fixed lessons or HTML templates. Preserve the established separation between Studio rules, any available learner defaults, and the course-specific brief. Do not add a global learner-preference management system as a prerequisite; changes to defaults must not silently alter existing courses.
- **Preserve compatibility.** Existing courses without a brief continue to open normally. Existing Course Packages retain the brief when present. This feature does not require a new package format or brief-only package import. Imported historical conversations retain their existing read-only semantics.
- **Preserve the product contracts.** Learner material stays in the external Course Library. Courses remain plain HTML, CSS, and JavaScript without a build step. Selection remains context rather than automatic edit authorization. Keep the permanent syllabus and lazy lesson generation.
- **Ship both Studio languages.** All new Studio labels, preset descriptions, controls, and accessibility text need English and Simplified Chinese. Agent conversation and newly authored brief/course material follow the selected language. Changing the Studio language alone must not translate existing course material. Verify the layout with both languages and at a narrow viewport.
- **Prefer reversible first-version choices.** The learner explicitly closed further speculative design. Use engineering judgment for simple interaction and persistence details; do not turn those details into another interview or a reason to delay a working version.

## Testing Decisions

The learner confirmed the testing boundary below during spec synthesis.

- **Primary test boundary: the learner-facing course-birth workflow.** Prefer exercising the existing Studio interfaces across discovery, brief display/correction, preset selection, approval, and syllabus transition. Substitute predictable agent responses at the existing Codex adapter boundary. Use real temporary course storage where persistence matters. A test harness at this boundary is acceptable; a new production discovery API solely for tests is not required.
- **Test externally observable behavior.** Assert what the learner sees, which action is available, which request is sent, what course artifacts persist, and whether the correct generation stage follows. Avoid asserting helper call order, private data structures, exact incidental question wording, or a particular schema layout.
- **Cover the critical sequence.** Start with a vague topic, receive a focused question, answer, display an updated brief, correct it, change the preset, review at the soft checkpoint, approve the current brief, and observe syllabus generation. Confirm that brief review alone does not approve it and that brief approval does not skip syllabus review to generate a lesson.
- **Cover the important variations.** Exercise an already precise request, continued discovery after the checkpoint, a custom response outside suggested choices, a skipped optional example, reopening an unfinished discovery, an established course without a brief, and English/Chinese presentation. A changed draft must not accidentally advance on approval of its previous content.
- **Reuse existing testing patterns.** The repository already has Vitest/React interaction tests for selectable agent controls, rendered chat phase-guidance tests, WebSocket state tests, course-manager tests using temporary directories, package round-trip tests, and language behavior tests. Extend the relevant existing coverage where it protects behavior that the primary workflow test cannot observe; avoid mirroring every implementation layer with new tests.
- **Separate deterministic behavior from question quality.** A fake agent can verify UI, persistence, and transitions, but cannot establish that the real model follows answers well or produces a personal course. Prompt assertions alone are likewise insufficient evidence of interview quality.
- **Do a small real-agent smoke test.** Try a vague interest, a precise request, and a deliberately broad exploration, including a Chinese interaction. Check that the agent uses answers, makes assumptions visible, accepts an early route to review, and carries the approved brief into the syllabus. Correct concrete failures without building a benchmark platform.
- **Validate the implementation with the existing typecheck, relevant tests, and build.** Inspect the new flow in both languages and a narrow viewport. Afterward, ordinary use should reveal whether discovery is useful, too long, or still leads to generic courses. Do not add ambient behavioral telemetry.

## Out of Scope

- Another product-design interview before implementing the agreed first version.
- Exhaustively resolving every learning preference, ambiguity, or future edge case before allowing brief review.
- Fixed intake questionnaires, mandatory diagnostic exams, numerical learner ability scores, or a hard universal question quota.
- Multiple selected Teaching Presets, primary/supporting preset combinations, and a preset marketplace or plugin system.
- Fixed course content, starter HTML templates, or a build step for learner courses.
- A generalized clarification controller, new agent backend, multi-agent course workflow, or broader Codex protocol integration solely for this feature.
- A rich standalone document editor, a new global learner-profile management UI, or automatic migration/restyling of established courses.
- Redesigning course packaging, adding brief-only package import, or changing imported transcript semantics.
- Automatically generating all lessons after brief approval, replacing syllabus approval, or silently rewriting material when the Studio language changes.
- A large evaluation framework, experimentation platform, or ambient telemetry before the feature is used.

## Further Notes

This spec synthesizes the completed design discussion. The learner explicitly chose to stop exploring remaining details and let ordinary use guide further refinement. Small, reversible implementation choices are delegated to the implementing agent.

The current code does not enforce a single question batch; its prompt encourages a compact batch and leaves sufficient direction undefined. The goal is better adaptive discovery and a durable, learner-reviewed understanding, not simply splitting a questionnaire into more messages.

The research supports borrowing workflow patterns from agent-harness projects, not claiming proven educational outcomes:

- [Matt Pocock's grilling](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/productivity/grilling/SKILL.md): dependency-aware questioning. Its default is rounds of independent questions; Course Studio deliberately chooses one focused question per turn.
- [GSD's questioning guide](https://github.com/open-gsd/gsd-core/blob/b90eef28e832a08e4c60e30ee96648a2abee22c3/gsd-core/references/questioning.md): conversational discovery, concrete examples, and a choice to proceed or keep exploring.
- [BMAD's product brief](https://github.com/bmad-code-org/BMAD-METHOD/blob/1b59caa7f96459fda6750c225a9330283e108fd6/skills/bmad-product-brief/SKILL.md): a progressive brief with durable decisions and visible assumptions.
- [Spec Kit's clarification workflow](https://github.com/github/spec-kit/blob/1c72a3c0d6966886240d71890e5e61d5c5a93be9/templates/commands/clarify.md): prioritization, incremental recording, and explicit stopping conditions. Its hard cap is not adopted here.

Use these ideas within Course Studio's existing architecture rather than installing those systems. The most useful evidence after release will be actual cases where the brief misrepresents the learner, discovery feels burdensome, or the resulting course still fails to reflect the conversation.
