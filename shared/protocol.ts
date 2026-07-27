// The contract between the studio browser and the studio server. One WebSocket
// carries every live message; plain HTTP serves the app shell, the course files,
// and the preview bridge. This file is the single source of truth for both
// sides — it is imported by `src/` and `server/` alike.

/** A free-form element selection captured in the preview. */
export type Selection = {
  id: string;
  /** Text highlights are quoted context; blocks are DOM regions. */
  kind?: "text" | "block";
  tag: string;
  text: string;
  outerHTML: string;
  location: string;
  /** Course-relative page containing the selected element. */
  page?: string;
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

/** One durable, navigable HTML page in a course. */
export type CoursePage = {
  path: string;
  title: string;
  kind: "syllabus" | "lesson";
  sections: CourseSection[];
};

/** Everything the studio chrome needs to render around the preview. */
export type CourseOutline = {
  phase: CoursePhase;
  hasContent: boolean;
  title: string;
  topic: string;
  /** Syllabus first, followed by generated lessons in filename order. */
  pages: CoursePage[];
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

/** A durable Codex thread belonging to one course directory. */
export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
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

/** A display-safe transcript reconstructed from a persisted Codex thread. */
export type TranscriptItem =
  | { kind: "user"; id: string; text: string; selections: Array<Pick<Selection, "kind" | "tag" | "text">> }
  | { kind: "agent"; id: string; text: string; activities: Activity[]; failed?: boolean }
  | { kind: "system"; id: string; text: string; failed?: boolean };

// ---- browser → server ----------------------------------------------------

export type ClientMessage =
  | { type: "turn.start"; message: string; selections: Selection[]; page: string; section?: CourseSection }
  | { type: "course.start"; topic: string }
  | { type: "course.open"; courseId: string }
  | { type: "conversation.new" }
  | { type: "conversation.open"; conversationId: string }
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
      conversationId: string | null;
      conversations: ConversationSummary[];
      items: TranscriptItem[];
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
      conversationId: string | null;
      conversations: ConversationSummary[];
      items: TranscriptItem[];
    }
  | {
      type: "conversation.opened";
      conversationId: string;
      conversations: ConversationSummary[];
      items: TranscriptItem[];
    }
  | { type: "conversations"; conversationId: string | null; conversations: ConversationSummary[] }
  | { type: "courses"; courseId: string; courses: CourseSummary[] }
  | { type: "checkpoints"; checkpoints: Checkpoint[] }
  | { type: "turn.completed"; turnId: string; status: string; error?: string }
  | { type: "system"; message: string }
  | { type: "error"; message: string };
