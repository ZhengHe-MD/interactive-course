import { useEffect, useMemo, useReducer, useRef } from "react";
import type {
  Activity,
  Checkpoint,
  ClientMessage,
  CodexStatus,
  ConversationSummary,
  CourseOutline,
  CourseSection,
  CourseSummary,
  Selection,
  ServerMessage,
} from "../shared/protocol";
import type { ChatItem } from "./types";

export const uid = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

const conversationStorageKey = (courseId: string) => `course-studio:conversation:${courseId}`;

const emptyCourse: CourseOutline = {
  phase: "empty",
  hasContent: false,
  title: "What will you learn?",
  topic: "New course",
  pages: [],
  sections: [],
  upNext: [],
};

const welcome: ChatItem = {
  kind: "agent",
  id: "welcome",
  text: "What would you like to learn today? A rough topic is enough—I’ll help you shape the goal, depth, and pace before we build the course from scratch.",
  activities: [],
};

export type StudioState = {
  connected: boolean;
  codex: CodexStatus;
  checkpoints: Checkpoint[];
  courseId: string;
  courses: CourseSummary[];
  conversationId: string | null;
  conversations: ConversationSummary[];
  course: CourseOutline;
  courseVersion: number;
  courseChanged: boolean;
  items: ChatItem[];
  working: boolean;
  /** The agent message the current turn is streaming into. */
  pendingId: string | null;
  /** turnId → the message id it belongs to, so late events land correctly. */
  turnMessages: Record<string, string>;
};

const initialState: StudioState = {
  connected: false,
  codex: { state: "starting" },
  checkpoints: [],
  courseId: "current",
  courses: [],
  conversationId: null,
  conversations: [],
  course: emptyCourse,
  courseVersion: Date.now(),
  courseChanged: false,
  items: [welcome],
  working: false,
  pendingId: null,
  turnMessages: {},
};

type Action =
  | { type: "connection"; connected: boolean }
  | { type: "server"; message: ServerMessage }
  | { type: "send"; id: string; agentId: string; text: string; selections: Selection[] }
  | { type: "start"; id: string; agentId: string; topic: string }
  | { type: "changed.clear" };

function patchAgent(
  state: StudioState,
  id: string | null,
  patch: (item: Extract<ChatItem, { kind: "agent" }>) => Partial<Extract<ChatItem, { kind: "agent" }>>,
): StudioState {
  if (!id) return state;
  return {
    ...state,
    items: state.items.map((item) => (item.kind === "agent" && item.id === id ? { ...item, ...patch(item) } : item)),
  };
}

function mergeActivity(activities: Activity[], next: Activity): Activity[] {
  // The optimistic row prevents dead air before app-server accepts the turn.
  // Replace it as soon as real Codex metadata arrives, then retain completed
  // rows so the learner can understand what happened after the spinner stops.
  const rest = activities.filter((activity) => {
    if (activity.id === next.id || activity.id === "turn-starting") return false;
    // `prepare` is a studio-side preflight row. Keep the generic turn status
    // beside its completion until Codex emits an actual item.
    if (activity.id === "turn-working" && next.id !== "prepare") return false;
    return true;
  });
  return [...rest, next].slice(-16);
}

const startingActivity: Activity = {
  id: "turn-starting",
  kind: "reasoning",
  label: "Starting",
};

const workingActivity: Activity = {
  id: "turn-working",
  kind: "reasoning",
  label: "Working",
};

export function mergeTurnActivity(activities: Activity[], next: Activity, hasText: boolean): Activity[] {
  const merged = mergeActivity(activities, next);
  const hasLiveActivity = merged.some((activity) => !activity.done);
  return next.done && !hasLiveActivity && !hasText
    ? [...merged, workingActivity].slice(-16)
    : merged;
}

