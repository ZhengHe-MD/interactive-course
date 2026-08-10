# Codex Turn Steering: Protocol and Architecture Research

_Researched 2026-08-10 against `codex-cli` version 0.146.0 and the live `codex app-server` JSON-RPC protocol._

## Executive Summary

**Codex `app-server` natively supports same-turn steering via the `turn/steer` JSON-RPC method.**

When an agent turn is actively executing (running tools, executing shell commands, or thinking), the client can submit a `turn/steer` request carrying new user instructions. Codex queues the input, executes it at the next step boundary, emits a new `userMessage` item onto the live thread, and pivots the agent's plan and responses without terminating the turn.

Currently, **Course Studio completely blocks steering at four layers**:
1. **Frontend Composer (`src/components/Chat.tsx`)**: The textarea is `disabled={working}`, the send button is hidden, and `canSend` requires `!working`.
2. **Frontend State & Wire Protocol (`src/ws.ts`, `shared/protocol.ts`)**: Only `turn.start` and `turn.interrupt` exist; state assumes a single user/agent item pair per turn.
3. **Backend Seam (`server/codex/CodexClient.ts`, `server/codex/types.ts`)**: `turn/steer` types and client methods are absent; `activeTurn` is only used to reject turns or call `turn/interrupt`.
4. **Server Request Router (`server/index.ts`)**: Drops incoming user messages if `activeTurn` is set with `"The course agent is already working on a turn."`

---

## 1. Primary Source Protocol Specification

From the generated TypeScript protocol (`codex app-server generate-ts`) and JSON schema (`codex app-server generate-json-schema`):

### RPC Method: `turn/steer`

```typescript
// Client Request
export type TurnSteerParams = {
  threadId: string;
  /**
   * Required active turn id precondition. The request fails when it does not
   * match the currently active turn.
   */
  expectedTurnId: string;
  input: Array<UserInput>;
  clientUserMessageId?: string | null;
};

// Server Response
export type TurnSteerResponse = {
  turnId: string;
};
```

### Protocol Constraints & Error Behaviors

| Scenario | Server Response / Error Code | Description |
|---|---|---|
| **Active turn matching `expectedTurnId`** | `{ turnId: string }` | Steer accepted; queued into active agent loop. |
| **No active turn or mismatched `expectedTurnId`** | `JSONRPCError: { code: -32600, message: "no active turn to steer" }` | Active turn finished before steer arrived, or turn ID mismatch. |
| **Non-steerable active turn** | `ActiveTurnNotSteerableCodexErrorInfo` | For example, system turns such as `/review` or manual `/compact`. |

---

## 2. Verified Live Execution Lifecycle

Empirical testing with `test_steer3.mjs` against a live `codex app-server` process revealed the exact event sequence during a mid-turn steer:

```text
[Client]  turn/start (Initial prompt: "Inspect server/ files one by one...")
[Server]  turn/started (turnId: "019fea98-...")
[Server]  item/started -> type: userMessage (id: "item-1")
[Server]  item/completed -> type: userMessage
[Server]  item/started -> type: agentMessage (commentary: "I'll first inventory server/...")
[Server]  item/started -> type: commandExecution (running rg/ls)
          ... Agent is running tools ...

[Client]  turn/steer (expectedTurnId: "019fea98-...", input: "ABORT inspection! Return 'STEERED_SUCCESSFULLY'")
[Server]  Response to turn/steer: { turnId: "019fea98-..." }
          ... Agent completes current atomic tool call ...

[Server]  item/started -> type: userMessage (id: "item-3", content: "ABORT inspection...")
[Server]  item/completed -> type: userMessage (id: "item-3")
[Server]  item/started -> type: agentMessage (id: "item-4", text: "")
[Server]  item/agentMessage/delta (delta: "STEERED_SUCCESSFULLY")
[Server]  item/completed -> type: agentMessage (text: "STEERED_SUCCESSFULLY")
[Server]  turn/completed (turn: { id: "019fea98-...", status: "completed" })
```

### Key Behavioral Discoveries:
1. **Non-destructive injection**: Steer does not crash or abruptly kill the thread; it cleanly inserts a new `userMessage` item into the existing turn.
2. **Immediate goal reorientation**: In our live test, after receiving `turn/steer`, the agent immediately stopped subsequent planned tool calls and fulfilled the steered instruction.
3. **Single Turn Container with Multiple Interleaved Messages**: When inspecting the completed turn via `thread/read`, the turn contained 4 sequential items: `[userMessage, agentMessage, userMessage (steered), agentMessage]`.

