import {
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  Expand,
  FilePenLine,
  ListChecks,
  LoaderCircle,
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
  loadingCourse?: boolean;
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
  const { codex, statusText, connected, working, items, open, selections, loadingCourse = false } = props;
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

  const canSend = !loadingCourse && connected && (draft.trim().length > 0 || selections.length > 0);
  const lastItem = items.at(-1);
  const activeAgent = working && lastItem?.kind === "agent" ? lastItem : undefined;
  const activeAgentId = activeAgent?.id;

  const submit = () => {
    if (!canSend) return;
    props.onSend(draft.trim());
    setDraft("");
    if (composer.current) composer.current.style.height = "auto";
  };

  const intent = (() => {
    const text = draft.trim();
    if (!text) return "default";
    if (/\?\s*$/.test(text) || /^(why|what|how|explain|does|do |is |are |when|which|can you explain|为什么|什么是|怎么|解释|是否)/i.test(text)) {
      return "ask";
    }
    return "edit";
  })();

  const quickSuggestions = selections.length > 0
    ? selections.length > 1
      ? [
          { label: t("app.explainDifferently"), text: t("app.explainDifferently") },
          { label: "Make these two agree", text: "Please update the course so these parts agree with each other." },
        ]
      : [
          { label: t("preview.askAboutThis"), text: "Why is this true?" },
          { label: t("app.explainDifferently"), text: t("app.explainDifferently") },
        ]
    : [];

  const [conversationMenuOpen, setConversationMenuOpen] = useState(false);
  const conversationMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (conversationMenuOpen && conversationMenuRef.current && !conversationMenuRef.current.contains(e.target as Node)) {
        setConversationMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [conversationMenuOpen]);

  const activeConversation = props.conversations.find((c) => c.id === props.conversationId)
    ?? props.conversations[0];
  const activeConversationTitle = activeConversation?.title ?? t("chat.newConversation");

  if (!open) {
    return (
      <aside className="codesign-sidebar collapsed" aria-label={t("chat.label")}>
        <button
          className="codesign-icon-btn"
          type="button"
          onClick={() => props.onToggleOpen(true)}
          aria-label={t("chat.open")}
          title={t("chat.open")}
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="codesign-sidebar" aria-label={t("chat.label")}>
      <header className="codesign-header">
        <span className="codesign-title">{t("chat.codesign")}</span>

        <div ref={conversationMenuRef} className="custom-dropdown-wrapper" style={{ flex: 1, minWidth: 0 }}>
          <select
            aria-label={t("chat.switchConversation")}
            className="sr-only"
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

          <button
            type="button"
            className={`codesign-subtitle-btn ${conversationMenuOpen ? "open" : ""}`}
            onClick={() => setConversationMenuOpen((prev) => !prev)}
            aria-label={t("chat.switchConversation")}
            disabled={working || props.conversations.length === 0}
            title={t("chat.switchConversation")}
          >
            <span className="codesign-subtitle-text">{activeConversationTitle}</span>
            <span className={`custom-dropdown-caret ${conversationMenuOpen ? "open" : ""}`}>
              <ChevronDown size={12} strokeWidth={2.5} />
            </span>
          </button>

          {conversationMenuOpen && (
            <div className="custom-dropdown-menu" role="menu" style={{ minWidth: "260px" }}>
              <span className="custom-dropdown-heading">{t("chat.switchConversation")}</span>
              {props.conversations.map((c) => {
                const isCurrent = c.id === props.conversationId;
                return (
                  <button
                    type="button"
                    key={c.id}
                    role="menuitem"
                    className={`custom-dropdown-item ${isCurrent ? "active" : ""}`}
                    onClick={() => {
                      setConversationMenuOpen(false);
                      if (!isCurrent) props.onSwitchConversation(c.id);
                    }}
                  >
                    <span
                      className="course-menu-dot"
                      style={{
                        background: isCurrent ? "var(--color-accent)" : "var(--color-accent-2-500)",
                      }}
                    />
                    <span className="custom-dropdown-item-info">
                      <span className="custom-dropdown-item-title">{c.title}</span>
                      {c.readOnly && (
                        <span className="custom-dropdown-item-desc">{t("chat.readOnly")}</span>
                      )}
                    </span>
                    {isCurrent && (
                      <Check className="custom-dropdown-check" size={14} strokeWidth={2.75} />
                    )}
                  </button>
                );
              })}
              <span className="custom-dropdown-divider" />
              <button
                type="button"
                className="custom-dropdown-action-btn"
                onClick={() => {
                  setConversationMenuOpen(false);
                  props.onNewConversation();
                }}
                disabled={working || !connected}
              >
                <MessageSquarePlus size={13} strokeWidth={2.5} />
                <span>{t("chat.newConversation")}</span>
              </button>
            </div>
          )}
        </div>

        <span className={`codesign-status-pill ${working ? "working" : ""}`}>
          <span className="codesign-status-dot" />
          <span>
            {working
              ? `${t("chat.working")} · ${formatElapsed(elapsedSeconds)}`
              : codex.state === "ready"
                ? t("chat.ready")
                : statusText}
          </span>
        </span>

        <button
          className="codesign-icon-btn"
          type="button"
          onClick={props.onNewConversation}
          aria-label={t("chat.newConversation")}
          title={t("chat.newConversation")}
          disabled={working || !connected}
        >
          <MessageSquarePlus size={15} strokeWidth={2.2} />
        </button>

        <button
          className="codesign-icon-btn"
          type="button"
          onClick={() => props.onToggleOpen(false)}
          aria-label={t("chat.collapse")}
          title={t("chat.collapse")}
        >
          <ChevronRight size={16} strokeWidth={2.2} />
        </button>
      </header>

      <div className="codesign-messages-list" ref={scroller}>
        {loadingCourse ? (
          <div className="course-loading-message" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "200px", padding: "48px 16px", gap: "12px", color: "var(--color-neutral-600)", textAlign: "center" }}>
            <LoaderCircle className="spin" size={22} style={{ color: "var(--color-accent)" }} />
            <span style={{ fontSize: "13.5px", fontWeight: 500 }}>
              {statusText.toLowerCase().includes("switch") || statusText.includes("加载") || statusText.includes("切换")
                ? t("chat.switchingCourse")
                : t("chat.loadingCourse")}
            </span>
          </div>
        ) : (
          <>
            {items.map((item) => (
              <Message key={item.id} item={item} hideActivities={item.id === activeAgentId} />
            ))}
            {codex.state === "starting" && (
              <div className="system-message" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-neutral-600)" }}>
                <LoaderCircle className="spin" size={13} /> {t("chat.connectingCodex")}
              </div>
            )}
          </>
        )}
      </div>

      <div className="codesign-composer-wrap">
        {!loadingCourse && working && <WorkingBanner activities={activeAgent?.activities ?? []} />}

        {!loadingCourse && (
          <PhaseGuide
            phase={props.phase}
            canAct={connected && !working}
            onApprove={() => props.onSend(t("chat.approvePrompt"))}
          />
        )}

        {!loadingCourse && selections.length > 0 && (
          <div className="attached-chips-row">
            {selections.map((selection) => (
              <span className="attached-chip-pill" key={selection.id}>
                <span className="attached-chip-tag">
                  {selection.kind === "text" ? t("chat.quotedText") : `<${selection.tag}>`}
                </span>
                <span className="attached-chip-label">
                  {selection.text}
                </span>
                {selection.canExpand && (
                  <button
                    type="button"
                    className="attached-chip-remove"
                    onClick={() => props.onExpandSelection(selection.id)}
                    title={t("chat.expandSelection")}
                  >
                    <Expand size={11} strokeWidth={2.5} />
                  </button>
                )}
                <button
                  type="button"
                  className="attached-chip-remove"
                  onClick={() => props.onRemoveSelection(selection.id)}
                  title={t("chat.removeSelection")}
                >
                  <X size={11} strokeWidth={3} />
                </button>
              </span>
            ))}
          </div>
        )}

        {!loadingCourse && quickSuggestions.length > 0 && (
          <div className="quick-prompts-row">
            {quickSuggestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                className="quick-prompt-btn"
                onClick={() => props.onSend(q.text)}
              >
                {q.label}
              </button>
            ))}
          </div>
        )}

        <div className="composer-box-card">
          <textarea
            ref={composer}
            value={draft}
            disabled={loadingCourse}
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
            placeholder={
              loadingCourse
                ? (statusText.toLowerCase().includes("switch") || statusText.includes("加载") || statusText.includes("切换")
                    ? t("chat.switchingCourse")
                    : t("chat.loadingCourse"))
                : working
                  ? t("chat.steerPlaceholder")
                  : props.placeholder
            }
            rows={1}
          />
          <div className="composer-controls-row">
            <span className={`intent-status-hint ${intent === "edit" ? "editing" : ""}`}>
              {loadingCourse
                ? ""
                : intent === "edit"
                  ? t("chat.intentEdit")
                  : intent === "ask"
                    ? t("chat.intentAsk")
                    : t("chat.intentDefault")}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {working && !loadingCourse && (
                <button
                  className="stop-button"
                  type="button"
                  onClick={props.onInterrupt}
                  aria-label={t("chat.stopTurn")}
                  title={t("chat.stopAgent")}
                >
                  <Square size={12} fill="currentColor" />
                </button>
              )}
              <button
                className={working && !loadingCourse ? "steer-button" : "send-button"}
                type="button"
                onClick={submit}
                disabled={!canSend}
                aria-label={working && !loadingCourse ? t("chat.steerAgent") : t("chat.send")}
                title={working && !loadingCourse ? t("chat.steerAgent") : t("chat.send")}
              >
                <ArrowRight size={15} strokeWidth={2.75} />
              </button>
            </div>
          </div>
        </div>

        <AgentControls
          models={props.models ?? []}
          value={props.agentConfig ?? null}
          disabled={working || loadingCourse}
          onChange={props.onAgentConfigChange ?? (() => {})}
        />

        <div style={{ fontSize: "11px", color: "var(--color-neutral-600)", textAlign: "center", marginTop: "2px" }}>
          {t("chat.promise")}
        </div>
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
        <div className="phase-guide-content">
          <Milestone size={14} className="phase-guide-icon" />
          <div className="phase-guide-text">
            <strong>{t("chat.reviewSyllabus")}</strong>
            <span>{t("chat.reviewSyllabusDescription")}</span>
          </div>
        </div>
        <button
          type="button"
          className="phase-guide-action-btn"
          disabled={!canAct}
          onClick={onApprove}
        >
          <Check size={12} strokeWidth={3} />
          <span>{t("chat.approve")}</span>
        </button>
      </section>
    );
  }

  return (
    <section className="phase-guide empty" aria-label={t("chat.courseDesignPhase")}>
      <div className="phase-guide-content">
        <Sparkles size={14} className="phase-guide-icon" />
        <div className="phase-guide-text">
          <strong>{t("chat.shapeCourse")}</strong>
          <span>{t("chat.shapeCourseDescription")}</span>
        </div>
      </div>
    </section>
  );
}

