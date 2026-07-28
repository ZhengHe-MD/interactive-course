import type { TranscriptItem } from "../shared/protocol";

export type {
  Activity,
  ActivityKind,
  AgentConfig,
  AgentModel,
  Checkpoint,
  CodexStatus,
  ConversationSummary,
  CourseOutline,
  CoursePage,
  CoursePhase,
  CourseSection,
  CourseSummary,
  Language,
  Selection,
  TranscriptItem,
  ServerMessage,
} from "../shared/protocol";

/** What a selection looks like once it is only a label in the transcript. */
export type ChatItem = TranscriptItem;
