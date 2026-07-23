# Design Brief: Course Studio

A local desktop-class web app where one person co-designs a personalized, interactive HTML course together with an AI agent — and learns the subject *through* that co-design conversation. Think "Figma-meets-Brilliant, for an audience of one."

## Product in one paragraph

The user is both the learner and the course designer. The course is a live interactive HTML document (text, figures, simulators, quizzes) rendered in the app. A chat panel with an AI agent is always present. The user reads and does the course; whenever something confuses them, is too easy, too hard, or culturally off, they select that part of the page — like inspecting an element in a design tool — and tell the agent what to change. The agent edits the course files directly; the page live-reloads. Substantive answers to the user's questions are folded *into the course itself*, so the course keeps accreting everything the learner actually struggled with.

## The single surface (main screen)

One surface, no modes. No separate "edit mode" vs "read mode."

- **Course preview** (dominant area): the rendered course page in an embedded frame. This is where reading, interacting with simulators, and selecting all happen.
- **Chat panel** (persistent side panel, collapsible): the conversation with the design agent. Streaming responses. Shows compact activity indicators when the agent is editing files (e.g. "editing lesson-02.html…").
- **Selection**: an inspect affordance (toggle button and/or modifier-hover). Hovering highlights the element under the cursor with a bounding box; clicking selects it. The selection appears as a **context chip** attached to the chat composer (e.g. a small card: element tag + text snippet + thumbnail). The user types their instruction/question with the chip attached. Chips are dismissible. Multiple chips possible but singular is the common case.
- **Live update**: when the agent finishes an edit, the preview reloads in place (preserving scroll position). A subtle "changed" indicator on the updated region would help the user spot what moved.
- **History / revert**: every agent turn creates a checkpoint. A lightweight timeline affordance (e.g. in a top bar) lets the user step back one checkpoint ("revert last change") or browse the course's evolution. Undo must feel one-click safe — it's what makes auto-apply comfortable.

## Secondary flows

- **Course birth**: creating a new course starts a short interview in the chat (goal, depth, time budget), then the agent produces a **syllabus** — itself an HTML page shown in the preview and refined via the same select-and-edit loop. Lessons are generated lazily when the user reaches them, so a "this lesson is being written for you…" generating state exists.
- **Course library (home)**: a simple list/grid of the user's courses with progress hints, plus the learner profile. Minimal — this app is for one person, not a marketplace.
- **Learner profile**: a special first-class document (`profile.html`) — what the agent knows about the user's background, knowledge, and learning style. Opened and edited exactly like a course page. When the agent updates it during conversation, a one-line mention appears in chat ("noted in profile: prefers geometric intuition").

## Interaction principles

- Selection is free-form: any element can be selected (DevTools-style), with an easy way to expand selection to the parent.
- The chat is for steering and ephemeral questions; knowledge lands in the course. The UI should make agent edits feel like the *primary* response, chat text secondary.
- Never block the flow with approval dialogs; trust + easy revert instead.
- Latency is real (agent turns take seconds to a minute): design honest progress states, and let the user keep reading/interacting while the agent works.

## Taste

Calm, book-like, content-forward. The chrome should disappear next to the course content — the course is the hero. Brilliant-app-level warmth for the learning content itself; tool-level restraint for the studio chrome. Desktop-first (it's a local web app), generous reading measure, dark/light both welcome.

## Scope for this first design

Design the main surface (preview + chat + selection + chips + timeline/revert) and sketch the library, birth flow, and profile as secondary screens. Single user, local app: no auth, no sharing, no collaboration, no settings beyond the minimum.
