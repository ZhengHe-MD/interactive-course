import { Bot, Check, LoaderCircle } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { useI18n } from "../i18n";
import type { CodexStatus, CourseSection, Selection, WidthMode } from "../types";

export type PreviewHandle = {
  /** Ask the course page to re-select the given chip's parent element. */
  expandSelection: (id: string) => void;
  removeSelection: (id: string) => void;
  clearSelections: () => void;
  scrollToSection: (section: CourseSection) => void;
};

type Props = {
  courseId: string;
  courseVersion: number;
  pagePath?: string;
  initialScrollTop?: number;
  inspecting: boolean;
  multipleSelection: boolean;
  courseChanged: boolean;
  codex: CodexStatus;
  startingTopic?: string;
  switchingCourse?: { id: string; title: string } | null;
  working: boolean;
  widthMode?: WidthMode;
  onSelection: (selection: Selection) => void;
  onSelectionRemoved?: (id: string) => void;
  onSelectionCleared?: () => void;
  onReadingPosition: (top: number, section?: CourseSection) => void;
  onInspectCancelled: () => void;
  onStartRequested: () => void;
};

/**
 * The course itself, rendered in an iframe with the studio's preview bridge
 * injected by the server. Everything crossing that boundary goes through
 * `postMessage`, pinned to this origin in both directions.
 */
