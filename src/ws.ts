import { useEffect, useReducer, useRef } from "react";
import type {
  AgentStatus,
  ClientMessage,
  CourseState,
  Selection,
  ServerMessage,
} from "../shared/protocol.ts";
import type { ChatItem } from "./types.ts";

export interface StudioState {
  connected: boolean;
  course: CourseState | null;
  agent: AgentStatus;
  items: ChatItem[];
  turnActive: boolean;
  reloadToken: number; // bumped whenever the course files change on disk
}

const initialState: StudioState = {
  connected: false,
  course: null,
  agent: { ready: false, detail: "Connecting…" },
  items: [],
  turnActive: false,
  reloadToken: 0,
};

type Action =
  | { type: "socket"; connected: boolean }
  | { type: "server"; msg: ServerMessage }
  | { type: "local-user"; id: string; text: string; selection: Selection | null };

let seq = 0;
const nextId = () => `l${Date.now()}-${seq++}`;

function reducer(state: StudioState, action: Action): StudioState {
  if (action.type === "socket") {
    return { ...state, connected: action.connected };
  }
  if (action.type === "local-user") {
    return {
      ...state,
      items: [
        ...state.items,
        { t: "user", id: action.id, text: action.text, selection: action.selection },
      ],
    };
  }

  const msg = action.msg;
  switch (msg.t) {
    case "hello":
      return { ...state, course: msg.course, agent: msg.agent };
    case "state":
      return { ...state, course: msg.course };
    case "agent":
      return { ...state, agent: msg.status };
    case "turn_start":
      return { ...state, turnActive: true };
    case "turn_end":
      return {
        ...state,
        turnActive: false,
        items: state.items
          .filter((it) => it.t !== "activity")
          .map((it) => (it.t === "agent" ? { ...it, streaming: false } : it)),
      };
    case "delta": {
      const items = [...state.items];
      const idx = items.findIndex((it) => it.t === "agent" && it.id === msg.id);
      if (idx >= 0) {
        const cur = items[idx] as Extract<ChatItem, { t: "agent" }>;
        items[idx] = { ...cur, text: cur.text + msg.text };
      } else {
        items.push({ t: "agent", id: msg.id, text: msg.text, streaming: true });
      }
      return { ...state, items };
    }
    case "message": {
      const items = [...state.items];
      const idx = items.findIndex((it) => it.t === "agent" && it.id === msg.id);
      if (idx >= 0) {
        items[idx] = { t: "agent", id: msg.id, text: msg.text, streaming: false };
      } else {
        items.push({ t: "agent", id: msg.id, text: msg.text, streaming: false });
      }
      return { ...state, items };
    }
    case "activity":
      return {
        ...state,
        items: [
          ...state.items.filter((it) => !(it.t === "activity" && it.id === msg.activity.id)),
          { t: "activity", id: msg.activity.id, kind: msg.activity.kind, label: msg.activity.label },
        ],
      };
    case "activity_done":
      return { ...state, items: state.items.filter((it) => !(it.t === "activity" && it.id === msg.id)) };
    case "note":
      return { ...state, items: [...state.items, { t: "note", id: nextId(), text: msg.text }] };
    case "error":
      return { ...state, items: [...state.items, { t: "error", id: nextId(), text: msg.message }] };
    case "course_changed":
      return { ...state, reloadToken: state.reloadToken + 1 };
    default:
      return state;
  }
}

export interface StudioActions {
  sendChat(text: string, selection: Selection | null): void;
  revert(): void;
  interrupt(): void;
}

export function useStudio(): { state: StudioState; actions: StudioActions } {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const open = () => {
      const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
      const ws = new WebSocket(url);
      socketRef.current = ws;
      ws.onopen = () => dispatch({ type: "socket", connected: true });
      ws.onmessage = (ev) => {
        try {
          dispatch({ type: "server", msg: JSON.parse(ev.data) as ServerMessage });
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        dispatch({ type: "socket", connected: false });
        if (!closed) retry = setTimeout(open, 1000);
      };
      ws.onerror = () => ws.close();
    };
    open();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socketRef.current?.close();
    };
  }, []);

  const post = (msg: ClientMessage) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  const actions: StudioActions = {
    sendChat(text, selection) {
      dispatch({ type: "local-user", id: nextId(), text, selection });
      post({ t: "chat", text, selection });
    },
    revert() {
      post({ t: "revert" });
    },
    interrupt() {
      post({ t: "interrupt" });
    },
  };

  return { state, actions };
}
