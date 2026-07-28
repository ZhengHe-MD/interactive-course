import { Check, ChevronRight, Download, Inspect, Layers3, LoaderCircle, RotateCcw, Shield } from "lucide-react";
import { useI18n } from "../i18n";
import type { Checkpoint, CourseSummary } from "../types";
import { LanguageSwitch } from "./LanguageSwitch";

type Props = {
  courseTitle: string;
  courseId: string;
  courses: CourseSummary[];
  inspecting: boolean;
  multipleSelection: boolean;
  canInspect: boolean;
  courseChanged: boolean;
  checkpoints: Checkpoint[];
  working: boolean;
  exporting: boolean;
  onHome: () => void;
  onSwitchCourse: (courseId: string) => void;
  onToggleInspect: () => void;
  onToggleMultipleSelection: () => void;
  onRevert: () => void;
  onExport: () => void;
};

export function Toolbar({
  courseTitle,
  courseId,
  courses,
  inspecting,
  multipleSelection,
  canInspect,
  courseChanged,
  checkpoints,
  working,
  exporting,
  onHome,
  onSwitchCourse,
  onToggleInspect,
  onToggleMultipleSelection,
  onRevert,
  onExport,
}: Props) {
  const { t } = useI18n();
  const currentCheckpoint = checkpoints[0]?.label ?? (working ? t("toolbar.designing") : t("toolbar.created"));

  return (
    <header className="studio-topbar">
      <button className="studio-wordmark topbar-wordmark" type="button" onClick={onHome} aria-label={t("brand.home")}>
        <span className="brand-mark"><Shield size={15} /></span>
        <span>Course Studio</span>
      </button>

      <div className="course-breadcrumb">
        <ChevronRight size={15} />
        {courses.length > 1 ? (
          <select
            aria-label={t("toolbar.switchCourse")}
            value={courseId}
            disabled={working}
            onChange={(event) => onSwitchCourse(event.target.value)}
            title={t("toolbar.switchCourse")}
          >
            {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
          </select>
        ) : <strong>{courseTitle}</strong>}
      </div>

      <div className="topbar-spacer" />

      <div className="history-pill" title={currentCheckpoint}>
        <span className="history-label">{t("toolbar.history")}</span>
        <div className="checkpoint-dots">
          {(checkpoints.length ? checkpoints.slice(0, 4).reverse() : [{ id: "initial" }]).map((checkpoint, index, items) => (
            <span key={checkpoint.id} className={index === items.length - 1 ? "current" : ""} />
          ))}
        </div>
        <span className="checkpoint-label">{currentCheckpoint}</span>
        <button
          className="revert-button"
          onClick={onRevert}
          disabled={working || checkpoints.length < 2}
          title={t("toolbar.revertTitle")}
        >
          <RotateCcw size={14} /> <span>{t("toolbar.revert")}</span>
        </button>
      </div>

      <div className="selection-controls">
        <button
          className={`inspect-button ${inspecting ? "active" : ""}`}
          onClick={onToggleInspect}
          aria-pressed={inspecting}
          disabled={!canInspect}
          title={canInspect ? t("toolbar.selectTitle") : t("toolbar.selectDisabled")}
        >
          <Inspect size={16} /> <span>{inspecting ? t("toolbar.selecting") : t("toolbar.select")}</span>
        </button>
        <button
          className={`multiple-selection-toggle ${multipleSelection ? "active" : ""}`}
          type="button"
          role="switch"
          aria-label={t("toolbar.multipleLabel")}
          aria-checked={multipleSelection}
          onClick={onToggleMultipleSelection}
          disabled={!canInspect}
          title={t("toolbar.multipleTitle")}
        >
          <Layers3 size={14} /> <span>{t("toolbar.multiple")}</span><i />
        </button>
      </div>
      <LanguageSwitch />
      <button
        className="export-button"
        type="button"
        onClick={onExport}
        disabled={working || exporting || !canInspect}
        title={t("toolbar.exportTitle")}
      >
        {exporting ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}
        <span>{exporting ? t("toolbar.exporting") : t("toolbar.export")}</span>
      </button>
      <span className={`changed-indicator ${courseChanged ? "visible" : ""}`}>
        <Check size={13} /> {t("toolbar.changed")}
      </span>
    </header>
  );
}
