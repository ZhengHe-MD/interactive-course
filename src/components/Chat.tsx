import {
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  Expand,
  FilePenLine,
  ListChecks,
  MessageSquarePlus,
  Milestone,
  Search,
  Send,
  Sparkles,
  Square,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Activity, ChatItem, CodexStatus, ConversationSummary, CoursePhase, Selection } from "../types";

export type ChatHandle = { focusComposer: () => void };

type Props = {
  codex: CodexStatus;
  statusText: string;
  connected: boolean;
  working: boolean;
  phase: CoursePhase;
  items: ChatItem[];
  conversationId: string | null;
  conversations: ConversationSummary[];
  open: boolean;
  selections: Selection[];
  onToggleOpen: (open: boolean) => void;
  onNewConversation: () => void;
  onSwitchConversation: (conversationId: string) => void;
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

  useEffect(() => {
    setDraft("");
  }, [props.conversationId]);

  const canSend = connected && !working && (draft.trim().length > 0 || selections.length > 0);
  const lastItem = items.at(-1);
  const activeAgent = working && lastItem?.kind === "agent"
    ? lastItem
    : undefined;
  const activeAgentId = activeAgent?.id;

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
        <div className="conversation-heading">
          <strong>Design agent</strong>
          <select
            aria-label="Switch conversation"
            value={props.conversationId ?? ""}
            disabled={working || props.conversations.length === 0}
            onChange={(event) => props.onSwitchConversation(event.target.value)}
            title="Switch conversation"
          >
            {props.conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
            ))}
          </select>
        </div>
        <span className={`agent-status ${working ? "working" : codex.state}`}>
          <i /> {working ? `working · ${formatElapsed(elapsedSeconds)}` : codex.state === "ready" ? "ready" : statusText}
        </span>
        <button
          className="new-conversation-button"
          onClick={props.onNewConversation}
          aria-label="New conversation"
          title="New conversation"
          disabled={working || !connected}
        >
          <MessageSquarePlus size={16} />
        </button>
        <button className="collapse-chat-button" onClick={() => props.onToggleOpen(false)} aria-label="Collapse chat">
          <ChevronRight size={17} />
        </button>
      </header>

      <div className="chat-messages" ref={scroller}>
        {items.map((item) => (
          <Message key={item.id} item={item} hideActivities={item.id === activeAgentId} />
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
        {working && <WorkingBanner activities={activeAgent?.activities ?? []} />}
        <PhaseGuide
          phase={props.phase}
          canAct={connected && !working}
          onApprove={() => props.onSend("I approve this syllabus. Preserve it and create Session 1 as session1.html.")}
        />
        {selections.length > 0 && (
          <div className="selection-stack">
            {selections.map((selection) => (
              <div className="selection-chip" key={selection.id}>
                {selection.screenshot ? (
                  <img src={selection.screenshot} alt="Selected course element" />
                ) : (
                  <div className="chip-placeholder">{selection.kind === "text" ? "“ ”" : `<${selection.tag}>`}</div>
                )}
                <div>
                  <span>{selection.kind === "text" ? "Quoted text" : `Block · <${selection.tag}>`}</span>
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
            placeholder={working ? "Agent is still working…" : props.placeholder}
            rows={1}
            disabled={working}
          />
          <div className="composer-foot">
            <span>{working ? "the agent is working" : ""}</span>
            {working ? (
              <button className="stop-button" onClick={props.onInterrupt} aria-label="Stop the current turn" title="Stop the agent">
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button onClick={submit} disabled={!canSend} aria-label="Send">
                <Send size={15} />
              </button>
            )}
          </div>
        </div>
        <div className="composer-promise">Selections are context. The course changes only when you ask.</div>
      </div>
    </aside>
  );
});

function PhaseGuide({ phase, canAct, onApprove }: { phase: CoursePhase; canAct: boolean; onApprove: () => void }) {
  if (phase === "learning") return null;

  if (phase === "syllabus") {
    return (
      <section className="phase-guide syllabus" aria-label="Course design phase">
        <Milestone size={15} />
        <div>
          <strong>Step 2 of 3 · Review the syllabus</strong>
          <p>Ask for changes, or approve the plan to begin the first session.</p>
          <button type="button" disabled={!canAct} onClick={onApprove}>Approve &amp; start Session 1</button>
        </div>
      </section>
    );
  }

  return (
    <section className="phase-guide" aria-label="Course design phase">
      <Milestone size={15} />
      <div>
        <strong>Step 1 of 3 · Shape the course</strong>
        <p>Answer the agent’s questions; it will turn your direction into a syllabus.</p>
      </div>
    </section>
  );
}

function Message({ item, hideActivities = false }: { item: ChatItem; hideActivities?: boolean }) {
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
                  {selection.kind === "text" ? "Quote" : `<${selection.tag}>`} · {selection.text.slice(0, 34)}
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
        {!hideActivities && item.activities.length > 0 && (
          <ActivityTimeline activities={item.activities} label="Completed agent activity" />
        )}
        {item.text && (
          <div className="markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
          </div>
        )}
        {!item.text && item.activities.length === 0 && !hideActivities && (
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

function WorkingBanner({ activities }: { activities: Activity[] }) {
  const latest = activities.at(-1);
  const latestDetail = latest
    ? latest.detail || latest.file || (latest.done ? "Moving to the next step…" : "In progress")
    : "Waiting for the first activity…";

  return (
    <details className="working-banner" aria-label="Agent work details">
      <summary>
        <span className="working-banner-spinner" aria-label="Agent working" />
        <span className="working-banner-copy" aria-live="polite">
          <strong>{latest?.label ?? "Starting the request"}</strong>
          <small>{latestDetail}</small>
        </span>
        <ChevronRight className="working-banner-chevron" size={15} aria-hidden="true" />
      </summary>
      <div className="working-activity-list" aria-label="Agent activity history" aria-live="polite">
        {activities.length > 0 ? (
          activities.map((activity) => <ActivityLine key={activity.id} activity={activity} />)
        ) : (
          <div className="activity live">
            <span className="activity-kind" aria-hidden="true"><Sparkles size={14} /></span>
            <span className="activity-copy">
              <strong>Starting the request</strong>
              <span className="activity-detail">Waiting for the first activity…</span>
            </span>
            <span className="activity-spinner" aria-label="In progress" />
          </div>
        )}
      </div>
    </details>
  );
}

function ActivityTimeline({ activities, label }: { activities: Activity[]; label: string }) {
  return (
    <div className="activity-list" aria-label={label}>
      {activities.map((activity) => <ActivityLine key={activity.id} activity={activity} />)}
    </div>
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
