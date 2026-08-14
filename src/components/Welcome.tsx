import { ArrowRight, ChevronLeft, ChevronRight, LoaderCircle, Shield } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { useI18n } from "../i18n";
import type { AgentConfig, AgentModel, CourseSummary } from "../types";
import { AgentControls } from "./AgentControls";
import { LanguageSwitch } from "./LanguageSwitch";

type Props = {
  connected: boolean;
  hasCourse?: boolean;
  working: boolean;
  courseId?: string;
  courses: CourseSummary[];
  switchingCourseId?: string | null;
  models?: AgentModel[];
  agentConfig?: AgentConfig | null;
  onAgentConfigChange?: (config: AgentConfig) => void;
  onBack?: () => void;
  onSwitchCourse: (courseId: string) => void;
  onStart: (topic: string) => void;
};

export function Welcome({
  connected,
  hasCourse: _hasCourse,
  working,
  courseId: _courseId,
  courses,
  switchingCourseId = null,
  models = [],
  agentConfig = null,
  onAgentConfigChange = () => {},
  onBack: _onBack,
  onSwitchCourse,
  onStart,
}: Props) {
  const { t } = useI18n();
  const [topic, setTopic] = useState("");
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const shelfTrackRef = useRef<HTMLDivElement | null>(null);
  const isSwitching = Boolean(switchingCourseId);
  const canStart = connected && !working && !isSwitching && topic.trim().length > 0;

  const scrollShelf = (direction: number) => {
    if (shelfTrackRef.current) {
      const scrollAmount = shelfTrackRef.current.clientWidth * 0.65;
      shelfTrackRef.current.scrollBy({ left: direction * scrollAmount, behavior: "smooth" });
    }
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (canStart) onStart(topic.trim());
  };

  return (
    <div className="welcome-page-container">
      <header className="welcome-header">
        <div className="welcome-brand">
          <span className="topbar-brand-icon">
            <Shield size={13} strokeWidth={2.75} />
          </span>
          <span className="welcome-brand-text">Course Studio</span>
        </div>

        <div className="welcome-header-actions">
          <LanguageSwitch />
        </div>
      </header>

      <main className="welcome-content-stage">
        <section className="welcome-hero-section">
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
            </div>
          </form>
        </section>

        <section className="welcome-shelf-section">
          <div className="welcome-shelf-heading-row">
            <h2 className="welcome-shelf-title">{t("welcome.yourShelf")}</h2>
            <div
              className="welcome-shelf-nav-arrows"
              aria-label="Course shelf navigation"
              style={{ visibility: courses.length > 2 ? "visible" : "hidden" }}
            >
              <button
                type="button"
                className="shelf-arrow-btn"
                onClick={() => scrollShelf(-1)}
                aria-label="Previous courses"
                title="Previous"
              >
                <ChevronLeft size={16} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                className="shelf-arrow-btn"
                onClick={() => scrollShelf(1)}
                aria-label="Next courses"
                title="Next"
              >
                <ChevronRight size={16} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          {courses.length === 0 ? (
            <div className="welcome-shelf-loading">
              <LoaderCircle className="spin" size={15} />
              <span>{t("welcome.connecting")}</span>
            </div>
          ) : (
            <div className="welcome-shelf-track-wrapper">
              <div className="welcome-shelf-track" ref={shelfTrackRef}>
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
                          {c.phase === "syllabus" ? t("welcome.planOnly") : t("welcome.inProgress")}
                        </span>
                      </div>

                      <strong className="welcome-shelf-card-title">{c.title}</strong>

                      <div className="welcome-shelf-card-footer">
                        <span className="welcome-shelf-progress-track">
                          <span
                            className="welcome-shelf-progress-bar"
                            style={{ width: inProgress ? "65%" : "20%" }}
                          />
                        </span>
                        <span className="welcome-shelf-timestamp">
                          {c.phase === "syllabus" ? t("welcome.draft") : t("welcome.active")}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

