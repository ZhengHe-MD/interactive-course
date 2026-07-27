import { Bot, Check, ChevronLeft, ChevronRight, CornerUpLeft, Expand, MessageCircle, Send, Sparkles, Square, X } from "lucide-react";
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
            <ChevronLeft size={17} />
          </button>
          <MessageCircle size={19} />
          <span>Course agent</span>
          <i className={working ? "working" : codex.state} />
        </div>
      </aside>
    );
  }

  return (
    <aside className="chat-panel" aria-label="Course agent chat">
      <header className="chat-header">
        <div className={`agent-avatar ${working ? "working" : ""}`}>
          <Sparkles size={16} />
        </div>
        <div>
          <strong>Course agent</strong>
          <span>
            <i className={codex.state} />
            {statusText}
          </span>
        </div>
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
            <span>{working ? "the agent is working" : "↵ send · ⇧↵ newline"}</span>
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
      <div className="message-avatar">
        <Bot size={14} />
      </div>
      <div className="message-content">
        {item.activities.map((activity) => (
          <ActivityLine key={activity.id} activity={activity} />
        ))}
        {item.text && <p>{item.text}</p>}
        {!item.text && (
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
  return (
    <div className={`activity ${activity.done ? "done" : ""}`}>
      {activity.done ? <Check size={13} /> : <span className="activity-spinner" />}
      <span>
        {activity.label}
        {activity.file ? ` · ${activity.file}` : ""}
      </span>
    </div>
  );
}
