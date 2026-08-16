# Grill Session Q&A — Course Studio (2026-07-23)

The founding design discussion, recorded as questions, the fork each one posed, and how the owner decided. DESIGN.md is the compressed verdict table; this file preserves the reasoning and the owner's own words.

---

## Q1. Who is this for, in the first buildable version?
**Fork:** personal tool for the owner alone vs. product for other self-taught learners from day one.
**Decision:** personal tool. The unvalidated part is whether the select-and-edit studio UX beats a chat-with-files workflow — provable only by dogfooding. The vision ("everyone should design their own course") stays; the sequencing changes.

## Q2. Does it need to be a desktop app?
**Fork:** local web app vs. Electron/Tauri shell vs. editor extension.
**Decision:** local web app. Same capability, zero packaging friction; a desktop shell can wrap the same code later.

## Q3. How does the studio talk to the coding agent?
**Fork:** one agent's native SDK vs. ACP (agent-agnostic protocol) vs. crude subprocess calls.
**Owner's constraint:** *"I don't want to write the agent loop by myself. I'd like to leverage the openness of coding agents… with the same subscription plan."* Owner holds Claude Code, Codex, and Antigravity subscriptions; asked for sub-agent research across all three.
**Research verdict:** Claude's Agent SDK is technically excellent but Anthropic prohibits subscription-login for embedded products (API key required). Antigravity's SDK bills via API key; its CLI's headless mode is closed-source and undocumented. **Codex is the policy-clean option**: ChatGPT-plan auth for programmatic use is documented as supported; the `app-server` JSON-RPC protocol offers streaming deltas, file-change events, approval requests, mid-turn steering; Apache-2.0.
**Decision:** hardwire v1 to Codex `app-server`, behind a thin seam. ACP is the future multi-agent path.

## Q4. What is a course, as bytes on disk?
**Fork:** single self-contained HTML file vs. static multi-file directory (no build step) vs. framework project (React/Vite).
**Decision:** static multi-file directory, **no build step** — because rendered DOM ≈ source is what makes "user selected this element" translate directly into "agent, edit this file." Frameworks would demand selection→source mapping before the core loop works.

## Q5. What can you select?
**Fork:** studio-defined semantic block vocabulary (snap-to-block, stable IDs) vs. free-form DevTools-style element selection.
**Owner pushed back on the block vocabulary:** *"I prefer we start simple… HTML is a shared language between human to agent, and agent to agent. Large models are very good at understanding raw HTML already. Or they can understand the rendered web page just like humans did."*
**Decision:** free-form selection, no imposed vocabulary. Reliability is the agent's problem, not a schema's.

### Q5b. What's in the selection payload?
**Fork:** raw `outerHTML` snippet vs. highlighted screenshot vs. both.
**Decision:** both, plus a location hint — snippet answers "which bytes," screenshot answers "what it looks like." Owner's principle, verbatim: *"Let's only care about the quality over the cost."*

## Q6. One surface or two modes?
**Fork:** separate Design view and Learn view vs. one always-live surface.
**Decision:** one surface, no modes. *"The chat window is always needed — either you ask the coding agent questions or you ask it to generate and update the content."* Learner and designer are the same person in the same moment.

## Q7. Where do answers live — chat or course?
**Fork:** chat-answers-by-default vs. radically course-first vs. course-first with agent judgment.
**Decision:** course-first with judgment — substantive answers must land in the course; meta/ephemeral stays in chat; overridable per message. This is what makes the course accrete everything the learner struggled with.

**Amended 2026-07-27:** selection now supplies context without implying an edit. Questions and elaboration are answered in chat; changing the course requires an explicit learner request. Both outcomes use the same select-and-ask interaction.

## Q8. Where does the agent's knowledge of the learner live?
**Fork:** nowhere (per-course chat history) vs. persistent profile document vs. structured learner model (mastery graphs).
**Decision:** persistent studio-level profile — and the owner chose **HTML over markdown**: *"I think markdown is not effective enough. I prefer a direct HTML profile."* So `profile.html` is a first-class document, edited via the same select-and-edit loop.

### Q8b. How does the agent update the profile?
**Fork:** free-write vs. confirm-first.
**Decision:** free-write, with every update mentioned as a one-liner in chat so wrong inferences are visible immediately. Owner: better organization of the knowledge surely exists, *"but I don't think we are in a good position to talk about it by now. Just stick to a free-form HTML for now."* (Recorded as an open branch.)

## Q9. Apply/undo story for agent edits?
**Fork:** approve-every-patch vs. auto-apply + git checkpoints vs. auto-apply with no versioning.
**Decision:** auto-apply sandboxed to the course dir, live reload, git auto-commit per turn, one-click revert. Judging happens visually on the rendered result, not on diffs.

## Q10. The birth of a new course?
**Fork:** big-bang generation vs. syllabus-first with lazy per-lesson generation vs. interview-then-full-generation.
**Decision:** syllabus-first, lessons generated lazily at the moment of maximum knowledge about the learner. Directly answers the owner's founding complaint: *"the first generated content of the course does not fit my needs"* — because generation used to happen before the agent knew them.

## Q11. How is taste encoded?
**Fork:** vibes vs. design guide + starter kit vs. component library.
**Decision:** **design guide only** — no starter kit (*"that's not simple. Just only keep the design guide"*), no component library. Cold-start the guide with Brilliant-style interaction pedagogy; the owner curates it over time, promoting patterns they love. Earned abstraction, not upfront schema.

## Q12. Does the agent see how the learner is doing?
**Fork:** no telemetry vs. structured event telemetry vs. agent-improvised persistence.
**Owner's take:** *"the agent already has the session history, so the agent is able to see what I'm doing anyway."* Clarified nuance: chat and edits are visible; in-widget actions (quiz clicks, simulator fumbling) are not — accepted.
**Decision:** no telemetry subsystem. Conversation and course content are the adaptation channels.

## Q16. How should multilingual co-authoring and release work without token waste?
**Fork:** simultaneous bilingual authoring on every turn vs. derivative export-time translation (Fork A) vs. bilingual sibling pages inside the same course (Fork B) vs. clone/fork as new library course (Fork C).
**Owner's take:** simultaneous bilingual co-authoring is a waste of tokens and slows down the loop. Translations aren't strictly read-only exports; they often need iterative refinement.
**Decision:** **Fork B (Bilingual Sibling Structure)**. Co-author initially in a single primary language (zero token overhead). Generate translated sibling files (`session1.zh-CN.html`, `syllabus.zh-CN.html`) on demand. Refine translated files independently via the normal select-and-edit studio loop.
- **Terminology:** 3-tier strategy. Universally accepted terms are translated (e.g. `梯度下降` for `Gradient Descent`); emerging/complex concepts use `中文 (Original English)` on first mention; unstable jargon, tooling, and proper nouns stay in original English (`Token`, `Transformer`, `LoRA`, `PyTorch`).
- **Interactive Widgets & Logic:** DOM IDs, CSS classes, `localStorage` keys, formulas, and JS event bindings are strictly preserved; only user-facing prose, quiz choices, tooltips, and feedback messages are translated.
- **Co-Design Companion:** Conversations in `conversations.json` are translated along with the course content to provide localized design notes and Q&A.

---

## Process decisions after the grill

- Docs: DESIGN.md (decision record) + AGENTS.md now; AGENTS.md kept as a simple **map to other docs**, not a content dump. Owner: *"let's start simple."*
- Before building: hand design-brief.md to Claude Design for the first UI design; implementation works from what comes back.
