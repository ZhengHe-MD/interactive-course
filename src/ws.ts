import { useEffect, useMemo, useReducer, useRef } from "react";
import type {
  Activity,
  Checkpoint,
  ClientMessage,
  CodexStatus,
  CourseOutline,
  Selection,
  ServerMessage,
} from "../shared/protocol";
import type { ChatItem } from "./types";

export const uid = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

const emptyCourse: CourseOutline = {
  phase: "empty",
  hasContent: false,
  title: "What will you learn?",
  topic: "New course",
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

/** Transient activities disappear when they finish; a finished edit is news. */
function mergeActivity(activities: Activity[], next: Activity): Activity[] {
  const rest = activities.filter((activity) => activity.id !== next.id);
  if (next.done && next.kind !== "edit") return rest;
  return [...rest, next];
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
          selections: action.selections.map(({ tag, text }) => ({ tag, text })),
        },
        { kind: "agent", id: action.agentId, text: "", activities: [] },
      ],
    };
  }

  const message = action.message;
  switch (message.type) {
    case "session":
      return {
        ...state,
        codex: message.codex,
        checkpoints: message.checkpoints,
        course: message.course,
        courseVersion: message.courseVersion,
        working: message.turnActive,
      };
    case "codex.status":
      return { ...state, codex: message.status };
    case "checkpoints":
      return { ...state, checkpoints: message.checkpoints };
    case "turn.accepted":
      return state.pendingId
        ? { ...state, turnMessages: { ...state.turnMessages, [message.turnId]: state.pendingId } }
        : state;
    case "agent.delta":
      return patchAgent(state, state.turnMessages[message.turnId] ?? state.pendingId, (item) => ({
        text: item.text + message.delta,
      }));
    case "activity":
      return patchAgent(
        state,
        (message.turnId && state.turnMessages[message.turnId]) || state.pendingId,
        (item) => ({ activities: mergeActivity(item.activities, message.activity) }),
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
        activities: item.activities.filter((activity) => activity.done),
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
  sendTurn: (text: string, selections: Selection[]) => void;
  interrupt: () => void;
  revert: () => void;
};

export function useStudio(): { state: StudioState; actions: StudioActions } {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let retry: number | null = null;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const next = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socket.current = next;
      next.addEventListener("open", () => dispatch({ type: "connection", connected: true }));
      next.addEventListener("message", (event) => {
        try {
          dispatch({ type: "server", message: JSON.parse(event.data) as ServerMessage });
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
      sendTurn(text, selections) {
        post({ type: "turn.start", message: text, selections });
        dispatch({ type: "send", id: uid(), agentId: uid(), text, selections });
      },
      interrupt: () => post({ type: "turn.interrupt" }),
      revert: () => post({ type: "checkpoint.revert" }),
    };
  }, []);

  return { state, actions };
}
