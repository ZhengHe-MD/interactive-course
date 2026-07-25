// The narrow contract between the studio browser and the studio server.
// One WebSocket carries every live message; plain HTTP serves the app shell,
// the course files, and the preview bridge. Keep this the single source of
// truth for both sides — it is imported by `src/` and `server/` alike.

/** A jump target in the current lesson (anchors an element id in the preview). */
export interface LessonSection {
  id: string;
  label: string;
}

/** A git checkpoint in the course's timeline (newest last). */
export interface Checkpoint {
  sha: string;
  label: string;
  seed: boolean; // the course's birth commit
}

/** Everything the studio chrome needs to render around the preview. */
export interface CourseState {
  id: string;
  title: string;
  lessonTag: string; // e.g. "Lesson 01"
  lessonMeta: string; // e.g. "Probability · ~8 min · written for you"
  sections: LessonSection[];
  upNext: string[];
  checkpoints: Checkpoint[];
  hasContent: boolean; // false until the course has been born (has a lesson)
}

/** Whether the Codex backend is reachable and logged in. */
export interface AgentStatus {
  ready: boolean;
  detail: string;
}

/** A free-form element selection captured in the preview. */
export interface Selection {
  tag: string; // e.g. "figure", "h1"
  text: string; // trimmed text content, for the chip label
  snippet: string; // outerHTML of the selected element
  locationHint: string; // human/agent readable path within the document
  screenshot: string | null; // data: URL of the highlighted element
}

// ---- browser → server ----------------------------------------------------

export type ClientMessage =
  | { t: "chat"; text: string; selection?: Selection | null }
  | { t: "revert" }
  | { t: "interrupt" };

// ---- server → browser ----------------------------------------------------

/** A compact activity indicator while the agent works (e.g. editing a file). */
export interface Activity {
  id: string;
  kind: "reasoning" | "edit" | "command" | "search";
  label: string;
}

export type ServerMessage =
  | { t: "hello"; course: CourseState; agent: AgentStatus }
  | { t: "state"; course: CourseState } // course metadata / checkpoints changed
  | { t: "agent"; status: AgentStatus }
  | { t: "turn_start" }
  | { t: "delta"; id: string; text: string } // streamed assistant text
  | { t: "message"; id: string; text: string } // a completed assistant message
  | { t: "activity"; activity: Activity }
  | { t: "activity_done"; id: string }
  | { t: "turn_end"; status: "completed" | "failed" | "interrupted" }
  | { t: "course_changed" } // files on disk changed; reload the preview
  | { t: "note"; text: string } // one-line agent notes (e.g. profile updates)
  | { t: "error"; message: string };
