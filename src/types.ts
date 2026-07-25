import type { Activity, Selection } from "../shared/protocol.ts";

/** One rendered item in the chat stream. Activities are ephemeral (removed on
 *  completion); everything else persists for the session. */
export type ChatItem =
  | { t: "user"; id: string; text: string; selection: Selection | null }
  | { t: "agent"; id: string; text: string; streaming: boolean }
  | { t: "activity"; id: string; kind: Activity["kind"]; label: string }
  | { t: "note"; id: string; text: string }
  | { t: "error"; id: string; text: string };
