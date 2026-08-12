import { Check, ChevronRight, Download, Inspect, Layers3, LoaderCircle, RotateCcw, Shield, Upload } from "lucide-react";
import { useRef } from "react";
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
  switchingCourseId?: string | null;
  exporting: boolean;
  importing?: boolean;
  onHome: () => void;
  onSwitchCourse: (courseId: string) => void;
  onToggleInspect: () => void;
  onToggleMultipleSelection: () => void;
  onRevert: () => void;
  onExport: () => void;
  onImportFile?: (file: File) => void;
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
  switchingCourseId = null,
  exporting,
  importing = false,
  onHome,
  onSwitchCourse,
  onToggleInspect,
  onToggleMultipleSelection,
  onRevert,
  onExport,
  onImportFile,
}: Props) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isSwitching = Boolean(switchingCourseId);
  const currentCheckpoint = checkpoints[0]?.label ?? (working ? t("toolbar.designing") : t("toolbar.created"));

  return (
    <header className="studio-topbar">
      <button className="studio-wordmark topbar-wordmark" type="button" onClick={onHome} aria-label={t("brand.home")} disabled={isSwitching}>
        <span className="brand-mark"><Shield size={15} /></span>
        <span>Course Studio</span>
      </button>

      <div className="course-breadcrumb">
        <ChevronRight size={15} />
        {courses.length > 1 ? (
          <div className="course-switcher-wrapper">
            <select
              aria-label={t("toolbar.switchCourse")}
              value={switchingCourseId ?? courseId}
              disabled={working || isSwitching}
              onChange={(event) => onSwitchCourse(event.target.value)}
              title={isSwitching ? t("toolbar.switchingCourse") : t("toolbar.switchCourse")}
            >
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
            {isSwitching && <LoaderCircle className="spin course-switcher-spinner" size={13} />}
          </div>
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
          disabled={working || isSwitching || checkpoints.length < 2}
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
          disabled={!canInspect || isSwitching}
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
          disabled={!canInspect || isSwitching}
          title={t("toolbar.multipleTitle")}
        >
          <Layers3 size={14} /> <span>{t("toolbar.multiple")}</span><i />
        </button>
      </div>
      <LanguageSwitch />
      <input
        type="file"
        ref={fileInputRef}
        accept=".zip,.course.zip"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onImportFile?.(file);
            event.target.value = "";
          }
        }}
      />
      <button
        className="import-button"
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={working || exporting || importing || isSwitching}
        title={t("toolbar.importTitle")}
      >
        {importing ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}
        <span>{importing ? t("toolbar.importing") : t("toolbar.import")}</span>
      </button>
      <button
        className="export-button"
        type="button"
        onClick={onExport}
        disabled={working || exporting || !canInspect || isSwitching}
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
