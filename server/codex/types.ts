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
  model?: string | null;
  /** Keep export-only sessions in memory instead of adding them to history. */
  ephemeral?: boolean;
  cwd: string;
  approvalPolicy: "untrusted" | "on-request" | "never";
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
  serviceName?: string;
  /** Added to the agent's instructions; does not replace the built-in prompt. */
  developerInstructions?: string;
};

export type PersistedThreadItem = {
  id?: string;
  type: string;
  text?: string;
  content?: UserInput[];
  summary?: string[];
  command?: string;
  query?: string;
  server?: string;
  tool?: string;
  path?: string;
  changes?: FileChange[];
};

export type PersistedTurn = {
  id: string;
  items: PersistedThreadItem[];
  status: string;
  error?: { message?: string } | null;
};

export type PersistedThread = {
  id: string;
  preview?: string;
  name?: string | null;
  createdAt: number;
  updatedAt: number;
  turns: PersistedTurn[];
};

export type ThreadStartResponse = {
  thread: PersistedThread;
  model?: string;
  reasoningEffort?: string | null;
};
export type ThreadResumeResponse = {
  thread: PersistedThread;
  model?: string;
  reasoningEffort?: string | null;
};
export type ThreadReadResponse = { thread: PersistedThread };
export type ThreadListResponse = { data: PersistedThread[]; nextCursor: string | null };
export type ThreadListParams = {
  cwd: string;
  sortKey: "created_at" | "updated_at";
  sortDirection: "asc" | "desc";
  limit: number;
};

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
  /** Overrides the model for this turn and subsequent turns. */
  model?: string | null;
  /** `app-server` calls reasoning effort `effort` on turn/start. */
  effort?: string | null;
};

export type ModelListParams = {
  cursor?: string | null;
  limit?: number | null;
  includeHidden?: boolean | null;
};

export type ModelListResponse = {
  data: Array<{
    model: string;
    displayName: string;
    description: string;
    hidden: boolean;
    supportedReasoningEfforts: Array<{ reasoningEffort: string; description: string }>;
    defaultReasoningEffort: string;
    isDefault: boolean;
  }>;
  nextCursor: string | null;
};

export type TurnInterruptParams = {
  threadId: string;
  turnId: string;
};

export type TurnSteerParams = {
  threadId: string;
  expectedTurnId: string;
  input: UserInput[];
  clientUserMessageId?: string | null;
};

export type TurnSteerResponse = {
  turnId: string;
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
  summary?: string[];
  content?: string[];
  changes?: FileChange[];
  status?: string;
  command?: string;
  query?: string;
  server?: string;
  tool?: string;
  namespace?: string | null;
  prompt?: string | null;
  path?: string;
  durationMs?: number | null;
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

export type ReasoningSummaryTextDeltaNotification = {
  threadId?: string;
  turnId?: string;
  itemId?: string;
  delta?: string;
  summaryIndex?: number;
};

export type McpToolCallProgressNotification = {
  threadId?: string;
  turnId?: string;
  itemId?: string;
  message?: string;
};

export type TurnPlanUpdatedNotification = {
  threadId?: string;
  turnId?: string;
  explanation?: string | null;
  plan?: Array<{ step: string; status: "pending" | "inProgress" | "completed" }>;
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
