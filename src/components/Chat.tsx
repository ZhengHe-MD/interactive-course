import { useEffect, useRef, useState } from "react";
import { Sparkles, ChevronRight, ChevronLeft, Send, X } from "lucide-react";
import type { AgentStatus, Selection } from "../../shared/protocol.ts";
import type { ChatItem } from "../types.ts";

interface Props {
  agent: AgentStatus;
  connected: boolean;
  hasCourse: boolean;
  items: ChatItem[];
  turnActive: boolean;
  collapsed: boolean;
  pendingSelection: Selection | null;
  onToggleCollapse: () => void;
  onClearSelection: () => void;
  onSend: (text: string) => void;
}

export function Chat(props: Props) {
  const { agent, hasCourse, items, turnActive, collapsed, pendingSelection } = props;
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [items, turnActive]);

  if (collapsed) {
    return (
      <aside className="chat collapsed">
        <div className="chat-header">
          <button className="btn btn-icon" title="Open chat" onClick={props.onToggleCollapse}>
            <ChevronLeft size={17} strokeWidth={2.75} />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="chat">
      <div className="chat-header">
        <span className={`agent-badge${agent.ready ? "" : " offline"}`}>
          <Sparkles size={13} strokeWidth={2.75} />
        </span>
        <span className="chat-title">Design agent</span>
        <span style={{ flex: "1 1 0" }} />
        <button className="btn btn-icon" title="Collapse" onClick={props.onToggleCollapse}>
          <ChevronRight size={17} strokeWidth={2.75} />
        </button>
      </div>

      <div className="chat-body" ref={bodyRef}>
        {!agent.ready && (
          <div className="error-note">
            The agent is offline: {agent.detail}. Make sure Codex is installed and you've run{" "}
            <code>codex login</code>, then restart the studio.
          </div>
        )}
        {items.length === 0 && agent.ready && (
          <div className="msg agent">
            <div className="bubble">
              {hasCourse
                ? "Read the lesson, try the interactions, take the check. Anything confusing, too fast, or too abstract? Hit “Inspect,” click that part of the lesson, and tell me — I'll fold the fix straight into the page."
                : "What would you like to learn today? Tell me the topic, roughly where you're starting from, and how deep you want to go — I'll design the course around you, and it'll appear in the preview as we build it."}
            </div>
          </div>
        )}
        {items.map((item) => (
          <StreamItem key={item.id} item={item} />
        ))}
      </div>

      <div className="chat-composer">
        <Composer
          disabled={!props.connected}
          turnActive={turnActive}
          placeholder={
            hasCourse
              ? "Ask the agent, or inspect a part of the lesson…"
              : "Tell me what you'd like to learn today…"
          }
          pendingSelection={pendingSelection}
          onClearSelection={props.onClearSelection}
          onSend={props.onSend}
        />
        <div className="composer-hint">Answers land in the lesson. The chat is for steering.</div>
      </div>
    </aside>
  );
}

function StreamItem({ item }: { item: ChatItem }) {
  switch (item.t) {
    case "user":
      return (
        <div className="msg user">
          {item.selection && <SelectionChip selection={item.selection} />}
          <div className="bubble">{item.text}</div>
        </div>
      );
    case "agent":
      return (
        <div className="msg agent">
          <div className="bubble">
            {item.text}
            {item.streaming && item.text === "" && (
              <span className="typing">
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
        </div>
      );
    case "activity":
      return (
        <div className="activity">
          <span className="spinner" />
          {item.label}…
        </div>
      );
    case "note":
      return <div className="note">{item.text}</div>;
    case "error":
      return <div className="error-note">{item.text}</div>;
  }
}

function SelectionChip({
  selection,
  onClear,
}: {
  selection: Selection;
  onClear?: () => void;
}) {
  return (
    <div className="chip">
      {selection.screenshot ? (
        <img className="chip-thumb" src={selection.screenshot} alt="" />
      ) : (
        <span className="chip-thumb placeholder">{"<>"}</span>
      )}
      <div className="chip-meta">
        <span className="chip-tag">{"<" + selection.tag + ">"}</span>
        <span className="chip-text">{selection.text || selection.locationHint}</span>
      </div>
      {onClear && (
        <button className="chip-x" title="Remove selection" onClick={onClear}>
          <X size={14} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

function Composer({
  disabled,
  turnActive,
  placeholder,
  pendingSelection,
  onClearSelection,
  onSend,
}: {
  disabled: boolean;
  turnActive: boolean;
  placeholder: string;
  pendingSelection: Selection | null;
  onClearSelection: () => void;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [text]);

  const canSend = !disabled && !turnActive && (text.trim().length > 0 || !!pendingSelection);

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <>
      {pendingSelection && (
        <SelectionChip selection={pendingSelection} onClear={onClearSelection} />
      )}
      <div className="composer-box">
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          className="btn btn-primary btn-icon"
          disabled={!canSend}
          title="Send"
          onClick={submit}
        >
          <Send size={16} strokeWidth={2.75} />
        </button>
      </div>
    </>
  );
}
