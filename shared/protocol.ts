// The contract between the studio browser and the studio server. One WebSocket
// carries every live message; plain HTTP serves the app shell, the course files,
// and the preview bridge. This file is the single source of truth for both
// sides — it is imported by `src/` and `server/` alike.

/** A free-form element selection captured in the preview. */
export type Selection = {
  id: string;
  tag: string;
  text: string;
  outerHTML: string;
  location: string;
  screenshot?: string;
  canExpand?: boolean;
};

/** A git checkpoint on the course's timeline (newest first). */
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

/**
 * Where the course is in its life. Stored in the course itself as
 * `<meta name="course-studio-phase">` so it survives restarts and stays
 * inspectable, and re-read on every turn.
 */
export type CoursePhase = "empty" | "syllabus" | "learning";

/** A jump target in the current course page. */
export type CourseSection = {
  /** The heading's `id`, when it has one — the studio scrolls to it. */
  id?: string;
  /** Position among the page's headings, so id-less headings still work. */
  index: number;
  label: string;
};

/** Everything the studio chrome needs to render around the preview. */
export type CourseOutline = {
  phase: CoursePhase;
  hasContent: boolean;
  title: string;
  topic: string;
  sections: CourseSection[];
  /** Lessons named but not written yet, from an optional `course.json`. */
  upNext: string[];
};

/** A lightweight entry in the local course switcher. */
export type CourseSummary = {
  id: string;
  title: string;
  phase: CoursePhase;
  hasContent: boolean;
};

export type ActivityKind = "reasoning" | "plan" | "edit" | "command" | "search" | "tool";

/** A compact indicator of what the agent is doing right now. */
export type Activity = {
  id: string;
  kind: ActivityKind;
  label: string;
  /** Display-safe context supplied by Codex, such as a reasoning summary or command. */
  detail?: string;
  file?: string;
  done?: boolean;
};

// ---- browser → server ----------------------------------------------------

export type ClientMessage =
  | { type: "turn.start"; message: string; selections: Selection[] }
  | { type: "course.start"; topic: string }
  | { type: "course.open"; courseId: string }
  | { type: "turn.interrupt" }
  | { type: "checkpoint.revert" };

// ---- server → browser ----------------------------------------------------

export type ServerMessage =
  | {
      type: "session";
      codex: CodexStatus;
      checkpoints: Checkpoint[];
      course: CourseOutline;
      courseId: string;
      courses: CourseSummary[];
      courseVersion: number;
      turnActive: boolean;
    }
  | { type: "codex.status"; status: CodexStatus }
  | { type: "turn.accepted"; turnId: string }
  | { type: "agent.delta"; turnId: string; delta: string }
  | { type: "activity"; turnId?: string; activity: Activity }
  | { type: "course.changed"; courseVersion: number; course: CourseOutline; path?: string }
  | {
      type: "course.opened";
      courseId: string;
      courses: CourseSummary[];
      course: CourseOutline;
      courseVersion: number;
      checkpoints: Checkpoint[];
      codex: CodexStatus;
    }
  | { type: "courses"; courseId: string; courses: CourseSummary[] }
  | { type: "checkpoints"; checkpoints: Checkpoint[] }
  | { type: "turn.completed"; turnId: string; status: string; error?: string }
  | { type: "system"; message: string }
  | { type: "error"; message: string };
