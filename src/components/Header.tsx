import { Shield, ChevronRight, RotateCcw, Crosshair } from "lucide-react";
import type { CourseState } from "../../shared/protocol.ts";

interface Props {
  course: CourseState | null;
  inspecting: boolean;
  canRevert: boolean;
  canInspect: boolean;
  onToggleInspect: () => void;
  onRevert: () => void;
}

export function Header({
  course,
  inspecting,
  canRevert,
  canInspect,
  onToggleInspect,
  onRevert,
}: Props) {
  const checkpoints = course?.checkpoints ?? [];
  const current = checkpoints[checkpoints.length - 1];

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-badge">
          <Shield size={15} strokeWidth={2.75} />
        </span>
        <span className="brand-name">Course Studio</span>
      </div>

      <div className="breadcrumb">
        <ChevronRight size={15} strokeWidth={2.75} style={{ flex: "0 0 auto" }} />
        <span className="crumb">{course?.title ?? "Loading…"}</span>
      </div>

      <div className="header-spacer" />

      <div className="history" title="Every agent turn is a checkpoint">
        <span className="history-label">History</span>
        <div className="history-dots">
          {checkpoints.map((cp, i) => (
            <span
              key={cp.sha}
              className={`history-dot${i === checkpoints.length - 1 ? " active" : ""}`}
              title={cp.label}
            />
          ))}
        </div>
        {current && <span className="history-current">{current.label}</span>}
        <button
          className="btn btn-ghost"
          disabled={!canRevert}
          onClick={onRevert}
          title="Revert last change"
        >
          <RotateCcw size={14} strokeWidth={2.75} />
          Revert
        </button>
      </div>

      <button
        className={`btn btn-outline${inspecting ? " on" : ""}`}
        onClick={onToggleInspect}
        disabled={!canInspect}
        title={canInspect ? "Point at part of the lesson (Esc to exit)" : "Nothing to inspect yet"}
      >
        <Crosshair size={16} strokeWidth={2.75} />
        Inspect
      </button>
    </header>
  );
}
