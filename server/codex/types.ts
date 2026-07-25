// A hand-picked subset of the Codex `app-server` v2 protocol — only the
// messages this studio actually sends or listens for. The full generated
// bindings live in the Codex CLI (`codex app-server generate-ts`); we keep a
// narrow local copy so the seam stays small and legible.

export interface ClientInfo {
  name: string;
  title: string | null;
  version: string;
}

export interface InitializeParams {
  clientInfo: ClientInfo;
  capabilities: null;
}

export interface ThreadStartParams {
  cwd: string;
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
  approvalPolicy: "untrusted" | "on-request" | "never";
  baseInstructions?: string;
}

export interface Thread {
  id: string;
}
export interface ThreadStartResponse {
  thread: Thread;
}

export type UserInput =
  | { type: "text"; text: string; text_elements: [] }
  | { type: "localImage"; path: string };

export interface TurnStartParams {
  threadId: string;
  input: UserInput[];
}

// ---- notifications we consume -------------------------------------------

export interface AgentMessageDelta {
  threadId: string;
  turnId: string;
  itemId: string;
  delta: string;
}

export interface FileUpdateChange {
  path: string;
  kind: string;
  diff: string;
}

export type ThreadItem =
  | { type: "agentMessage"; id: string; text: string }
  | { type: "reasoning"; id: string }
  | { type: "fileChange"; id: string; changes: FileUpdateChange[]; status: string }
  | { type: "commandExecution"; id: string; command: string }
  | { type: "webSearch"; id?: string }
  | { type: string; id?: string };

export interface ItemNotification {
  item: ThreadItem;
  threadId: string;
  turnId: string;
}

export interface TurnCompletedNotification {
  threadId: string;
  turn: { id: string; status: string };
}

export interface ErrorNotification {
  message?: string;
  error?: { message?: string };
}
