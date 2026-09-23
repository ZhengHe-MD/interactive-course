import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useI18n, type TranslationKey } from "../i18n";
import type { CourseBrief, CoursePhase, TeachingPreset } from "../../shared/protocol";

const PRESETS: Array<{ id: TeachingPreset; name: TranslationKey; description: TranslationKey }> = [
  { id: "guided-inquiry", name: "brief.presetInquiry", description: "brief.presetInquiryDescription" },
  { id: "worked-examples", name: "brief.presetExamples", description: "brief.presetExamplesDescription" },
  { id: "retrieval-practice", name: "brief.presetRetrieval", description: "brief.presetRetrievalDescription" },
];

type Props = {
  brief?: CourseBrief;
  phase: CoursePhase;
  working: boolean;
  connected: boolean;
  onReview: () => void;
  onExplore: () => void;
  onPreset: (preset: TeachingPreset) => void;
  onApprove: (revision: string) => void;
};

export function CourseBriefPanel({ brief, phase, working, connected, onReview, onExplore, onPreset, onApprove }: Props) {
  const { t } = useI18n();
  const canAct = connected && !working;
  const reviewing = phase === "brief-review";
  return (
    <section className="course-brief-panel" aria-label={t("brief.title")}>
      <div className="course-brief-card">
        <div className="course-brief-kicker">{t("brief.kicker")}</div>
        <h1>{t("brief.title")}</h1>
        <p className="course-brief-intro">{t("brief.intro")}</p>
        {brief ? (
          <div className="course-brief-content markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {brief.markdown
                .replace(/<!--\s*course-studio-(?:recommended|selected)-preset:[\s\S]*?-->/gi, "")
                .replace(/^\s*# [^\n]+\n/, "")}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="course-brief-empty">{t("brief.empty")}</p>
        )}

        {brief?.recommendedPreset && (
          <fieldset className="course-brief-presets" disabled={!reviewing || !canAct}>
            <legend>{t("brief.teachingPreset")}</legend>
            {PRESETS.map((preset) => (
              <label className="course-brief-preset" key={preset.id}>
                <input
                  type="radio"
                  name="teaching-preset"
                  value={preset.id}
                  checked={brief.selectedPreset === preset.id}
                  onChange={() => onPreset(preset.id)}
                />
                <span>
                  <strong>{t(preset.name)}{brief.recommendedPreset === preset.id ? ` · ${t("brief.recommended")}` : ""}</strong>
                  <small>{t(preset.description)}</small>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {brief && phase === "discovery" && (
          <div className="course-brief-actions">
            {brief.answerCount >= 3 && <span className="course-brief-checkpoint">{t("brief.checkpoint")}</span>}
            {!brief.recommendedPreset && <span className="course-brief-checkpoint">{t("brief.awaitingRecommendation")}</span>}
            <button type="button" disabled={!canAct || !brief.recommendedPreset} onClick={onReview}>{t("brief.review")}</button>
          </div>
        )}
        {brief && reviewing && (
          <div className="course-brief-actions">
            <button type="button" className="secondary" disabled={!canAct} onClick={onExplore}>{t("brief.keepExploring")}</button>
            <button type="button" disabled={!canAct || !brief.recommendedPreset || !brief.selectedPreset} onClick={() => onApprove(brief.revision)}>{t("brief.approve")}</button>
          </div>
        )}
        {phase === "brief-approved" && (
          <div className="course-brief-actions">
            <span className="course-brief-checkpoint">{working ? t("brief.creatingSyllabus") : t("brief.syllabusPending")}</span>
            {!working && brief && <button type="button" disabled={!connected} onClick={() => onApprove(brief.revision)}>{t("brief.retrySyllabus")}</button>}
          </div>
        )}
      </div>
    </section>
  );
}
