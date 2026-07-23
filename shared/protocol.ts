export type Selection = {
  id: string;
  tag: string;
  text: string;
  outerHTML: string;
  location: string;
  screenshot?: string;
  canExpand?: boolean;
};

export type Checkpoint = {
  id: string;
  label: string;
  createdAt: string;
};

export type CodexStatus = {
  state: "starting" | "ready" | "error";
  account?: string;
  message?: string;
};

export type ClientMessage =
  | { type: "turn.start"; message: string; selections: Selection[] }
  | { type: "checkpoint.revert" };

export type ServerMessage =
  | { type: "session"; codex: CodexStatus; checkpoints: Checkpoint[]; courseVersion: number }
  | { type: "codex.status"; status: CodexStatus }
  | { type: "turn.accepted"; turnId: string }
  | { type: "agent.delta"; turnId: string; delta: string }
  | { type: "activity"; turnId?: string; label: string; file?: string; done?: boolean }
  | { type: "course.changed"; courseVersion: number; path?: string }
  | { type: "checkpoints"; checkpoints: Checkpoint[] }
  | { type: "turn.completed"; turnId: string; status: string; error?: string }
  | { type: "system"; message: string }
  | { type: "error"; message: string };