function Message({ item, hideActivities = false }: { item: ChatItem; hideActivities?: boolean }) {
  const { t } = useI18n();

  if (item.kind === "system") {
    return (
      <div className={`system-message message system ${item.failed ? "failed" : ""}`}>
        {item.text}
      </div>
    );
  }

  if (item.kind === "user") {
    return (
      <article className="message-row user message user">
        {item.selections.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "3px" }}>
            {item.selections.map((selection, index) => (
              <span key={`${selection.tag}-${index}`} className="user-chip-badge">
                {selection.kind === "text" ? t("chat.quotedText") : `<${selection.tag}>`} · {selection.text.slice(0, 34)}
              </span>
            ))}
          </div>
        )}
        <div className="user-bubble message-content">
          <p style={{ margin: 0 }}>{item.text}</p>
        </div>
      </article>
    );
  }

  const thinkingActivity = item.activities.find((a) => a.kind === "reasoning" || a.label === "Thinking");
  const otherActivities = item.activities.filter((a) => a !== thinkingActivity);

  return (
    <article className={`message-row agent message agent ${item.failed ? "failed" : ""}`}>
      <div className="agent-bubble message-content">
        {thinkingActivity && (
          <details className="agent-thinking-details">
            <summary className="agent-thinking-summary">
              <span className="agent-thinking-dot" />
              <span>{thinkingActivity.detail ? `Thought · ${thinkingActivity.detail.slice(0, 40)}…` : "Thought for a moment"}</span>
            </summary>
            {thinkingActivity.detail && (
              <div className="agent-thinking-content">
                {thinkingActivity.detail}
              </div>
            )}
          </details>
        )}

        {!hideActivities && otherActivities.length > 0 && (
          <details className="agent-activity-details agent-thinking-details" style={{ marginTop: thinkingActivity ? "6px" : "0" }}>
            <summary className="agent-thinking-summary">
              <span className="agent-thinking-dot" style={{ background: "var(--color-accent-2-700)" }} />
              <span>{t("chat.completedActivity")} ({otherActivities.length})</span>
            </summary>
            <div className="agent-thinking-content" style={{ marginTop: "6px", padding: "6px 8px" }}>
              <ActivityTimeline activities={otherActivities} label={t("chat.completedActivity")} />
            </div>
          </details>
        )}

        {item.text && (
          <div className="markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
          </div>
        )}

        {!item.text && item.activities.length === 0 && !hideActivities && (
          <div className="typing" style={{ display: "flex", gap: "4px", padding: "4px 0" }}>
            <span className="activity-dot-indicator running" />
            <span className="activity-dot-indicator running" />
            <span className="activity-dot-indicator running" />
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
    <details className="working-banner" aria-label={t("activity.details")} style={{ padding: "10px 12px", background: "var(--color-surface)", border: "1px solid var(--color-neutral-300)", borderRadius: "var(--radius-sm)" }}>
      <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", listStyle: "none" }}>
        <span className="working-banner-spinner activity-dot-indicator running" aria-label={t("activity.agentWorking")} />
        <span className="working-banner-copy" aria-live="polite" style={{ flex: 1, fontSize: "12px", color: "var(--color-text)" }}>
          <strong>{latest ? localizeActivityLabel(latest.label, t) : t("activity.startingRequest")}</strong>
          <span style={{ marginLeft: "6px", fontSize: "11px", color: "var(--color-neutral-600)" }}>{latestDetail}</span>
        </span>
        <ChevronRight className="working-banner-chevron" size={14} aria-hidden="true" style={{ color: "var(--color-neutral-600)" }} />
      </summary>
      <div className="working-activity-list" aria-label={t("activity.history")} aria-live="polite" style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
        {activities.length > 0 ? (
          activities.map((activity) => <ActivityLine key={activity.id} activity={activity} />)
        ) : (
          <div className="activity live" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11.5px" }}>
            <span className="activity-dot-indicator running" aria-label={t("activity.inProgress")} />
            <span className="activity-copy">
              <strong>{t("activity.startingRequest")}</strong>
            </span>
          </div>
        )}
      </div>
    </details>
  );
}

function ActivityTimeline({ activities, label }: { activities: Activity[]; label: string }) {
  return (
    <div className="activity-list" aria-label={label} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
      {activities.map((activity) => <ActivityLine key={activity.id} activity={activity} />)}
    </div>
  );
}

function ActivityLine({ activity }: { activity: Activity }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const hasLongDetail = Boolean(activity.detail && (activity.detail.length > 220 || activity.detail.split("\n").length > 4));

  return (
    <div className={`activity-line ${activity.done ? "done" : "live"}`}>
      <div className="activity-icon-container">
        {activity.done ? (
          <Check size={12} strokeWidth={2.75} style={{ color: "var(--color-accent-2-700)" }} aria-label={t("activity.completed")} />
        ) : (
          <span className="activity-dot-indicator running" aria-label={t("activity.inProgress")} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className="activity-text-copy">
          <strong>
            {localizeActivityLabel(activity.label, t)}
            {activity.file ? ` · ${activity.file}` : ""}
          </strong>
        </span>
        {activity.detail && (
          <div style={{ fontSize: "11px", color: "var(--color-neutral-600)", marginTop: "2px" }}>
            {activity.detail}
          </div>
        )}
        {hasLongDetail && (
          <button
            className="activity-more"
            type="button"
            style={{ border: 0, background: "transparent", fontSize: "10.5px", color: "var(--color-accent)", cursor: "pointer", padding: 0 }}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? t("activity.showLess") : t("activity.showMore")}
          </button>
        )}
      </div>
    </div>
  );
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
