# Intent Discovery Before Course Design

_Researched 2026-09-23. Primary-source review of five agent-harness workflows. Implementation recommendations are provisional pending the Course Studio design interview; no application behavior was changed._

## Finding

The useful common pattern is an adaptive conversation that produces a shared, inspectable understanding before planning. Merely replacing a batch of four intake questions with four sequential questions would not guarantee that the learner's actual target has been discovered. The next question must depend on the answer, and the transition to course design needs a meaningful readiness condition.

This is an engineering inference from the workflows below, not an experimentally established learning outcome. These sources document intended agent behavior; this review did not run comparative user studies or measure compliance across models.

## Verified implementations

### Matt Pocock: dependencies determine each questioning round

The current `grilling` primitive maps unresolved decisions as a tree and asks only the questions whose prerequisites are settled. Each answer changes the next round. Its default is a batch of independent questions per round, not one question per turn; dependent questions must wait. It separates facts the agent can investigate from decisions the user must make. Completion requires an exhausted decision frontier and the user's confirmation of shared understanding. [Pinned grilling skill](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/productivity/grilling/SKILL.md).

The companion documentation supports an explicit one-question-at-a-time preference. It describes `grill-me` as stateless, distinguishes `grill-with-docs` as durable, warns about passive agreement and overly long interviews, and recommends a prototype when talking cannot settle a question. There is no universal fixed question budget. [Pinned grill-me documentation](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/docs/productivity/grill-me.md).

**Course Studio implication:** borrow adaptive dependencies and user-correctable understanding. Do not copy “every branch resolved” literally into a short learning onboarding flow. A learner's interests can keep branching indefinitely. Avoid recommending the learner's personal motivation as though it were an engineering default.

### Superpowers: discover purpose, reflect it, then design

`brainstorming` explicitly distinguishes knowing the product category from knowing the user's intended outcome. It asks a focused purpose question when intent is missing, reflects the intended outcome, constraints, and success criteria, separates stated facts from assumptions, and invites correction. It avoids re-asking already supplied information. Bounded and architectural paths use one-at-a-time clarification; architecture adds alternative approaches and a durable design document. Implementation is gated by the relevant design approval. The process depth scales with task classification. [Pinned brainstorming skill](https://github.com/obra/superpowers/blob/5bf4e78011075bcfc0dc295f0724994cd123ee71/skills/brainstorming/SKILL.md).

**Course Studio implication:** reflecting a learning target is valuable even when the learner has answered several questions. The meaningful checkpoint is whether they recognize the proposed target, not whether a questionnaire has been completed. The software-specific approval layers would be excessive if copied wholesale.

### GSD: discover a concrete goal through the user's own thread

