import { Check, Inspect, RotateCcw } from "lucide-react";
import type { Checkpoint } from "../types";

type Props = {
  inspecting: boolean;
  canInspect: boolean;
  courseChanged: boolean;
  checkpoints: Checkpoint[];
  working: boolean;
  onToggleInspect: () => void;
  onRevert: () => void;
};

export function Toolbar({
  inspecting,
  canInspect,
  courseChanged,
  checkpoints,
  working,
  onToggleInspect,
  onRevert,
}: Props) {
  return (
    <header className="workspace-toolbar">
      <button
        className={`inspect-button ${inspecting ? "active" : ""}`}
        onClick={onToggleInspect}
        aria-pressed={inspecting}
        disabled={!canInspect}
        title={canInspect ? "Inspect a course element" : "Choose a topic before inspecting the course"}
      >
        <Inspect size={16} /> {inspecting ? "Pick an element" : "Inspect"}
      </button>
      {canInspect && (
        <span className="shortcut">
          or hold <kbd>⌥</kbd>
        </span>
      )}
      <span className={`changed-indicator ${courseChanged ? "visible" : ""}`}>
        <Check size={13} /> changed
      </span>
      <div className="checkpoint-summary" title={checkpoints[0]?.label ?? "No checkpoint yet"}>
        <div className="checkpoint-dots">
          {checkpoints
            .slice(0, 5)
            .reverse()
            .map((checkpoint, index, items) => (
              <span key={checkpoint.id} className={index === items.length - 1 ? "current" : ""} />
            ))}
        </div>
        <span>{checkpoints[0]?.label ?? "Initial course"}</span>
      </div>
      <button
        className="revert-button"
        onClick={onRevert}
        disabled={working || checkpoints.length < 2}
        title="Revert the last course checkpoint"
      >
        <RotateCcw size={15} /> Revert
      </button>
    </header>
  );
}
