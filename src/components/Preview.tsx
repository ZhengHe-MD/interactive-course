import { Bot, Check } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { CodexStatus, CourseSection, Selection } from "../types";

export type PreviewHandle = {
  /** Ask the course page to re-select the given chip's parent element. */
  expandSelection: (id: string) => void;
  removeSelection: (id: string) => void;
  clearSelections: () => void;
  scrollToSection: (section: CourseSection) => void;
};

type Props = {
  courseVersion: number;
  pagePath?: string;
  inspecting: boolean;
  multipleSelection: boolean;
  courseChanged: boolean;
  codex: CodexStatus;
  startingTopic?: string;
  working: boolean;
  onSelection: (selection: Selection) => void;
  onInspectCancelled: () => void;
  onStartRequested: () => void;
};

/**
 * The course itself, rendered in an iframe with the studio's preview bridge
 * injected by the server. Everything crossing that boundary goes through
 * `postMessage`, pinned to this origin in both directions.
 */
export const Preview = forwardRef<PreviewHandle, Props>(function Preview(
  { courseVersion, pagePath = "syllabus.html", inspecting, multipleSelection, courseChanged, codex, startingTopic, working, onSelection, onInspectCancelled, onStartRequested },
  ref,
) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const scrollTop = useRef(0);
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
    scrollTop.current = 0;
  }, [pagePath]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.source !== "course-studio-preview") return;
      if (event.data.type === "ready") {
        // The page was replaced under us; put the reader back where they were.
        post({ type: "scroll.restore", top: scrollTop.current });
        post({ type: "inspect", active: inspectingRef.current });
      }
      if (event.data.type === "scroll") scrollTop.current = Number(event.data.top) || 0;
      if (event.data.type === "selection") onSelection(event.data.selection as Selection);
      if (event.data.type === "inspect.cancelled") onInspectCancelled();
      if (event.data.type === "empty.start") onStartRequested();
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onInspectCancelled, onSelection, onStartRequested, post]);

  return (
    <div className={`preview-stage ${inspecting ? "is-inspecting" : ""}`}>
      {startingTopic ? (
        <section className="course-starting-card" aria-live="polite">
          <span>New course</span>
          <h1>{startingTopic}</h1>
          <div className={working ? "course-starting-progress active" : "course-starting-progress"} />
          <strong>{working ? "Designing your starting point…" : "Ready for your next direction"}</strong>
          <p>This is a separate course. Your previous course is saved and available from the course switcher.</p>
        </section>
      ) : (
        <iframe
          ref={frame}
          title="Interactive course preview"
          src={`/course/${encodeURIComponent(pagePath)}?v=${courseVersion}`}
        />
      )}
      {courseChanged && !startingTopic && (
        <div className="reload-toast">
          <Check size={15} /> Course updated
        </div>
      )}
      {inspecting && (
        <div className="inspect-hint">
          {multipleSelection ? "Click blocks to add context" : "Click a block to replace the current context"}
          <span>· highlight text anytime · Esc when done</span>
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
