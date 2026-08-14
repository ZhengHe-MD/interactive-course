import {
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Download,
  Inspect,
  LoaderCircle,
  Plus,
  RotateCcw,
  Shield,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import type { Checkpoint, CourseSummary, WidthMode } from "../types";
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
  widthMode?: WidthMode;
  onHome: () => void;
  onSwitchCourse: (courseId: string) => void;
  onToggleInspect: () => void;
  onToggleMultipleSelection: () => void;
  onWidthModeChange?: (mode: WidthMode) => void;
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
  widthMode,
  onHome,
  onSwitchCourse,
  onToggleInspect,
  onToggleMultipleSelection,
  onWidthModeChange,
  onRevert,
  onExport,
  onImportFile,
}: Props) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isSwitching = Boolean(switchingCourseId);
  const currentCheckpoint = checkpoints[0]?.label ?? (working ? t("toolbar.designing") : t("toolbar.created"));

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (menuOpen && !target?.closest('[data-course-menu="1"]') && !target?.closest(".course-switcher-btn")) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [menuOpen]);

  const recentCheckpoints = checkpoints.length > 0 ? checkpoints.slice(0, 6).reverse() : [{ id: "c1", label: currentCheckpoint }];

  return (
    <header className="studio-topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="topbar-brand-icon-btn"
          onClick={onHome}
          title={t("brand.home")}
          aria-label={t("brand.home")}
        >
          <Shield size={12} strokeWidth={2.75} />
        </button>

        {/* Accessible course select to preserve form/test semantics */}
        <select
          aria-label={t("toolbar.switchCourse")}
          className="sr-only"
          value={switchingCourseId ?? courseId}
          disabled={working || isSwitching}
          onChange={(event) => onSwitchCourse(event.target.value)}
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>

        <button
          type="button"
          className={`course-switcher-btn ${menuOpen ? "open" : ""}`}
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={t("toolbar.switchCourse")}
          disabled={working || isSwitching}
          title={isSwitching ? t("toolbar.switchingCourse") : t("toolbar.switchCourse")}
        >
          <span className="course-switcher-title">{courseTitle}</span>
          {isSwitching ? (
            <LoaderCircle className="spin course-switcher-spinner" size={13} />
          ) : (
            <span className={`course-switcher-caret ${menuOpen ? "open" : ""}`}>
              <ChevronDown size={13} strokeWidth={2.5} />
            </span>
          )}
        </button>

        {menuOpen && (
          <div data-course-menu="1" className="course-menu-dropdown">
            <span className="course-menu-heading">{t("toolbar.yourShelf")}</span>
            {courses.map((c) => {
              const isCurrent = c.id === courseId;
              return (
                <button
                  type="button"
                  key={c.id}
                  className={`course-menu-item ${isCurrent ? "active" : ""}`}
                  onClick={() => {
                    setMenuOpen(false);
                    if (!isCurrent) onSwitchCourse(c.id);
                  }}
                >
                  <span className="course-menu-dot" />
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
            <span className="course-menu-divider" />
            <button
              type="button"
              className="course-menu-new-btn"
              onClick={() => {
                setMenuOpen(false);
                onHome();
              }}
            >
              <Plus size={13} strokeWidth={2.75} />
              <span>{t("toolbar.designNew")}</span>
            </button>
          </div>
        )}
      </div>

      <div className="topbar-spacer" />

      {/* Mode Pills: Read / Inspect / Add to Selection */}
      <div className="mode-pills-container">
        <button
          type="button"
          className={`mode-pill-btn read ${!inspecting ? "active" : ""}`}
          onClick={() => {
            if (inspecting) onToggleInspect();
          }}
          disabled={!canInspect || isSwitching}
          title={t("toolbar.readTitle")}
        >
          <BookOpen size={13} strokeWidth={2.75} />
          <span>{t("toolbar.read")}</span>
        </button>
        <button
          type="button"
          className={`mode-pill-btn inspect ${inspecting ? "active" : ""}`}
          onClick={() => {
            if (!inspecting) onToggleInspect();
          }}
          aria-pressed={inspecting}
          disabled={!canInspect || isSwitching}
          title={canInspect ? t("toolbar.selectTitle") : t("toolbar.selectDisabled")}
        >
          <Inspect size={13} strokeWidth={2.75} />
          <span>{t("toolbar.select")}</span>
        </button>
        <button
          type="button"
          className={`mode-pill-btn multi ${multipleSelection ? "active" : ""}`}
          role="switch"
          aria-label={t("toolbar.multipleLabel")}
          aria-checked={multipleSelection}
          onClick={onToggleMultipleSelection}
          disabled={!canInspect || isSwitching}
          title={t("toolbar.multipleTitle")}
        >
          <Copy size={13} strokeWidth={2.75} />
          <span>{t("toolbar.addToSelection")}</span>
        </button>
      </div>

      {/* Width Mode Segmented Pills */}
      {widthMode && onWidthModeChange && (
        <div className="width-mode-pills" role="radiogroup" aria-label={t("preview.width")}>
          <button
            type="button"
            className={`width-mode-btn ${widthMode === "standard" ? "active" : ""}`}
            onClick={() => onWidthModeChange("standard")}
            title={t("preview.widthStandard")}
            aria-checked={widthMode === "standard"}
            role="radio"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeOpacity=".4" strokeWidth="2.5" />
              <rect x="9" y="7" width="6" height="10" rx="1.5" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className={`width-mode-btn ${widthMode === "wide" ? "active" : ""}`}
            onClick={() => onWidthModeChange("wide")}
            title={t("preview.widthWide")}
            aria-checked={widthMode === "wide"}
            role="radio"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeOpacity=".4" strokeWidth="2.5" />
              <rect x="5" y="7" width="14" height="10" rx="1.5" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className={`width-mode-btn ${widthMode === "full" ? "active" : ""}`}
            onClick={() => onWidthModeChange("full")}
            title={t("preview.widthFull")}
            aria-checked={widthMode === "full"}
            role="radio"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeOpacity=".4" strokeWidth="2.5" />
              <rect x="3" y="7" width="18" height="10" rx="1.5" fill="currentColor" />
            </svg>
          </button>
        </div>
      )}

      {/* Thread & Checkpoint Capsule */}
      <div className="thread-capsule" title={currentCheckpoint}>
        <span className="thread-label">{t("toolbar.thread")}</span>
        <div className="thread-dots-track">
          {recentCheckpoints.map((cp, idx) => {
            const isLatest = idx === recentCheckpoints.length - 1;
            return (
              <span
                key={cp.id ?? idx}
                className={`thread-dot ${isLatest ? "active" : "past"}`}
              />
            );
          })}
        </div>
        <span className="thread-name">{currentCheckpoint}</span>
        <button
          type="button"
          className="revert-action-btn"
          onClick={onRevert}
          disabled={working || isSwitching || checkpoints.length < 2}
          title={t("toolbar.revertTitle")}
        >
          <RotateCcw size={12} strokeWidth={2.75} />
          <span>{t("toolbar.revert")}</span>
        </button>
      </div>

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
        type="button"
        className="topbar-circle-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={working || exporting || importing || isSwitching}
        title={t("toolbar.importTitle")}
      >
        {importing ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} strokeWidth={2.4} />}
        <span className="sr-only">{t("toolbar.import")}</span>
      </button>

      <button
        type="button"
        className="topbar-circle-btn"
        onClick={onExport}
        disabled={working || exporting || !canInspect || isSwitching}
        title={t("toolbar.exportTitle")}
      >
        {exporting ? <LoaderCircle className="spin" size={15} /> : <Download size={15} strokeWidth={2.4} />}
        <span className="sr-only">{t("toolbar.export")}</span>
      </button>

      <LanguageSwitch />

      <span className={`changed-toast-inline ${courseChanged ? "visible" : ""}`}>
        <Check size={12} strokeWidth={2.75} /> {t("toolbar.changed")}
      </span>
    </header>
  );
}
