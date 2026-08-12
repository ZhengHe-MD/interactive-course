import { ArrowLeft, ArrowRight, LoaderCircle, Shield } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
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
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const isSwitching = Boolean(switchingCourseId);
  const canStart = connected && !working && !isSwitching && topic.trim().length > 0;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (canStart) onStart(topic.trim());
  };

  const chooseSuggestion = (suggestion: string) => {
    setTopic(suggestion);
    window.setTimeout(() => composer.current?.focus(), 0);
  };
  const suggestions = [t("welcome.suggestionBayes"), t("welcome.suggestionRates"), t("welcome.suggestionConditional")];

  return (
    <main className="welcome-screen">
      <header className="welcome-header">
        <div className="studio-wordmark">
          <span className="brand-mark"><Shield size={15} /></span>
          <span>Course Studio</span>
        </div>
        <div className="welcome-actions">
          {courses.length > 1 && (
            <label className="welcome-course-picker">
              <span>{t("welcome.openCourse")}</span>
              <div className="welcome-course-picker-select-wrapper">
                <select
                  value={switchingCourseId ?? courseId}
                  disabled={working || isSwitching}
                  onChange={(event) => onSwitchCourse(event.target.value)}
                >
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
                </select>
                {isSwitching && <LoaderCircle className="spin course-switcher-spinner" size={13} />}
              </div>
            </label>
          )}
          <LanguageSwitch />
          {hasCourse && (
            <button className="welcome-back" type="button" onClick={onBack} disabled={isSwitching}>
              <ArrowLeft size={15} /> {t("welcome.back")}
            </button>
          )}
        </div>
      </header>

      <section className="welcome-main">
        <div className="welcome-content">
          <span className="welcome-tag">{t("welcome.tag")}</span>
          <h1>{t("welcome.title")}</h1>
          <p>{t("welcome.description")}</p>

          <form className="welcome-composer" onSubmit={submit}>
            <textarea
              ref={composer}
              rows={1}
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
            <button type="submit" disabled={!canStart}>
              {t("welcome.design")} <ArrowRight size={16} />
            </button>
          </form>

          <AgentControls
            models={models}
            value={agentConfig}
            disabled={working}
            className="welcome-agent-controls"
            onChange={onAgentConfigChange}
          />

          <div className="welcome-suggestions" aria-label={t("welcome.suggestionsLabel")}>
            <span>{t("welcome.try")}</span>
            {suggestions.map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => chooseSuggestion(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>

          {!connected && <div className="welcome-connection">{t("welcome.connecting")}</div>}
        </div>
      </section>

      <footer className="welcome-footer">{t("welcome.footer")}</footer>
    </main>
  );
}