function reducer(state: StudioState, action: Action): StudioState {
  if (action.type === "connection") return { ...state, connected: action.connected };
  if (action.type === "changed.clear") return { ...state, courseChanged: false };

  if (action.type === "send") {
    return {
      ...state,
      working: true,
      pendingId: action.agentId,
      items: [
        ...state.items,
        {
          kind: "user",
          id: action.id,
          text: action.text,
          selections: action.selections.map(({ kind, tag, text }) => ({ kind, tag, text })),
        },
        { kind: "agent", id: action.agentId, text: "", activities: [startingActivity] },
      ],
    };
  }

  if (action.type === "start") {
    return {
      ...state,
      working: true,
      pendingId: action.agentId,
      turnMessages: {},
      items: [
        { kind: "user", id: action.id, text: action.topic, selections: [] },
        { kind: "agent", id: action.agentId, text: "", activities: [startingActivity] },
      ],
    };
  }

  const message = action.message;
  switch (message.type) {
    case "session":
      return {
        ...state,
        connected: true,
        codex: message.codex,
        checkpoints: message.checkpoints,
        courseId: message.courseId,
        courses: message.courses,
        conversationId: message.conversationId,
        conversations: message.conversations,
        course: message.course,
        courseVersion: message.courseVersion,
        items: message.items.length ? message.items : [welcome],
        working: message.turnActive,
      };
    case "codex.status":
      return { ...state, codex: message.status };
    case "checkpoints":
      return { ...state, checkpoints: message.checkpoints };
    case "courses":
      return { ...state, courseId: message.courseId, courses: message.courses };
    case "conversations":
      return { ...state, conversationId: message.conversationId, conversations: message.conversations };
    case "course.opened":
      return {
        ...state,
        codex: message.codex,
        checkpoints: message.checkpoints,
        courseId: message.courseId,
        courses: message.courses,
        conversationId: message.conversationId,
        conversations: message.conversations,
        course: message.course,
        courseVersion: message.courseVersion,
        courseChanged: false,
        items: message.items.length ? message.items : [welcome],
        working: false,
        pendingId: null,
        turnMessages: {},
      };
    case "conversation.opened":
      return {
        ...state,
        conversationId: message.conversationId,
        conversations: message.conversations,
        items: message.items.length ? message.items : [welcome],
        working: false,
        pendingId: null,
        turnMessages: {},
      };
    case "turn.accepted": {
      if (!state.pendingId) return state;
      const mapped = {
        ...state,
        turnMessages: { ...state.turnMessages, [message.turnId]: state.pendingId },
      };
      return patchAgent(mapped, state.pendingId, (item) => ({
        activities: mergeActivity(item.activities, workingActivity),
      }));
    }
    case "agent.delta":
      return patchAgent(state, state.turnMessages[message.turnId] ?? state.pendingId, (item) => ({
        text: item.text + message.delta,
        // Visible streamed text is its own progress signal.
        activities: item.activities.filter((activity) => activity.id !== "turn-working"),
      }));
    case "activity":
      return patchAgent(
        state,
        (message.turnId && state.turnMessages[message.turnId]) || state.pendingId,
        (item) => {
          return {
            activities: mergeTurnActivity(item.activities, message.activity, Boolean(item.text)),
          };
        },
      );
    case "course.changed":
      return {
        ...state,
        course: message.course,
        courseVersion: message.courseVersion,
        courseChanged: true,
      };
    case "turn.completed": {
      const id = state.turnMessages[message.turnId] ?? state.pendingId;
      const next = patchAgent(state, id, (item) => ({
        activities: item.activities
          .filter((activity) => activity.id !== "turn-starting" && activity.id !== "turn-working")
          .map((activity) => ({ ...activity, done: true })),
        failed: message.status !== "completed",
        text:
          item.text ||
          (message.status === "completed"
            ? "The course is updated."
            : message.error || "The turn did not complete."),
      }));
      const turnMessages = { ...next.turnMessages };
      delete turnMessages[message.turnId];
      return { ...next, turnMessages, pendingId: null, working: false };
    }
    case "system":
      return { ...state, items: [...state.items, { kind: "system", id: uid(), text: message.message }] };
    case "error": {
      if (state.pendingId) {
        const next = patchAgent(state, state.pendingId, () => ({
          text: message.message,
          failed: true,
          activities: [],
        }));
        return { ...next, pendingId: null, working: false };
      }
      return {
        ...state,
        working: false,
        items: [...state.items, { kind: "system", id: uid(), text: message.message, failed: true }],
      };
    }
    default:
      return state;
  }
}

export type StudioActions = {
  sendTurn: (text: string, selections: Selection[], page: string, section?: CourseSection) => void;
  startCourse: (topic: string) => void;
  openCourse: (courseId: string) => void;
  newConversation: () => void;
  openConversation: (conversationId: string) => void;
  interrupt: () => void;
  revert: () => void;
};

export function useStudio(): { state: StudioState; actions: StudioActions } {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let retry: number | null = null;
    let liveCourseId = initialState.courseId;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const next = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socket.current = next;
      next.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          dispatch({ type: "server", message });

          if (message.type === "session" || message.type === "course.opened") {
            liveCourseId = message.courseId;
            const key = conversationStorageKey(message.courseId);
            const remembered = window.localStorage.getItem(key);
            if (
              remembered
              && remembered !== message.conversationId
              && message.conversations.some((conversation) => conversation.id === remembered)
            ) {
              next.send(JSON.stringify({ type: "conversation.open", conversationId: remembered } satisfies ClientMessage));
            } else if (message.conversationId) {
              window.localStorage.setItem(key, message.conversationId);
            }
          } else if (message.type === "conversation.opened") {
            window.localStorage.setItem(conversationStorageKey(liveCourseId), message.conversationId);
          } else if (message.type === "courses") {
            liveCourseId = message.courseId;
          } else if (message.type === "conversations" && message.conversationId) {
            window.localStorage.setItem(conversationStorageKey(liveCourseId), message.conversationId);
          }
        } catch {
          // A malformed frame should never take the studio down.
        }
      });
      next.addEventListener("close", () => {
        dispatch({ type: "connection", connected: false });
        if (!disposed) retry = window.setTimeout(connect, 1200);
      });
    };

    connect();
    return () => {
      disposed = true;
      if (retry) window.clearTimeout(retry);
      socket.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!state.courseChanged) return;
    const timer = window.setTimeout(() => dispatch({ type: "changed.clear" }), 2200);
    return () => window.clearTimeout(timer);
  }, [state.courseChanged, state.courseVersion]);

  const actions = useMemo<StudioActions>(() => {
    const post = (message: ClientMessage) => {
      const live = socket.current;
      if (live?.readyState === WebSocket.OPEN) live.send(JSON.stringify(message));
    };
    return {
      sendTurn(text, selections, page, section) {
        post({ type: "turn.start", message: text, selections, page, section });
        dispatch({ type: "send", id: uid(), agentId: uid(), text, selections });
      },
      startCourse(topic) {
        post({ type: "course.start", topic });
        dispatch({ type: "start", id: uid(), agentId: uid(), topic });
      },
      openCourse: (courseId) => post({ type: "course.open", courseId }),
      newConversation: () => post({ type: "conversation.new" }),
      openConversation: (conversationId) => post({ type: "conversation.open", conversationId }),
      interrupt: () => post({ type: "turn.interrupt" }),
      revert: () => post({ type: "checkpoint.revert" }),
    };
  }, []);

  return { state, actions };
}
