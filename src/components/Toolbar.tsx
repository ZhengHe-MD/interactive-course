import { Check, ChevronRight, Inspect, Layers3, RotateCcw, Shield } from "lucide-react";
import type { Checkpoint, CourseSummary } from "../types";

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
  onHome: () => void;
  onSwitchCourse: (courseId: string) => void;
  onToggleInspect: () => void;
  onToggleMultipleSelection: () => void;
  onRevert: () => void;
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
  onHome,
  onSwitchCourse,
  onToggleInspect,
  onToggleMultipleSelection,
  onRevert,
}: Props) {
  const currentCheckpoint = checkpoints[0]?.label ?? (working ? "Designing course" : "Course created");

  return (
    <header className="studio-topbar">
      <button className="studio-wordmark topbar-wordmark" type="button" onClick={onHome} aria-label="Course Studio home">
        <span className="brand-mark"><Shield size={15} /></span>
        <span>Course Studio</span>
      </button>

      <div className="course-breadcrumb">
        <ChevronRight size={15} />
        {courses.length > 1 ? (
          <select
            aria-label="Switch course"
            value={courseId}
            disabled={working}
            onChange={(event) => onSwitchCourse(event.target.value)}
            title="Switch course"
          >
            {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
          </select>
        ) : <strong>{courseTitle}</strong>}
      </div>

      <div className="topbar-spacer" />

      <div className="history-pill" title={currentCheckpoint}>
        <span className="history-label">History</span>
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
          title="Revert the last course checkpoint"
        >
          <RotateCcw size={14} /> <span>Revert</span>
        </button>
      </div>

      <div className="selection-controls">
        <button
          className={`inspect-button ${inspecting ? "active" : ""}`}
          onClick={onToggleInspect}
          aria-pressed={inspecting}
          disabled={!canInspect}
          title={canInspect ? "Select text or a course block as context" : "Choose a topic before selecting course context"}
        >
          <Inspect size={16} /> <span>{inspecting ? "Selecting" : "Select"}</span>
        </button>
        <button
          className={`multiple-selection-toggle ${multipleSelection ? "active" : ""}`}
          type="button"
          role="switch"
          aria-label="Multiple selection"
          aria-checked={multipleSelection}
          onClick={onToggleMultipleSelection}
          disabled={!canInspect}
          title="Keep several selected parts in the same prompt"
        >
          <Layers3 size={14} /> <span>Multiple</span><i />
        </button>
      </div>
      <span className={`changed-indicator ${courseChanged ? "visible" : ""}`}>
        <Check size={13} /> changed
      </span>
    </header>
  );
}
