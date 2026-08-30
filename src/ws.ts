import { useEffect, useMemo, useReducer, useRef } from "react";
import type {
  Activity,
  AgentConfig,
  AgentModel,
  Attachment,
  Checkpoint,
  ClientMessage,
  CodexStatus,
  ConversationSummary,
  CourseOutline,
  CourseSection,
  CourseSummary,
  Language,
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

export type StudioState = {
  connected: boolean;
  codex: CodexStatus;
  models: AgentModel[];
  agentConfig: AgentConfig | null;
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
  switchingCourseId: string | null;
  /** The agent message the current turn is streaming into. */
  pendingId: string | null;
  /** turnId → the message id it belongs to, so late events land correctly. */
  turnMessages: Record<string, string>;
};

export const initialState: StudioState = {
  connected: false,
  codex: { state: "starting" },
  models: [],
  agentConfig: null,
  checkpoints: [],
  courseId: "current",
  courses: [],
  conversationId: null,
  conversations: [],
  course: emptyCourse,
  courseVersion: Date.now(),
  courseChanged: false,
  items: [],
  working: false,
  switchingCourseId: null,
  pendingId: null,
  turnMessages: {},
};

type Action =
  | { type: "connection"; connected: boolean }
  | { type: "server"; message: ServerMessage }
  | { type: "send"; id: string; agentId: string; text: string; selections: Selection[]; attachments?: Attachment[] }
  | { type: "start"; id: string; agentId: string; topic: string }
  | { type: "course.switching"; courseId: string }
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

function finalizeActivities(activities: Activity[]): Activity[] {
  return activities
    .filter((activity) => activity.id !== "turn-starting" && activity.id !== "turn-working")
    .map((activity) => ({
      ...activity,
      label: activity.label === "Thinking" ? "Thought through the request" : activity.label,
      done: true,
    }));
}

export function reducer(state: StudioState, action: Action): StudioState {
  if (action.type === "connection") return { ...state, connected: action.connected };
  if (action.type === "changed.clear") return { ...state, courseChanged: false };
  if (action.type === "course.switching") return { ...state, switchingCourseId: action.courseId };

  if (action.type === "send") {
    const updatedTurnMessages = { ...state.turnMessages };
    for (const key of Object.keys(updatedTurnMessages)) {
      updatedTurnMessages[key] = action.agentId;
    }

    // Clean up existing items:
    // If the immediately preceding agent message had NO text (e.g. steered before response started),
    // remove that placeholder so we don't leave an empty orphan bubble in the chat.
    // If it had text, finalize all its activities (remove working spinners and mark completed).
    let existingItems = state.items;
    const lastItem = existingItems.at(-1);
    if (state.working && lastItem?.kind === "agent" && !lastItem.text.trim()) {
      existingItems = existingItems.slice(0, -1);
    } else if (state.working) {
      existingItems = existingItems.map((item) => {
        if (item.kind !== "agent") return item;
        return {
          ...item,
          activities: finalizeActivities(item.activities),
        };
      });
    }

    return {
      ...state,
      working: true,
      pendingId: action.agentId,
      turnMessages: updatedTurnMessages,
      items: [
        ...existingItems,
        {
          kind: "user",
          id: action.id,
          text: action.text,
          selections: action.selections.map(({ kind, tag, text }) => ({ kind, tag, text })),
          attachments: (action.attachments ?? []).map(({ name, dataUrl }) => ({ name, dataUrl })),
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
        models: message.models,
        agentConfig: message.agentConfig,
        checkpoints: message.checkpoints,
        courseId: message.courseId,
        courses: message.courses,
        conversationId: message.conversationId,
        conversations: message.conversations,
        course: message.course,
        courseVersion: message.courseVersion,
        items: message.items,
        working: message.turnActive,
        switchingCourseId: null,
      };
    case "codex.status":
      return { ...state, codex: message.status };
    case "agent.config":
      return { ...state, models: message.models, agentConfig: message.agentConfig };
    case "checkpoints":
      return { ...state, checkpoints: message.checkpoints };
    case "courses":
      return {
        ...state,
        courseId: message.courseId,
        courses: message.courses,
        switchingCourseId: state.switchingCourseId === message.courseId ? null : state.switchingCourseId,
      };
    case "conversations":
      return { ...state, conversationId: message.conversationId, conversations: message.conversations };
    case "course.opened":
      return {
        ...state,
        codex: message.codex,
        models: message.models,
        agentConfig: message.agentConfig,
        checkpoints: message.checkpoints,
        courseId: message.courseId,
        courses: message.courses,
        conversationId: message.conversationId,
        conversations: message.conversations,
        course: message.course,
        courseVersion: message.courseVersion,
        courseChanged: false,
        items: message.items,
        working: false,
        switchingCourseId: null,
        pendingId: null,
        turnMessages: {},
      };
    case "conversation.opened":
      return {
        ...state,
        conversationId: message.conversationId,
        conversations: message.conversations,
        models: message.models,
        agentConfig: message.agentConfig,
        items: message.items,
        working: false,
        pendingId: null,
        turnMessages: {},
      };
    case "turn.accepted":
    case "turn.steered": {
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
      const activeId = state.turnMessages[message.turnId] ?? state.pendingId;
      const nextItems = state.items.map((item) => {
        if (item.kind !== "agent") return item;
        const isCurrent = item.id === activeId;
        return {
          ...item,
          activities: finalizeActivities(item.activities),
          failed: isCurrent ? message.status !== "completed" : item.failed,
          text:
            item.text ||
            (isCurrent
              ? (message.status === "completed"
                ? "The course is updated."
                : message.error || "The turn did not complete.")
              : item.text),
        };
      });
      const turnMessages = { ...state.turnMessages };
      delete turnMessages[message.turnId];
      return { ...state, items: nextItems, turnMessages, pendingId: null, working: false };
    }
    case "system":
      return { ...state, items: [...state.items, { kind: "system", id: uid(), text: message.message }] };
    case "error": {
      const nextItems = state.items.map((item) => {
        if (item.kind !== "agent") return item;
        if (item.id === state.pendingId) {
          return {
            ...item,
            text: message.message,
            failed: true,
            activities: [],
          };
        }
        return {
          ...item,
          activities: finalizeActivities(item.activities),
        };
      });
      if (state.pendingId) {
        return { ...state, items: nextItems, pendingId: null, working: false, switchingCourseId: null };
      }
      return {
        ...state,
        working: false,
        switchingCourseId: null,
        items: [...nextItems, { kind: "system", id: uid(), text: message.message, failed: true }],
      };
    }
    default:
      return state;
  }
}

export type StudioActions = {
  sendTurn: (
    text: string,
    selections: Selection[],
    attachments: Attachment[],
    page: string,
    section?: CourseSection,
    agent?: AgentConfig,
    language?: Language,
  ) => void;
  startCourse: (topic: string, agent?: AgentConfig, language?: Language) => void;
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

  const stateRef = useRef(state);
  stateRef.current = state;

  const actions = useMemo<StudioActions>(() => {
    const post = (message: ClientMessage) => {
      const live = socket.current;
      if (live?.readyState === WebSocket.OPEN) live.send(JSON.stringify(message));
    };
    return {
      sendTurn(text, selections, attachments, page, section, agent, language) {
        const isWorking = stateRef.current.working;
        post({
          type: isWorking ? "turn.steer" : "turn.start",
          message: text,
          selections,
          attachments,
          page,
          section,
          agent,
          language,
        });
        dispatch({ type: "send", id: uid(), agentId: uid(), text, selections, attachments });
      },
      startCourse(topic, agent, language) {
        post({ type: "course.start", topic, agent, language });
        dispatch({ type: "start", id: uid(), agentId: uid(), topic });
      },
      openCourse(courseId) {
        post({ type: "course.open", courseId });
        dispatch({ type: "course.switching", courseId });
      },
      newConversation: () => post({ type: "conversation.new" }),
      openConversation: (conversationId) => post({ type: "conversation.open", conversationId }),
      interrupt: () => post({ type: "turn.interrupt" }),
      revert: () => post({ type: "checkpoint.revert" }),
    };
  }, []);

  return { state, actions };
}
