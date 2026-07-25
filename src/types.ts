import type { Selection } from "../shared/protocol";

export type { Checkpoint, CodexStatus, CourseOutline, Selection, ServerMessage } from "../shared/protocol";

export type ChatMessage = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  selections?: Pick<Selection, "tag" | "text">[];
  activity?: { label: string; file?: string; done?: boolean };
  failed?: boolean;
};
