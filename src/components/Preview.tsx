import { Bot, Check } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { useI18n } from "../i18n";
import type { CodexStatus, CourseSection, Selection } from "../types";

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
  working: boolean;
  onSelection: (selection: Selection) => void;
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
  { courseId, courseVersion, pagePath = "syllabus.html", initialScrollTop = 0, inspecting, multipleSelection, courseChanged, codex, startingTopic, working, onSelection, onSelectionCleared, onReadingPosition, onInspectCancelled, onStartRequested },
  ref,
) {
  const { t } = useI18n();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const scrollTop = useRef(0);
  const frameReady = useRef(false);
  const inspectingRef = useRef(inspecting);
  inspectingRef.current = inspecting;

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
    post({ type: "inspect", active: inspecting });
  }, [inspecting, post]);

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
        // The page was replaced under us; put the reader back where they were.
        post({ type: "scroll.restore", top: scrollTop.current });
        post({ type: "inspect", active: inspectingRef.current });
      }
      if (event.data.type === "scroll") {
        scrollTop.current = Number(event.data.top) || 0;
        onReadingPosition(scrollTop.current, event.data.section as CourseSection | undefined);
      }
      if (event.data.type === "selection") onSelection(event.data.selection as Selection);
      if (event.data.type === "selection.cleared") onSelectionCleared?.();
      if (event.data.type === "inspect.cancelled") onInspectCancelled();
      if (event.data.type === "empty.start") onStartRequested();
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onInspectCancelled, onReadingPosition, onSelection, onSelectionCleared, onStartRequested, post]);

  return (
    <div className={`preview-stage ${inspecting ? "is-inspecting" : ""}`}>
      {startingTopic ? (
        <section className="course-starting-card" aria-live="polite">
          <span>{t("preview.newCourse")}</span>
          <h1>{startingTopic}</h1>
          <div className={working ? "course-starting-progress active" : "course-starting-progress"} />
          <strong>{working ? t("preview.designing") : t("preview.ready")}</strong>
          <p>{t("preview.separateCourse")}</p>
        </section>
      ) : (
        <iframe
          ref={frame}
          title={t("preview.title")}
          src={`/course/${encodeURIComponent(pagePath)}?v=${courseVersion}`}
        />
      )}
      {courseChanged && !startingTopic && (
        <div className="reload-toast">
          <Check size={15} /> {t("preview.updated")}
        </div>
      )}
      {inspecting && (
        <div className="inspect-hint">
          {multipleSelection ? t("preview.addContext") : t("preview.replaceContext")}
          <span>{t("preview.inspectHelp")}</span>
        </div>
      )}
      {codex.state === "error" && (
        <div className="codex-error-banner">
          <Bot size={17} />
          <span>{codex.message}</span>
        </div>
      )}
    </div>
  );
});
