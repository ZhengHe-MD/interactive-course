import { ArrowLeft, ArrowRight, Check, ChevronDown, LoaderCircle, Shield } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import type { AgentConfig, AgentModel, CourseSummary } from "../types";
import { AgentControls } from "./AgentControls";
import { LanguageSwitch } from "./LanguageSwitch";

type Props = {
  connected: boolean;
  hasCourse: boolean;
  working: boolean;
  courseId: string;
  courses: CourseSummary[];
  switchingCourseId?: string | null;
  models?: AgentModel[];
  agentConfig?: AgentConfig | null;
  onAgentConfigChange?: (config: AgentConfig) => void;
  onBack: () => void;
  onSwitchCourse: (courseId: string) => void;
  onStart: (topic: string) => void;
};

export function Welcome({
  connected,
  hasCourse,
  working,
  courseId,
  courses,
  switchingCourseId = null,
  models = [],
  agentConfig = null,
  onAgentConfigChange = () => {},
  onBack,
  onSwitchCourse,
  onStart,
}: Props) {
  const { t } = useI18n();
  const [topic, setTopic] = useState("");
  const [courseMenuOpen, setCourseMenuOpen] = useState(false);
  const courseMenuRef = useRef<HTMLDivElement | null>(null);
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const isSwitching = Boolean(switchingCourseId);
  const canStart = connected && !working && !isSwitching && topic.trim().length > 0;

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (courseMenuOpen && courseMenuRef.current && !courseMenuRef.current.contains(e.target as Node)) {
        setCourseMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [courseMenuOpen]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (canStart) onStart(topic.trim());
  };

  const chooseSuggestion = (suggestion: string) => {
    setTopic(suggestion);
    window.setTimeout(() => composer.current?.focus(), 0);
  };
  const suggestions = [
    "Chip design from the bottom up",
    "Bayes' theorem, properly",
    "How compilers really work",
  ];

  const currentCourse = courses.find((c) => c.id === (switchingCourseId ?? courseId));
  const currentCourseTitle = currentCourse?.title ?? t("welcome.openCourse");

  return (
    <div className="welcome-page-container">
      <header className="welcome-header">
        <div className="welcome-brand" onClick={hasCourse ? onBack : undefined} role={hasCourse ? "button" : undefined}>
          <span className="topbar-brand-icon">
            <Shield size={13} strokeWidth={2.75} />
          </span>
          <span className="welcome-brand-text">Course Studio</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {courses.length > 0 && (
            <div ref={courseMenuRef} className="custom-dropdown-wrapper">
              <select
                aria-label={t("welcome.openCourse")}
                className="sr-only"
                tabIndex={-1}
                value={switchingCourseId ?? courseId}
                disabled={working || isSwitching}
                onChange={(event) => onSwitchCourse(event.target.value)}
              >
                <option value="" disabled>{t("welcome.openCourse")}</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>

              <button
                type="button"
                className={`course-switcher-btn ${courseMenuOpen ? "open" : ""}`}
                onClick={() => setCourseMenuOpen((prev) => !prev)}
                aria-label={t("welcome.openCourse")}
                disabled={working || isSwitching}
                title={t("welcome.openCourse")}
              >
                <span className="course-switcher-title">{currentCourseTitle}</span>
                {isSwitching ? (
                  <LoaderCircle className="spin course-switcher-spinner" size={13} />
                ) : (
                  <span className={`course-switcher-caret ${courseMenuOpen ? "open" : ""}`}>
                    <ChevronDown size={13} strokeWidth={2.5} />
                  </span>
                )}
              </button>

              {courseMenuOpen && (
                <div className="course-menu-dropdown align-right" role="menu">
                  <span className="course-menu-heading">{t("toolbar.yourShelf")}</span>
                  {courses.map((c) => {
                    const isCurrent = c.id === (switchingCourseId ?? courseId);
                    return (
                      <button
                        type="button"
                        key={c.id}
                        role="menuitem"
                        className={`course-menu-item ${isCurrent ? "active" : ""}`}
                        onClick={() => {
                          setCourseMenuOpen(false);
                          if (!isCurrent) onSwitchCourse(c.id);
                        }}
                      >
                        <span
                          className="course-menu-dot"
                          style={{
                            background: c.phase === "syllabus" ? "var(--color-accent-500)" : "var(--color-accent-2-500)",
                          }}
                        />
                        <span className="course-menu-info">
                          <span className="course-menu-name">{c.title}</span>
                          <span className="course-menu-meta">
                            {c.phase === "syllabus" ? t("nav.plan") : t("nav.session")}
                          </span>
                        </span>
                        {isCurrent && (
                          <Check className="course-menu-check" size={14} strokeWidth={2.75} />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <LanguageSwitch />
          {hasCourse && (
            <button
              type="button"
              className="welcome-back-btn"
              onClick={onBack}
              disabled={isSwitching}
            >
              <ArrowLeft size={13} strokeWidth={2.5} />
              <span>{t("welcome.back")}</span>
            </button>
          )}
        </div>
      </header>

      <main className="welcome-content-stage">
        <section className="welcome-hero-section">
          <h1 className="welcome-hero-title">{t("welcome.title")}</h1>
          <p className="welcome-hero-subtitle">{t("welcome.description")}</p>

          <form className="welcome-composer-card" onSubmit={submit}>
            <div className="welcome-composer-top">
              <textarea
                ref={composer}
                className="welcome-composer-input"
                rows={2}
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                placeholder={t("welcome.placeholder")}
                aria-label={t("welcome.topicLabel")}
              />
              <button
                type="submit"
                className="welcome-start-btn"
                disabled={!canStart}
              >
                <span>{t("welcome.design")}</span>
                <ArrowRight size={15} strokeWidth={2.75} />
              </button>
            </div>

            <div className="welcome-composer-bottom">
              <AgentControls
                models={models}
                value={agentConfig}
                disabled={working}
                onChange={onAgentConfigChange}
              />
              <span className="welcome-composer-hint">Plain HTML · offline · no build step</span>
            </div>
          </form>

          <div className="welcome-suggestions-row" aria-label={t("welcome.suggestionsLabel")}>
            <span className="welcome-suggestions-label">Or borrow a starting point:</span>
            {suggestions.map((suggestion) => (
              <button
                type="button"
                className="welcome-suggestion-pill"
                key={suggestion}
                onClick={() => chooseSuggestion(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          {!connected && (
            <div className="welcome-connecting-status">
              <LoaderCircle className="spin" size={13} /> {t("welcome.connecting")}
            </div>
          )}
        </section>

        {courses.length > 0 && (
          <section className="welcome-shelf-section">
            <div className="welcome-shelf-heading-row">
              <h2 className="welcome-shelf-title">{t("welcome.yourShelf")}</h2>
              <span className="welcome-shelf-count-badge">
                {courses.length} {courses.length === 1 ? "course" : "courses"}
              </span>
            </div>

            <div className="welcome-shelf-grid">
              {courses.map((c) => {
                const inProgress = c.phase !== "syllabus" && c.hasContent;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="welcome-shelf-card"
                    onClick={() => onSwitchCourse(c.id)}
                    disabled={isSwitching}
                  >
                    <div className="welcome-shelf-card-status-row">
                      <span
                        className="welcome-shelf-card-dot"
                        style={{ background: inProgress ? "var(--color-accent-2-500)" : "var(--color-accent-500)" }}
                      />
                      <span className="welcome-shelf-card-status-label">
                        {c.phase === "syllabus" ? "Plan only" : "In progress"}
                      </span>
                    </div>

                    <strong className="welcome-shelf-card-title">{c.title}</strong>
                    <p className="welcome-shelf-card-desc">
                      {c.phase === "syllabus" ? t("nav.plan") : t("nav.session")}
                    </p>

                    <div className="welcome-shelf-card-footer">
                      <span className="welcome-shelf-progress-track">
                        <span
                          className="welcome-shelf-progress-bar"
                          style={{ width: inProgress ? "65%" : "20%" }}
                        />
                      </span>
                      <span className="welcome-shelf-timestamp">
                        {c.phase === "syllabus" ? "Draft" : "Active"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <footer className="welcome-footer-notice">
        {t("welcome.footer")}
      </footer>
    </div>
  );
}