export const Preview = forwardRef<PreviewHandle, Props>(function Preview(
  {
    courseId,
    courseVersion,
    pagePath = "syllabus.html",
    initialScrollTop = 0,
    inspecting,
    multipleSelection,
    courseChanged,
    codex,
    startingTopic,
    switchingCourse = null,
    working,
    widthMode = "standard",
    onSelection,
    onSelectionRemoved,
    onSelectionCleared,
    onReadingPosition,
    onInspectCancelled,
    onStartRequested,
  },
  ref,
) {
  const { t } = useI18n();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const scrollTop = useRef(0);
  const frameReady = useRef(false);
  const inspectingRef = useRef(inspecting);
  inspectingRef.current = inspecting;
  const multipleSelectionRef = useRef(multipleSelection);
  multipleSelectionRef.current = multipleSelection;
  const widthModeRef = useRef(widthMode);
  widthModeRef.current = widthMode;

  const post = useCallback((message: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage({ source: "course-studio", ...message }, window.location.origin);
  }, []);

  useImperativeHandle(ref, () => ({
    expandSelection: (id: string) => post({ type: "selection.expand", id }),
    removeSelection: (id: string) => post({ type: "selection.remove", id }),
    clearSelections: () => post({ type: "selection.clear" }),
    scrollToSection: (section: CourseSection) => post({ type: "scroll.toSection", id: section.id, index: section.index }),
  }), [post]);

  useEffect(() => {
    post({ type: "inspect", active: inspecting, multiple: multipleSelection });
  }, [inspecting, multipleSelection, post]);

  useEffect(() => {
    if (frameReady.current) post({ type: "widthMode", mode: widthMode });
  }, [widthMode, post]);

  useEffect(() => {
    frameReady.current = false;
    scrollTop.current = initialScrollTop;
  }, [courseId, pagePath]);

  useEffect(() => {
    scrollTop.current = initialScrollTop;
    if (frameReady.current) post({ type: "scroll.restore", top: initialScrollTop });
  }, [initialScrollTop, post]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin
        || event.source !== frame.current?.contentWindow
        || event.data?.source !== "course-studio-preview"
      ) return;
      if (event.data.type === "ready") {
        frameReady.current = true;
        post({ type: "scroll.restore", top: scrollTop.current });
        post({ type: "inspect", active: inspectingRef.current, multiple: multipleSelectionRef.current });
        post({ type: "widthMode", mode: widthModeRef.current });
      }
      if (event.data.type === "scroll") {
        scrollTop.current = Number(event.data.top) || 0;
        onReadingPosition(scrollTop.current, event.data.section as CourseSection | undefined);
      }
      if (event.data.type === "selection") onSelection(event.data.selection as Selection);
      if (event.data.type === "selection.removed") onSelectionRemoved?.(event.data.id as string);
      if (event.data.type === "selection.cleared") onSelectionCleared?.();
      if (event.data.type === "inspect.cancelled") onInspectCancelled();
      if (event.data.type === "empty.start") onStartRequested();
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onInspectCancelled, onReadingPosition, onSelection, onSelectionRemoved, onSelectionCleared, onStartRequested, post]);

  return (
    <div className={`preview-stage-container preview-stage width-${widthMode} ${inspecting ? "is-inspecting" : ""}`}>


      {switchingCourse ? (
        <section className={`authoring-progress-sheet course-starting-card course-switching-card width-${widthMode}`} aria-live="polite">
          <div className="authoring-badge">
            <LoaderCircle className="spin" size={13} />
            <span>{t("preview.switchingTag")}</span>
          </div>
          <h1 style={{ margin: "4px 0", fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: "28px" }}>
            {switchingCourse.title}
          </h1>
          <div className="course-starting-progress active" style={{ height: "4px", borderRadius: "999px", background: "var(--color-accent-300)" }} />
          <strong>{t("preview.switchingTitle")}</strong>
          <p style={{ margin: 0, fontSize: "13.5px", color: "var(--color-neutral-700)" }}>{t("preview.switchingDescription")}</p>
        </section>
      ) : startingTopic ? (
        <section className={`authoring-progress-sheet course-starting-card width-${widthMode}`} aria-live="polite">
          <div className="authoring-badge">
            {working && <LoaderCircle className="spin" size={13} />}
            <span>{t("preview.newCourse")}</span>
          </div>
          <h1 style={{ margin: "4px 0", fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: "28px" }}>
            {startingTopic}
          </h1>
          <div className={working ? "course-starting-progress active" : "course-starting-progress"} style={{ height: "4px", borderRadius: "999px", background: "var(--color-accent-300)" }} />
          <strong>{working ? t("preview.designing") : t("preview.ready")}</strong>
          <p style={{ margin: 0, fontSize: "13.5px", color: "var(--color-neutral-700)" }}>{t("preview.separateCourse")}</p>
          {working && (
            <div className="shimmer-placeholder-block">
              <div className="shimmer-line" style={{ height: "14px", width: "100%" }} />
              <div className="shimmer-line" style={{ height: "14px", width: "92%" }} />
              <div className="shimmer-line" style={{ height: "14px", width: "75%" }} />
            </div>
          )}
        </section>
      ) : (
        <div className={`preview-sheet-frame width-${widthMode}`}>
          <iframe
            ref={frame}
            title={t("preview.title")}
            src={`/course/${encodeURIComponent(pagePath)}?v=${courseVersion}`}
          />
        </div>
      )}

      {courseChanged && !startingTopic && !switchingCourse && (
        <div className="floating-toast-alert reload-toast">
          <Check size={14} strokeWidth={2.75} /> <span>{t("preview.updated")}</span>
        </div>
      )}

      {inspecting && (
        <div className="inspect-hint" style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 100, background: "var(--color-text)", color: "var(--color-bg)", padding: "6px 14px", borderRadius: "var(--radius-pill)", fontSize: "11.5px", fontWeight: 600, display: "flex", gap: "6px", boxShadow: "var(--shadow-md)" }}>
          {multipleSelection ? t("preview.addContext") : t("preview.replaceContext")}
          <span style={{ color: "var(--color-neutral-400)" }}>{t("preview.inspectHelp")}</span>
        </div>
      )}

      {codex.state === "error" && (
        <div className="codex-error-banner" style={{ position: "fixed", bottom: "20px", left: "24px", zIndex: 150, background: "#2a1215", color: "#ff8a80", border: "1px solid #5c2b2e", padding: "10px 14px", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
          <Bot size={17} />
          <span>{codex.message}</span>
        </div>
      )}
    </div>
  );
});