GSD's questioning guide starts with open expression, follows what the user emphasizes, probes vague claims, and asks for concrete examples. It keeps a small context checklist in the background rather than walking through it mechanically. Questions can present concrete interpretations or examples; when the user wants to explain freely, it switches back to free text. The guide's readiness condition is enough clarity to describe what, why, for whom, and observable completion. It then offers creation of `PROJECT.md` or continued exploration. [Pinned questioning guide in the current successor repository](https://github.com/open-gsd/gsd-core/blob/b90eef28e832a08e4c60e30ee96648a2abee22c3/gsd-core/references/questioning.md).

**Course Studio implication:** this is a useful interaction pattern for uncovering a narrow learning intention. Its instruction not to ask about the user's technical experience is specific to coding agents and must not be transferred to a learning product, where prior knowledge can determine the lesson. The original `gsd-build/get-shit-done` repository is archived; the same questioning behavior was verified in its `open-gsd/gsd-core` successor rather than relying only on the archived snapshot. [Original repository and migration notice](https://github.com/gsd-build/get-shit-done).

### BMAD: a progressively refined brief with durable decisions

The current product-brief skill reads existing material, invites the broad picture, then narrows missing details. It offers a Fast path that consolidates remaining questions and labels inferred assumptions, and a Coaching path that probes thin answers and drafts progressively. It adjusts pressure to stakes and fatigue. A draft workspace and append-only `.memlog.md` preserve decisions, changes, assumptions, and overrides during the conversation; later sessions can resume. The brief is a distillation, while extra user-supplied detail can live in an addendum. [Pinned product-brief skill](https://github.com/bmad-code-org/BMAD-METHOD/blob/1b59caa7f96459fda6750c225a9330283e108fd6/skills/bmad-product-brief/SKILL.md).

BMAD's separate advanced-elicitation tool primarily refines an existing output. It selects a menu of analytical methods, lets the user choose, proposes changes, waits for acceptance or rejection, and supports proceeding without more elicitation. It is not itself a ready-made initial intake interview. [Pinned advanced-elicitation skill](https://github.com/bmad-code-org/BMAD-METHOD/blob/1b59caa7f96459fda6750c225a9330283e108fd6/skills/bmad-advanced-elicitation/SKILL.md).

**Course Studio implication:** preserve what has actually been learned across turns and make assumptions visible. A catalog of reasoning methods would burden onboarding; use such techniques internally or selectively instead.

### GitHub Spec Kit: a bounded clarification protocol

`clarify` scans an existing specification for gaps, prioritizes by impact and uncertainty, and asks exactly one question at a time, up to five. Answers use a small choice set or short text. It stops early if critical ambiguity disappears or the user chooses to stop. Each accepted answer is integrated into the specification and saved; contradictions are replaced. The completion report distinguishes resolved, clear, deferred, and outstanding categories. The command requires an existing specification rather than inventing one during clarification. [Pinned clarify command](https://github.com/github/spec-kit/blob/1c72a3c0d6966886240d71890e5e61d5c5a93be9/templates/commands/clarify.md).

**Course Studio implication:** useful operational safeguards include prioritization, explicit unresolved gaps, incremental state, and an escape hatch. A five-word answer restriction would constrain learners' stories. Its five-question cap is a product policy, not evidence that five questions reveal intent. The behavior is specified in an agent prompt; a Course Studio server controller would be an additional implementation choice, not something this source demonstrates.

## Three promising Course Studio options

These are alternatives for where responsibility lives, not three mutually exclusive questioning techniques. Each could ask one adaptive question per turn. The distinguishing choices are durability and whether software enforces transitions.

| Option | Concrete behavior | Implementation shape | Main benefit | Main limitation |
| --- | --- | --- | --- | --- |
| 1. Prompt-driven adaptive conversation | Probe the learner's last answer; resolve the most consequential ambiguity; reflect a target before proposing a syllabus. | Change the course-agent phase instructions and standing guidance; use existing chat and thread context. | Smallest change; quickest way to test whether question quality improves. | Discovery state and readiness remain implicit; the agent can forget answers or proceed too early. |
| 2. Progressive, visible course brief | Conduct the conversation while developing a compact account of the learner's purpose, exact target, current understanding, evidence of success, constraints, and unresolved assumptions. Learner reviews the account before syllabus design. | Use the already proposed `COURSE.md` as the shared artifact; carry it into later generation. Add a draft/confirmed distinction and a clear discovery-to-syllabus transition. | Learner can correct misunderstandings; later course design has durable, reviewable input. | Needs a coherent brief lifecycle and UI; avoid turning the brief into a form full of compulsory fields. |
| 3. Explicit bounded clarification controller | Ask the next high-value question; maintain structured answered/missing/deferred state; enforce a proceed/continue decision when the discovery budget or readiness rule is met. | A narrow discovery state machine above the existing agent seam, with agent-authored questions and validated transitions. | Strongest control over pacing, resumption, and observable readiness behavior. | Most engineering work; premature schemas or fixed quotas can suppress unexpected learning intentions. |

**Provisional preference: Option 2**, borrowing adaptive questioning from Option 1 and only the necessary pacing/transition rules from Option 3. It gives the user something concrete to recognize and correct, and gives the course agent durable context. This aligns with the repository's previously discussed `COURSE.md` direction rather than creating a competing brief document. The preference should change if the design interview establishes that another visible artifact would interrupt the desired experience, or that guaranteed server-side gating is essential.

## Proposed learning-specific adaptation

The following is a proposal for Course Studio, not behavior claimed by the researched projects:

1. Start with the learner's topic and motivation. Ask for a concrete moment, task, question, or curiosity that prompted it; do not immediately demand a complete goal specification.
2. Choose the next question by whether different answers would materially change the first lesson. Skip facts already established. Use examples when the learner cannot name the niche themselves.
3. Establish enough prior knowledge to choose an entry point. Permit a tiny example or diagnostic only when useful; do not turn discovery into an exam.
4. Reflect the intended learning target in plain language. Distinguish explicit answers from the agent's assumptions. Make scope boundaries visible where they meaningfully prevent a generic survey.
5. Offer a course-design transition when the target can guide a distinctive first lesson, with continued exploration and early-start paths. Do not claim uncertainty is gone because a turn counter ran out.

For example, “learn distributed systems” might become “understand why retrying a payment request can duplicate a charge, and design an idempotency-key flow.” This is illustrative; a learner who wants a broad conceptual map should be allowed to choose that deliberately. Specificity is alignment with intent, not mandatory narrowness.

## Open design decisions and verification

The interview still needs to resolve whether discovery is entirely in chat or partly in the course preview, what the learner must affirm before syllabus generation, whether pacing is a soft expectation or hard budget, and how a learner who says “I don't know” is helped forward. These choices determine whether a prompt change, a brief lifecycle, or a controller is actually necessary.

A later prototype should compare the current flow with the chosen design on vague topics, highly specific requests, rich opening context, uncertainty about goals, deliberate requests for breadth, interruptions/resume, and changed intentions. Assess whether answers actually change subsequent questions; whether the final target is recognizable to the learner; whether the first lesson reflects the established purpose; how often already answered questions recur; and whether users abandon discovery. Completion speed alone does not demonstrate personalization.

## Source scope

All linked implementation sources above are pinned to repository commits fetched during this review. Search-index pages for BMAD still referenced older `src/bmm-skills` locations; the pinned current `skills/` files were inspected directly. No third-party summaries were used as evidence. The reviewed skills are instructions layered onto agent harnesses, not proof of deterministic enforcement or educational effectiveness.

## Product corroboration: Lovable and Replit

Lovable's current documentation distinguishes discussing what to change in Chat mode from specifying how in Plan mode. Planning can include clarifying questions; a concrete plan is editable and approved before implementation. Current and archived plans are stored in project files. This supports separating discovery from planning and retaining inspectable artifacts, but the public documentation does not establish an adaptive question-selection algorithm. [Lovable Plan mode](https://docs.lovable.dev/features/plan-mode).

Replit documents discussion and exploration before implementation, followed by a plan the user can revise, cancel, or approve for building. This corroborates a visible handoff to generation, but does not specify one-at-a-time interviewing or a readiness rubric. [Replit Plan mode](https://docs.replit.com/features/agent/plan-mode).

These two sources describe product behavior; unlike the five source-code workflows above, they do not expose the underlying prompts or enforcement implementation. Both documentation pages were inspected on 2026-09-23.

## Course Studio: verified local fit

The repository already records the desired outcome more clearly than the running prompt implements it:

- [DESIGN.md, decision 10](../DESIGN.md) establishes interview, syllabus, then lazy lessons. [The prior COURSE.md interview](../course-md-grill-handoff.md) records an accepted, still-unimplemented refinement: topic → interview → draft `COURSE.md` → learner approval → syllabus → lessons. It also records constitution, learner defaults, and course-specific direction as separate layers, with defaults copied at course birth. This research does not reopen those decisions or settle their unresolved implementation details.
- [The per-turn prompt](../server/course/prompt.ts) asks for a compact set of goal, depth, background, and time questions, then permits a syllabus when there is enough direction. It does **not** enforce exactly one batch. It lacks an explicit question-selection policy, readiness criteria, or a pre-syllabus brief. [The prompt tests](../tests/prompt.test.ts) check instruction text, not actual interview quality.
- [CourseManager](../server/course/CourseManager.ts) returns `empty` until an entry HTML page exists. [The shared protocol](../shared/protocol.ts) has only `empty`, `syllabus`, and `learning`. An in-progress interview or a standalone `COURSE.md` therefore remains `empty`; it cannot yet be distinguished in the UI as a separate discovery/brief state.
- [Chat's phase guide](../src/components/Chat.tsx) and [the language catalog](../src/i18n.tsx) describe a three-step flow and expose syllabus approval. A visible brief review requires product state and bilingual copy changes. It does not require a separate user-selected mode: the existing chat and preview can carry the workflow.
- [CodexClient](../server/codex/CodexClient.ts) already starts repeated turns and resumes conversations. Ordinary chat questions need no new agent RPC. Its server-request handler currently accepts file approvals, declines command approvals, and rejects other methods; native interactive-question cards must not be assumed to work. This review does not require or propose widening that seam.
- [Course packaging](../server/course/packageCourse.ts) includes non-hidden files, so a course-local `COURSE.md` travels with a generated course. However, import requires an HTML file; a brief-only draft is not currently portable through that round trip. Resume in the existing conversation and import into a new installation are different cases.

### Implementation boundaries for the three options

**Option 1: smallest behavioral experiment.** Change sequencing in `server/course/prompt.ts` and conversational quality guidance in `server/course/designGuide.ts`. Keep the existing `empty` phase and chat transport. Reflect an intended target before advancing. This can validate adaptive questioning, but it is an incremental experiment toward the accepted brief flow, not its complete implementation. A prompt instruction to wait is not a software-enforced generation gate.

**Option 2: recommended product direction.** Let the interview progressively inform the already agreed `COURSE.md`, without requiring a fully populated form. Define a draft/approved lifecycle and show the brief in the existing Studio surface. Thread its content into generation and resumption explicitly; do not assume a new conversation automatically loads an arbitrary Markdown file. Revise the current no-files-before-syllabus instruction to permit the brief while keeping lesson generation later. Put each learner's document in the external course directory, never this repository. Preserve the constitution/defaults/course ownership split. Brief state ownership and approval invalidation after edits must be resolved in the design interview.

**Option 3: explicit workflow control.** Add Studio-owned structured discovery status and validated transition actions, while letting the same course agent choose and phrase questions. The useful guarantee is that an answer, deferral, or approval is recorded consistently; software cannot certify that a person feels understood. A controller above the agent also cannot prevent agent filesystem writes merely by hiding a button. A hard prohibition on early syllabus creation would require a separate execution/output enforcement design and should not be claimed from a state machine alone. This is the most expensive option and is warranted if prompt-led pacing or transitions prove unreliable.

Keep pedagogy and question-writing quality in the standing guide; keep turn state and allowed next steps in the per-turn prompt. All learner-facing Studio labels need English and Simplified Chinese. Course content and the brief follow the chosen authoring language rather than being duplicated bilingually, under [the language policy](language-policy.md).

## Proposed readiness rule and validation

This is a candidate to discuss, not an accepted specification. Discovery is ready to draft a course brief when the agent can state:

- A recognizable question, capability, or deliberately broad exploration the learner wants.
- The learner's reason or motivating example, when available; uncertainty should stay explicit rather than becoming invented motivation.
- A justified starting point from their existing understanding, plus the major remaining assumptions.
- What a satisfying learning experience would enable them to explain, do, notice, or explore, and which adjacent material would be a distraction.

The learner can then correct the brief or proceed with visible assumptions. Unknowns need not all be eliminated. A soft pacing checkpoint can prevent an endless interview, but the exact number of questions is unresolved. Recommendations are appropriate for learning routes; they should not pressure a learner to adopt an inferred personal motivation. A targeted diagnostic is an optional learning-product extension, not an outcome proven by these engineering workflows.

Evaluate the eventual prototype with paired conversations using the same opening request and model settings: the existing batch prompt versus the proposed flow. Include a specific expert request, a broad novice topic, curiosity without a practical project, an intentionally broad survey, contradictory answers, a learner who cannot name their gap, a request to proceed immediately, and an interrupted interview. Include English and Chinese. Review the resulting brief and first lesson as well as the conversation. Judge whether follow-ups use new information, whether the target reflects the learner's words, whether assumptions remain visible, and whether the course differs for meaningfully different learners. Record interaction burden and early exits explicitly in the evaluation; do not add ambient product telemetry. No such experiment has been run as part of this research.
