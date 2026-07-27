import type { Activity, Selection } from "../shared/protocol";

export type {
  Activity,
  ActivityKind,
  Checkpoint,
  CodexStatus,
  CourseOutline,
  CourseSection,
  Selection,
  ServerMessage,
} from "../shared/protocol";

/** What a selection looks like once it is only a label in the transcript. */
export type SelectionLabel = Pick<Selection, "tag" | "text">;

export type ChatItem =
  | { kind: "user"; id: string; text: string; selections: SelectionLabel[] }
  | { kind: "agent"; id: string; text: string; activities: Activity[]; failed?: boolean }
  | { kind: "system"; id: string; text: string; failed?: boolean };
