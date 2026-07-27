import {
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  Expand,
  FilePenLine,
  ListChecks,
  Search,
  Send,
  Sparkles,
  Square,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Activity, ChatItem, CodexStatus, Selection } from "../types";

export type ChatHandle = { focusComposer: () => void };

type Props = {
  codex: CodexStatus;
  statusText: string;
  connected: boolean;
  working: boolean;
  items: ChatItem[];
  open: boolean;
  selections: Selection[];
  onToggleOpen: (open: boolean) => void;
  onExpandSelection: (id: string) => void;
  onRemoveSelection: (id: string) => void;
  onSend: (text: string) => void;
  onInterrupt: () => void;
  placeholder: string;
};

export const Chat = forwardRef<ChatHandle, Props>(function Chat(props, ref) {
  const { codex, statusText, connected, working, items, open, selections } = props;
  const scroller = useRef<HTMLDivElement | null>(null);
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useImperativeHandle(ref, () => ({
    focusComposer: () => {
      props.onToggleOpen(true);
      window.setTimeout(() => composer.current?.focus(), 50);
    },
  }));

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [items, working]);

  useEffect(() => {
    if (!working) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [working]);

  const canSend = connected && !working && (draft.trim().length > 0 || selections.length > 0);

  const submit = () => {
    if (!canSend) return;
    props.onSend(draft.trim());
    setDraft("");
    if (composer.current) composer.current.style.height = "auto";
  };

  if (!open) {
    return (
      <aside className="chat-panel" aria-label="Course agent chat">
        <div className="collapsed-chat">
          <button onClick={() => props.onToggleOpen(true)} aria-label="Open chat">
            <span className="agent-avatar"><ChevronLeft size={15} /></span>
            <span>Design agent</span>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="chat-panel" aria-label="Course agent chat">
      <header className="chat-header">
        <div className={`agent-avatar ${working ? "working" : ""}`}>
          <Sparkles size={13} />
        </div>
        <strong>Design agent</strong>
        <span className={`agent-status ${working ? "working" : codex.state}`}>
          <i /> {working ? `working · ${formatElapsed(elapsedSeconds)}` : codex.state === "ready" ? "ready" : statusText}
        </span>
        <button onClick={() => props.onToggleOpen(false)} aria-label="Collapse chat">
          <ChevronRight size={17} />
        </button>
      </header>

      <div className="chat-messages" ref={scroller}>
        {items.map((item) => (
          <Message key={item.id} item={item} />
        ))}
        {codex.state === "starting" && (
          <div className="starting-note">
            <span />
            <span />
            <span /> Connecting to Codex
          </div>
        )}
      </div>

      <div className="composer-wrap">
        {selections.length > 0 && (
          <div className="selection-stack">
            {selections.map((selection) => (
              <div className="selection-chip" key={selection.id}>
                {selection.screenshot ? (
                  <img src={selection.screenshot} alt="Selected course element" />
                ) : (
                  <div className="chip-placeholder">&lt;{selection.tag}&gt;</div>
                )}
                <div>
                  <span>&lt;{selection.tag}&gt;</span>
                  <p>{selection.text}</p>
                </div>
                <div className="chip-actions">
                  {selection.canExpand && (
                    <button
                      onClick={() => props.onExpandSelection(selection.id)}
                      title="Expand selection to parent"
                    >
                      <Expand size={13} />
                    </button>
                  )}
                  <button onClick={() => props.onRemoveSelection(selection.id)} title="Remove selection">
                    <X size={13} />
                  </button>
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
                submit();
              }
            }}
            placeholder={props.placeholder}
            rows={1}
            disabled={working}
          />
          <div className="composer-foot">
            <span>{working ? "the agent is working" : ""}</span>
            {working ? (
              <button className="stop-button" onClick={props.onInterrupt} aria-label="Stop the current turn">
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button onClick={submit} disabled={!canSend} aria-label="Send">
                <Send size={15} />
              </button>
            )}
          </div>
        </div>
        <div className="composer-promise">Answers land in the lesson. The chat is for steering.</div>
      </div>
    </aside>
  );
});

function Message({ item }: { item: ChatItem }) {
  if (item.kind === "system") {
    return (
      <div className={`system-message ${item.failed ? "failed" : ""}`}>
        <CornerUpLeft size={13} />
        {item.text}
      </div>
    );
  }

  if (item.kind === "user") {
    return (
      <article className="message user">
        <div className="message-content">
          {item.selections.length > 0 && (
            <div className="message-selections">
              {item.selections.map((selection, index) => (
                <span key={`${selection.tag}-${index}`}>
                  &lt;{selection.tag}&gt; {selection.text.slice(0, 34)}
                </span>
              ))}
            </div>
          )}
          <p>{item.text}</p>
        </div>
      </article>
    );
  }

  return (
    <article className={`message agent ${item.failed ? "failed" : ""}`}>
      <div className="message-content">
        {item.activities.length > 0 && (
          <div className="activity-list" aria-label="Agent activity" aria-live="polite">
            {item.activities.map((activity) => (
              <ActivityLine key={activity.id} activity={activity} />
            ))}
          </div>
        )}
        {item.text && <p>{item.text}</p>}
        {!item.text && item.activities.length === 0 && (
          <div className="typing">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </article>
  );
}

function ActivityLine({ activity }: { activity: Activity }) {
  const [expanded, setExpanded] = useState(false);
  const hasLongDetail = Boolean(activity.detail && (activity.detail.length > 220 || activity.detail.split("\n").length > 4));

  return (
    <div className={`activity ${activity.done ? "done" : "live"}`}>
      <span className="activity-kind" aria-hidden="true">
        <ActivityIcon activity={activity} />
      </span>
      <span className="activity-copy">
        <strong>
          {activity.label}
          {activity.file ? ` · ${activity.file}` : ""}
        </strong>
        {activity.detail && (
          <span className={`${activity.kind === "command" ? "activity-detail command" : "activity-detail"}${expanded ? " expanded" : ""}`}>
            {activity.detail}
          </span>
        )}
        {hasLongDetail && (
          <button className="activity-more" type="button" onClick={() => setExpanded((current) => !current)}>
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </span>
      {activity.done
        ? <Check className="activity-check" size={13} aria-label="Completed" />
        : <span className="activity-spinner" aria-label="In progress" />}
    </div>
  );
}

function ActivityIcon({ activity }: { activity: Activity }) {
  const size = 14;
  if (activity.kind === "reasoning") return <Brain size={size} />;
  if (activity.kind === "plan") return <ListChecks size={size} />;
  if (activity.kind === "edit") return <FilePenLine size={size} />;
  if (activity.kind === "command") return <Terminal size={size} />;
  if (activity.kind === "search") return <Search size={size} />;
  return <Wrench size={size} />;
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