---

## 3. Current Architecture & Required Changes

### A. Seam & Server Layer (`server/codex/`, `server/`)

1. **`server/codex/types.ts`**:
   - Add `TurnSteerParams` and `TurnSteerResponse`.
2. **`server/codex/CodexClient.ts`**:
   - Add `steerTurn(message: string, selections: SelectionContext[], options: ...)`:
     ```typescript
     async steerTurn(message: string, selections: SelectionContext[], options: ... = {}) {
       await this.requireReady();
       if (!this.threadId || !this.activeTurn) throw new Error("No active turn to steer.");
       const text: UserInput = { type: "text", text: buildCoursePrompt(message, selections, options), text_elements: [] };
       const images = await writeSelectionImages(selections);
       try {
         const response = await this.peer!.request<TurnSteerResponse>("turn/steer", {
           threadId: this.threadId,
           expectedTurnId: this.activeTurn,
           input: [text, ...images.inputs],
         });
         return response;
       } finally {
         await images.cleanup().catch(() => {});
       }
     }
     ```
   - Update `transcriptFromThread()`:
     - Currently assumes 1 `userMessage` and 1 `agentMessage` per turn:
       ```typescript
       // CURRENT BUGGY CODE FOR STEERED TURNS:
       const user = turn.items.find((item) => item.type === "userMessage");
       ```
     - Needs to iterate through turn items in order and group consecutive activities/messages, emitting multiple `TranscriptItem` entries (`user` -> `agent` -> `user` -> `agent`) when a turn has been steered.
3. **`server/index.ts`**:
   - Update `handleClientMessage`:
     - When receiving `turn.start` while `activeTurn` is active, instead of rejecting with an error, invoke `codex.steerTurn(...)`.
     - Handle race condition: if `steerTurn` throws `"no active turn to steer"` (because the turn completed just before the steer arrived), seamlessly fall back to `startTurn()`.

### B. Shared Protocol & Client (`shared/protocol.ts`, `src/ws.ts`)

1. **`shared/protocol.ts`**:
   - Support `turn.steer` client message, or allow `turn.start` to act as steer when a turn is active.
   - Support `turn.steered` server confirmation if desired, or reuse `item/started` events.
2. **`src/ws.ts`**:
   - Update the reducer:
     - When `send` happens while `working: true`, append the new `user` message and a new pending `agent` message (or update the active streaming container) rather than dropping or corrupting the stream.
     - Keep track of the active streaming message ID as new agent messages start.

### C. Frontend UI & UX (`src/components/Chat.tsx`, `src/styles.css`)

1. **Always-Editable Composer**:
   - Remove `disabled={working}` from `<textarea>`.
   - Update placeholder: Instead of replacing the prompt with a disabled string, provide a steering-aware placeholder (e.g., `"Steer the agent or ask a follow-up…"` while working).
2. **Dual Action Controls (Send / Steer & Interrupt)**:
   - Allow user to press Enter or click the Send button to steer the active agent loop.
   - Keep the Stop/Interrupt button accessible alongside the composer (e.g., a dedicated stop button next to the send button or in the header/status banner) so the user can either steer with a new prompt OR halt execution immediately.
3. **Optimistic UI for Steered Messages**:
   - Show the learner's steered message immediately in the chat transcript with visual continuity.
   - Render the agent's new response below the steered message.

---

## 4. Race Condition & Edge Case Strategy

1. **Turn Finishes Right Before Steer Arrives**:
   - Client sends steer for `turn-123`.
   - Server finishes `turn-123` milliseconds before receiving steer request.
   - `turn/steer` returns code `-32600` (`"no active turn to steer"`).
   - **Resolution**: Backend catches `-32600` and automatically falls back to `codex.startTurn()` to begin a new turn with the same prompt and selection context.
2. **Selection Attachments during Steer**:
   - If learner selects an element on the course preview while the agent is running and sends a steer message, the selection and screenshot must be packaged into the steer prompt via `buildCoursePrompt` and `writeSelectionImages`.
3. **Multiple Successive Steers**:
   - A learner can steer multiple times in a single long turn. The backend and frontend must support arbitrarily many `userMessage` -> `agentMessage` sequences inside a single turn lifecycle.
