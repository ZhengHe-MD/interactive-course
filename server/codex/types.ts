// A hand-picked subset of the Codex `app-server` protocol — only the messages
// this studio actually sends or listens for. The full generated bindings live in
// the Codex CLI (`codex app-server generate-ts`); we keep a narrow local copy so
// the seam stays small and legible, and so notification handling is typed rather
// than `any`.

export type ClientInfo = {
  name: string;
  title?: string;
  version: string;
};

export type InitializeParams = {
  clientInfo: ClientInfo;
};

export type ThreadStartParams = {
  cwd: string;
  approvalPolicy: "untrusted" | "on-request" | "never";
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
  serviceName?: string;
  /** Added to the agent's instructions; does not replace the built-in prompt. */
  developerInstructions?: string;
};

export type ThreadStartResponse = { thread: { id: string } };

export type TurnStartResponse = { turn: { id: string; status: string } };

export type AccountReadResponse = {
  account: { type: string; email?: string; planType?: string } | null;
  requiresOpenaiAuth: boolean;
};

/**
 * A single piece of a turn's input. Text carries the prompt; `localImage` points
 * at a file on disk — the studio writes selection screenshots to a temp file and
 * removes them once the turn is under way.
 */
export type UserInput =
  | { type: "text"; text: string; text_elements: [] }
  | { type: "localImage"; path: string };

export type TurnStartParams = {
  threadId: string;
  input: UserInput[];
};

// ---- notifications we consume -------------------------------------------

export type FileChange = {
  path: string;
  kind?: string;
  diff?: string;
};

/**
 * An item on the thread. `type` is one of `agentMessage`, `reasoning`,
 * `fileChange`, `commandExecution`, `webSearch` — and anything a newer Codex
 * adds, which the studio ignores. The fields are declared together rather than
 * as a discriminated union because the studio only ever reads a handful of them
 * and must not break when an unknown item arrives.
 */
export type ThreadItem = {
  type: string;
  id?: string;
  text?: string;
  changes?: FileChange[];
  status?: string;
  command?: string;
};

export type ItemNotification = {
  threadId?: string;
  turnId?: string;
  item?: ThreadItem;
};

export type AgentMessageDeltaNotification = {
  threadId?: string;
  turnId?: string;
  itemId?: string;
  delta?: string;
};

export type TurnCompletedNotification = {
  threadId?: string;
  turnId?: string;
  turn?: { id?: string; status?: string; error?: { message?: string } };
};

export type ErrorNotification = {
  turnId?: string;
  message?: string;
  error?: { message?: string };
};
