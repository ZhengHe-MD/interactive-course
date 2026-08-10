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
import { useI18n, type TranslationKey } from "../i18n";
import type { Activity, AgentConfig, AgentModel, ChatItem, CodexStatus, ConversationSummary, CoursePhase, Selection } from "../types";
import { AgentControls } from "./AgentControls";

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
  models?: AgentModel[];
  agentConfig?: AgentConfig | null;
  onAgentConfigChange?: (config: AgentConfig) => void;
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
  const { t } = useI18n();
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

  const canSend = connected && (draft.trim().length > 0 || selections.length > 0);
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
      <aside className="chat-panel" aria-label={t("chat.label")}>
        <div className="collapsed-chat">
          <button onClick={() => props.onToggleOpen(true)} aria-label={t("chat.open")}>
            <span className="agent-avatar"><ChevronLeft size={15} /></span>
            <span>{t("chat.agent")}</span>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="chat-panel" aria-label={t("chat.label")}>
      <header className="chat-header">
        <div className={`agent-avatar ${working ? "working" : ""}`}>
          <Sparkles size={13} />
        </div>
        <div className="conversation-heading">
          <strong>{t("chat.agent")}</strong>
          <select
            aria-label={t("chat.switchConversation")}
            value={props.conversationId ?? ""}
            disabled={working || props.conversations.length === 0}
            onChange={(event) => props.onSwitchConversation(event.target.value)}
            title={t("chat.switchConversation")}
          >
            {props.conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title}{conversation.readOnly ? ` · ${t("chat.readOnly")}` : ""}
              </option>
            ))}
          </select>
        </div>
        <span className={`agent-status ${working ? "working" : codex.state}`}>
          <i /> {working ? `${t("chat.working")} · ${formatElapsed(elapsedSeconds)}` : codex.state === "ready" ? t("chat.ready") : statusText}
        </span>
        <button
          className="new-conversation-button"
          onClick={props.onNewConversation}
          aria-label={t("chat.newConversation")}
          title={t("chat.newConversation")}
          disabled={working || !connected}
        >
          <MessageSquarePlus size={16} />
        </button>
        <button className="collapse-chat-button" onClick={() => props.onToggleOpen(false)} aria-label={t("chat.collapse")}>
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
            <span /> {t("chat.connectingCodex")}
          </div>
        )}
      </div>

      <div className="composer-wrap">
        {working && <WorkingBanner activities={activeAgent?.activities ?? []} />}
        <PhaseGuide
          phase={props.phase}
          canAct={connected && !working}
          onApprove={() => props.onSend(t("chat.approvePrompt"))}
        />
        {selections.length > 0 && (
          <div className="selection-stack">
            {selections.map((selection) => (
              <div className="selection-chip" key={selection.id}>
                {selection.screenshot ? (
                  <img src={selection.screenshot} alt={t("chat.selectedElement")} />
                ) : (
                  <div className="chip-placeholder">{selection.kind === "text" ? "“ ”" : `<${selection.tag}>`}</div>
                )}
                <div>
                  <span>{selection.kind === "text" ? t("chat.quotedText") : `${t("chat.block")} · <${selection.tag}>`}</span>
                  <p>{selection.text}</p>
                </div>
                <div className="chip-actions">
                  {selection.canExpand && (
                    <button
                      onClick={() => props.onExpandSelection(selection.id)}
                      title={t("chat.expandSelection")}
                    >
                      <Expand size={13} />
                    </button>
                  )}
                  <button onClick={() => props.onRemoveSelection(selection.id)} title={t("chat.removeSelection")}>
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
            placeholder={working ? t("chat.steerPlaceholder") : props.placeholder}
            rows={1}
          />
          <div className="composer-foot">
            <span>{working ? t("chat.agentWorking") : ""}</span>
            {working && (
              <button className="stop-button" onClick={props.onInterrupt} aria-label={t("chat.stopTurn")} title={t("chat.stopAgent")}>
                <Square size={12} fill="currentColor" />
              </button>
            )}
            <button
              className={working ? "steer-button" : "send-button"}
              onClick={submit}
              disabled={!canSend}
              aria-label={working ? t("chat.steerAgent") : t("chat.send")}
              title={working ? t("chat.steerAgent") : t("chat.send")}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
        <AgentControls
          models={props.models ?? []}
          value={props.agentConfig ?? null}
          disabled={working}
          onChange={props.onAgentConfigChange ?? (() => {})}
        />
        <div className="composer-promise">{t("chat.promise")}</div>
      </div>
    </aside>
  );
});

function PhaseGuide({ phase, canAct, onApprove }: { phase: CoursePhase; canAct: boolean; onApprove: () => void }) {
  const { t } = useI18n();
  if (phase === "learning") return null;

  if (phase === "syllabus") {
    return (
      <section className="phase-guide syllabus" aria-label={t("chat.courseDesignPhase")}>
        <Milestone size={15} />
        <div>
          <strong>{t("chat.reviewSyllabus")}</strong>
          <p>{t("chat.reviewSyllabusDescription")}</p>
          <button type="button" disabled={!canAct} onClick={onApprove}>{t("chat.approve")}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="phase-guide" aria-label={t("chat.courseDesignPhase")}>
      <Milestone size={15} />
      <div>
        <strong>{t("chat.shapeCourse")}</strong>
        <p>{t("chat.shapeCourseDescription")}</p>
      </div>
    </section>
  );
}

function Message({ item, hideActivities = false }: { item: ChatItem; hideActivities?: boolean }) {
  const { t } = useI18n();
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
                  {selection.kind === "text" ? t("chat.quote") : `<${selection.tag}>`} · {selection.text.slice(0, 34)}
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
          <ActivityTimeline activities={item.activities} label={t("chat.completedActivity")} />
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
  const { t } = useI18n();
  const latest = activities.at(-1);
  const latestDetail = latest
    ? latest.detail || latest.file || (latest.done ? t("activity.nextStep") : t("activity.inProgress"))
    : t("activity.waiting");

  return (
    <details className="working-banner" aria-label={t("activity.details")}>
      <summary>
        <span className="working-banner-spinner" aria-label={t("activity.agentWorking")} />
        <span className="working-banner-copy" aria-live="polite">
          <strong>{latest ? localizeActivityLabel(latest.label, t) : t("activity.startingRequest")}</strong>
          <small>{latestDetail}</small>
        </span>
        <ChevronRight className="working-banner-chevron" size={15} aria-hidden="true" />
      </summary>
      <div className="working-activity-list" aria-label={t("activity.history")} aria-live="polite">
        {activities.length > 0 ? (
          activities.map((activity) => <ActivityLine key={activity.id} activity={activity} />)
        ) : (
          <div className="activity live">
            <span className="activity-kind" aria-hidden="true"><Sparkles size={14} /></span>
            <span className="activity-copy">
              <strong>{t("activity.startingRequest")}</strong>
              <span className="activity-detail">{t("activity.waiting")}</span>
            </span>
            <span className="activity-spinner" aria-label={t("activity.inProgress")} />
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
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const hasLongDetail = Boolean(activity.detail && (activity.detail.length > 220 || activity.detail.split("\n").length > 4));

  return (
    <div className={`activity ${activity.done ? "done" : "live"}`}>
      <span className="activity-kind" aria-hidden="true">
        <ActivityIcon activity={activity} />
      </span>
      <span className="activity-copy">
        <strong>
          {localizeActivityLabel(activity.label, t)}
          {activity.file ? ` · ${activity.file}` : ""}
        </strong>
        {activity.detail && (
          <span className={`${activity.kind === "command" ? "activity-detail command" : "activity-detail"}${expanded ? " expanded" : ""}`}>
            {activity.detail}
          </span>
        )}
        {hasLongDetail && (
          <button className="activity-more" type="button" onClick={() => setExpanded((current) => !current)}>
            {expanded ? t("activity.showLess") : t("activity.showMore")}
          </button>
        )}
      </span>
      {activity.done
        ? <Check className="activity-check" size={13} aria-label={t("activity.completed")} />
        : <span className="activity-spinner" aria-label={t("activity.inProgress")} />}
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

function localizeActivityLabel(label: string, t: (key: TranslationKey) => string) {
  const labels: Record<string, TranslationKey> = {
    Starting: "activity.starting",
    Working: "activity.working",
    Thinking: "activity.thinking",
    "Thought through the request": "activity.thoughtThrough",
    "Plan complete": "activity.planComplete",
    Planning: "activity.planning",
    "Plan ready": "activity.planReady",
    "Using a tool": "activity.usingTool",
    "Updated the course": "activity.updatedCourse",
    "Editing the course": "activity.editingCourse",
    "Ran a command": "activity.ranCommand",
    "Running a command": "activity.runningCommand",
    "Searched the web": "activity.searchedWeb",
    "Searching the web": "activity.searchingWeb",
    "Finished delegated work": "activity.finishedDelegation",
    "Delegating work": "activity.delegating",
    "Sub-agent finished": "activity.subagentFinished",
    "Sub-agent working": "activity.subagentWorking",
    "Inspected an image": "activity.inspectedImage",
    "Inspecting an image": "activity.inspectingImage",
    "Generated an image": "activity.generatedImage",
    "Generating an image": "activity.generatingImage",
    "Wait finished": "activity.waitFinished",
    Waiting: "activity.waitingShort",
    "Context organized": "activity.contextOrganized",
    "Organizing context": "activity.organizingContext",
  };
  const key = labels[label];
  if (key) return t(key);
  if (label.startsWith("Planning · ")) return label.replace("Planning", t("activity.planning"));
  if (label.startsWith("Used ")) return label.replace("Used", t("activity.usedPrefix"));
  if (label.startsWith("Using ")) return label.replace("Using", t("activity.usingPrefix"));
  return label;
}
