import { Check, ChevronRight, Inspect, RotateCcw, Shield } from "lucide-react";
import type { Checkpoint, CourseSummary } from "../types";

type Props = {
  courseTitle: string;
  courseId: string;
  courses: CourseSummary[];
  inspecting: boolean;
  canInspect: boolean;
  courseChanged: boolean;
  checkpoints: Checkpoint[];
  working: boolean;
  onHome: () => void;
  onSwitchCourse: (courseId: string) => void;
  onToggleInspect: () => void;
  onRevert: () => void;
};

export function Toolbar({
  courseTitle,
  courseId,
  courses,
  inspecting,
  canInspect,
  courseChanged,
  checkpoints,
  working,
  onHome,
  onSwitchCourse,
  onToggleInspect,
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

      <button
        className={`inspect-button ${inspecting ? "active" : ""}`}
        onClick={onToggleInspect}
        aria-pressed={inspecting}
        disabled={!canInspect}
        title={canInspect ? "Inspect a course element" : "Choose a topic before inspecting the course"}
      >
        <Inspect size={16} /> <span>{inspecting ? "Pick an element" : "Inspect"}</span>
      </button>
      <span className={`changed-indicator ${courseChanged ? "visible" : ""}`}>
        <Check size={13} /> changed
      </span>
    </header>
  );
}
