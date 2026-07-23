import {
  ArrowRight,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  Expand,
  Inspect,
  LockKeyhole,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, Checkpoint, CodexStatus, Selection, ServerMessage } from "./types";

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "agent",
    text: "This lesson is yours to shape. Read, move the sliders, and take the quick check. If anything feels too abstract or too fast, inspect that part and tell me—I’ll fold the fix into the page.",
  },
];

const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function App() {
  const socket = useRef<WebSocket | null>(null);
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const chatScroll = useRef<HTMLDivElement | null>(null);
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const pendingAgent = useRef<string | null>(null);
  const turnMessages = useRef(new Map<string, string>());
  const scrollTop = useRef(0);
  const inspectRef = useRef(false);
  const changedTimer = useRef<number | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  const [connected, setConnected] = useState(false);
  const [codex, setCodex] = useState<CodexStatus>({ state: "starting" });
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [courseVersion, setCourseVersion] = useState(Date.now());
  const [courseChanged, setCourseChanged] = useState(false);
  const [inspectActive, setInspectActive] = useState(false);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [working, setWorking] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);

  const postToCourse = useCallback((message: Record<string, unknown>) => {
    iframe.current?.contentWindow?.postMessage({ source: "course-studio", ...message }, window.location.origin);
  }, []);

  const setInspect = useCallback((active: boolean) => {
    inspectRef.current = active;
    setInspectActive(active);
    postToCourse({ type: "inspect", active });
  }, [postToCourse]);

  const patchMessage = useCallback((id: string, patch: Partial<ChatMessage> | ((message: ChatMessage) => Partial<ChatMessage>)) => {
    setMessages((current) => current.map((message) => {
      if (message.id !== id) return message;
      const next = typeof patch === "function" ? patch(message) : patch;
      return { ...message, ...next };
    }));
  }, []);

  const appendSystem = useCallback((text: string, failed = false) => {
    setMessages((current) => [...current, { id: uid(), role: "system", text, failed }]);
  }, []);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    if (message.type === "session") {
      setCodex(message.codex);
      setCheckpoints(message.checkpoints);
      setCourseVersion(message.courseVersion);
    }
    if (message.type === "codex.status") setCodex(message.status);
    if (message.type === "checkpoints") setCheckpoints(message.checkpoints);
    if (message.type === "turn.accepted") {
      const messageId = pendingAgent.current;
      if (messageId) turnMessages.current.set(message.turnId, messageId);
    }
    if (message.type === "agent.delta") {
      const messageId = turnMessages.current.get(message.turnId) ?? pendingAgent.current;
      if (messageId) patchMessage(messageId, (current) => ({ text: `${current.text}${message.delta}` }));
    }
    if (message.type === "activity") {
      const messageId = (message.turnId && turnMessages.current.get(message.turnId)) ?? pendingAgent.current;
      if (messageId) patchMessage(messageId, { activity: { label: message.label, file: message.file, done: message.done } });
    }
    if (message.type === "course.changed") {
      setCourseVersion(message.courseVersion);
      setCourseChanged(true);
      if (changedTimer.current) window.clearTimeout(changedTimer.current);
      changedTimer.current = window.setTimeout(() => setCourseChanged(false), 2200);
    }
    if (message.type === "turn.completed") {
      const messageId = turnMessages.current.get(message.turnId) ?? pendingAgent.current;
      if (messageId) {
        patchMessage(messageId, (current) => ({
          activity: current.activity ? { ...current.activity, done: true } : undefined,
          failed: message.status !== "completed",
          text: current.text || (message.status === "completed" ? "The course is updated." : message.error || "The turn did not complete."),
        }));
      }
      turnMessages.current.delete(message.turnId);
      pendingAgent.current = null;
      setWorking(false);
    }
    if (message.type === "system") appendSystem(message.message);
    if (message.type === "error") {
      const messageId = pendingAgent.current;
      if (messageId) patchMessage(messageId, { text: message.message, failed: true, activity: undefined });
      else appendSystem(message.message, true);
      pendingAgent.current = null;
      setWorking(false);
    }
  }, [appendSystem, patchMessage]);

  useEffect(() => {
    let disposed = false;
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const next = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socket.current = next;
      next.addEventListener("open", () => setConnected(true));
      next.addEventListener("message", (event) => handleServerMessage(JSON.parse(event.data) as ServerMessage));
      next.addEventListener("close", () => {
        setConnected(false);
        if (!disposed) reconnectTimer.current = window.setTimeout(connect, 1200);
      });
    };
    connect();
    return () => {
      disposed = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      socket.current?.close();
    };
  }, [handleServerMessage]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.source !== "course-studio-preview") return;
      if (event.data.type === "ready") {
        postToCourse({ type: "scroll.restore", top: scrollTop.current });
        postToCourse({ type: "inspect", active: inspectRef.current });
      }
      if (event.data.type === "scroll") scrollTop.current = Number(event.data.top) || 0;
      if (event.data.type === "selection") {
        const selection = event.data.selection as Selection;
        setSelections((current) => {
          const index = current.findIndex((item) => item.id === selection.id);
          if (index < 0) return [...current, selection];
          return current.map((item) => item.id === selection.id ? selection : item);
        });
        setInspect(false);
        setChatOpen(true);
        window.setTimeout(() => composer.current?.focus(), 50);
      }
      if (event.data.type === "inspect.cancelled") setInspect(false);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [postToCourse, setInspect]);

  useEffect(() => {
    const node = chatScroll.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, working]);

  const sendTurn = useCallback(() => {
    const text = draft.trim();
    if ((!text && selections.length === 0) || working || !socket.current || socket.current.readyState !== WebSocket.OPEN) return;
    const user: ChatMessage = {
      id: uid(),
      role: "user",
      text: text || "Explain this differently.",
      selections: selections.map(({ tag, text: selectionText }) => ({ tag, text: selectionText })),
    };
    const agentId = uid();
    pendingAgent.current = agentId;
    setMessages((current) => [...current, user, {
      id: agentId,
      role: "agent",
      text: "",
      activity: { label: "Sending course context…" },
    }]);
    setWorking(true);
    setDraft("");
    setSelections([]);
    socket.current.send(JSON.stringify({ type: "turn.start", message: user.text, selections }));
    if (composer.current) composer.current.style.height = "auto";
  }, [draft, selections, working]);

  const revert = useCallback(() => {
    if (working || checkpoints.length < 2 || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify({ type: "checkpoint.revert" }));
  }, [checkpoints.length, working]);

  const statusText = useMemo(() => {
    if (!connected) return "Studio reconnecting";
    if (codex.state === "starting") return "Starting Codex";
    if (codex.state === "error") return "Codex needs attention";
    return working ? "Agent is working" : "Codex ready";
  }, [codex.state, connected, working]);

  return (
    <div className={`studio-shell ${chatOpen ? "chat-is-open" : "chat-is-closed"}`}>
      <aside className="course-nav">
        <div className="studio-brand"><span>Course</span> Studio</div>
        <div className="course-identity">
          <span className="nav-kicker">Bayesian thinking</span>
          <h1>Bayes, before the formula</h1>
          <div className="course-progress"><span /><small>1 of 3 lessons</small></div>
        </div>
        <nav aria-label="Course sections">
          <button className="active"><span>01</span>Introduction</button>
          <button><span>02</span>The base-rate machine</button>
          <button><span>03</span>Quick check</button>
        </nav>
        <div className="locked-lessons">
          <p>Coming as you learn</p>
          <span><LockKeyhole size={12} /> The formula beneath it</span>
          <span><LockKeyhole size={12} /> Priors in the wild</span>
        </div>
        <div className="nav-foot"><Sparkles size={14} /> Built for one learner</div>
      </aside>

      <main className="workspace">
        <header className="workspace-toolbar">
          <button
            className={`inspect-button ${inspectActive ? "active" : ""}`}
            onClick={() => setInspect(!inspectActive)}
            aria-pressed={inspectActive}
          >
            <Inspect size={16} /> {inspectActive ? "Pick an element" : "Inspect"}
          </button>
          <span className="shortcut">or hold <kbd>⌥</kbd></span>
          <span className={`changed-indicator ${courseChanged ? "visible" : ""}`}><Check size={13} /> changed</span>
          <div className="checkpoint-summary" title={checkpoints[0]?.label ?? "No checkpoint yet"}>
            <div className="checkpoint-dots">
              {checkpoints.slice(0, 5).reverse().map((checkpoint, index, items) => (
                <span key={checkpoint.id} className={index === items.length - 1 ? "current" : ""} />
              ))}
            </div>
            <span>{checkpoints[0]?.label ?? "Initial course"}</span>
          </div>
          <button className="revert-button" onClick={revert} disabled={working || checkpoints.length < 2} title="Revert the last course checkpoint">
            <RotateCcw size={15} /> Revert
          </button>
        </header>
        <div className={`preview-stage ${inspectActive ? "is-inspecting" : ""}`}>
          <iframe
            ref={iframe}
            title="Interactive course preview"
            src={`/course/index.html?v=${courseVersion}`}
          />
          {courseChanged && <div className="reload-toast"><Check size={15} /> Course reloaded</div>}
          {codex.state === "error" && (
            <div className="codex-error-banner"><Bot size={17} /><span>{codex.message}</span></div>
          )}
        </div>
      </main>

      <aside className="chat-panel" aria-label="Course agent chat">
        {chatOpen ? (
          <>
            <header className="chat-header">
              <div className={`agent-avatar ${working ? "working" : ""}`}><Sparkles size={16} /></div>
              <div><strong>Course agent</strong><span><i className={codex.state} />{statusText}</span></div>
              <button onClick={() => setChatOpen(false)} aria-label="Collapse chat"><ChevronRight size={17} /></button>
            </header>
            <div className="chat-messages" ref={chatScroll}>
              {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
              {codex.state === "starting" && <div className="starting-note"><span /><span /><span /> Connecting to Codex</div>}
            </div>
            <div className="composer-wrap">
              {selections.length > 0 && (
                <div className="selection-stack">
                  {selections.map((selection) => (
                    <div className="selection-chip" key={selection.id}>
                      {selection.screenshot
                        ? <img src={selection.screenshot} alt="Selected course element" />
                        : <div className="chip-placeholder">&lt;{selection.tag}&gt;</div>}
                      <div><span>&lt;{selection.tag}&gt;</span><p>{selection.text}</p></div>
                      <div className="chip-actions">
                        {selection.canExpand && <button onClick={() => postToCourse({ type: "selection.expand", id: selection.id })} title="Expand selection to parent"><Expand size={13} /></button>}
                        <button onClick={() => setSelections((current) => current.filter((item) => item.id !== selection.id))} title="Remove selection"><X size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="composer-box">
                <textarea
                  ref={composer}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    event.target.style.height = "auto";
                    event.target.style.height = `${Math.min(event.target.scrollHeight, 130)}px`;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendTurn();
                    }
                  }}
                  placeholder={selections.length ? "What should change here?" : "Ask, or inspect part of the lesson…"}
                  rows={1}
                  disabled={working}
                />
                <div className="composer-foot"><span>↵ send · ⇧↵ newline</span><button onClick={sendTurn} disabled={working || (!draft.trim() && selections.length === 0)} aria-label="Send"><Send size={15} /></button></div>
              </div>
            </div>
          </>
        ) : (
          <div className="collapsed-chat">
            <button onClick={() => setChatOpen(true)} aria-label="Open chat"><ChevronLeft size={17} /></button>
            <MessageCircle size={19} />
            <span>Course agent</span>
            <i className={working ? "working" : codex.state} />
          </div>
        )}
      </aside>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "system") {
    return <div className={`system-message ${message.failed ? "failed" : ""}`}><CornerUpLeft size={13} />{message.text}</div>;
  }
  return (
    <article className={`message ${message.role} ${message.failed ? "failed" : ""}`}>
      {message.role === "agent" && <div className="message-avatar"><Bot size={14} /></div>}
      <div className="message-content">
        {message.selections && message.selections.length > 0 && (
          <div className="message-selections">{message.selections.map((selection, index) => <span key={`${selection.tag}-${index}`}>&lt;{selection.tag}&gt; {selection.text.slice(0, 34)}</span>)}</div>
        )}
        {message.activity && (
          <div className={`activity ${message.activity.done ? "done" : ""}`}>
            {message.activity.done ? <Check size={13} /> : <span className="activity-spinner" />}
            <span>{message.activity.label}{message.activity.file ? ` · ${message.activity.file}` : ""}</span>
          </div>
        )}
        {message.text && <p>{message.text}</p>}
        {!message.text && message.role === "agent" && <div className="typing"><span /><span /><span /></div>}
      </div>
    </article>
  );
}
