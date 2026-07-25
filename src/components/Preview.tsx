import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Crosshair, Sparkles } from "lucide-react";
import type { Selection } from "../../shared/protocol.ts";

export interface PreviewHandle {
  scrollTo: (id: string) => void;
}

interface Props {
  hasCourse: boolean;
  reloadToken: number;
  inspecting: boolean;
  onInspectOff: () => void;
  onSelect: (selection: Selection) => void;
}

interface SelectedPayload {
  type: "studio:selected";
  tag: string;
  text: string;
  snippet: string;
  locationHint: string;
  rect: { x: number; y: number; width: number; height: number };
}

export const Preview = forwardRef<PreviewHandle, Props>(function Preview(
  { hasCourse, reloadToken, inspecting, onInspectOff, onSelect },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  useImperativeHandle(ref, () => ({
    scrollTo: (id: string) =>
      iframeRef.current?.contentWindow?.postMessage({ type: "studio:scroll-to", id }, "*"),
  }));

  // Push inspect state into the preview whenever it changes (and once ready).
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "studio:set-inspect", on: inspecting },
      "*",
    );
  }, [inspecting, loaded]);

  // Messages from the injected preview bridge.
  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data as { type?: string };
      if (d.type === "studio:preview-ready") {
        setLoaded(true);
      } else if (d.type === "studio:inspect-off") {
        onInspectOff();
      } else if (d.type === "studio:selected") {
        onSelect(await buildSelection(iframeRef.current!, d as unknown as SelectedPayload));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onInspectOff, onSelect]);

  if (!hasCourse) {
    return (
      <main className="preview">
        <div className="preview-empty">
          <span className="preview-empty-badge">
            <Sparkles size={22} strokeWidth={2.25} />
          </span>
          <h2>Your course will take shape here</h2>
          <p>
            Tell the agent what you'd like to learn today. It'll ask a couple of quick
            questions, then build your first lesson — and it appears here, live, as it's
            written.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={`preview${inspecting ? " inspecting" : ""}`}>
      {!loaded && <div className="preview-loading">Loading the lesson…</div>}
      {inspecting && (
        <div className="inspect-hint">
          <Crosshair size={13} strokeWidth={2.75} />
          Click any part of the lesson · Esc to cancel
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Course preview"
        src={`/course/?r=${reloadToken}`}
        onLoad={() => {
          /* readiness comes from the bridge's postMessage */
        }}
      />
    </main>
  );
});

async function buildSelection(
  iframe: HTMLIFrameElement,
  payload: SelectedPayload,
): Promise<Selection> {
  let screenshot: string | null = null;
  try {
    const doc = iframe.contentDocument;
    const el = doc?.querySelector("[data-studio-selected]") as HTMLElement | null;
    if (el && doc) {
      const canvas = await html2canvas(el, {
        backgroundColor: null,
        scale: 1,
        logging: false,
        useCORS: true,
      });
      screenshot = canvas.toDataURL("image/png");
    }
  } catch {
    screenshot = null; // selection still works without the picture
  }
  return {
    tag: payload.tag,
    text: payload.text,
    snippet: payload.snippet,
    locationHint: payload.locationHint,
    screenshot,
  };
}
