import { Lock } from "lucide-react";
import type { CourseState } from "../../shared/protocol.ts";

interface Props {
  course: CourseState | null;
  activeSection: string | null;
  onSelectSection: (id: string) => void;
}

export function Sidebar({ course, activeSection, onSelectSection }: Props) {
  const empty = !course?.hasContent;
  return (
    <aside className="sidebar">
      <div>
        <div className="eyebrow">Course</div>
        <div className="course-row">
          <span className={`dot${empty ? " dim" : ""}`} />
          <span className="title">{course?.title ?? "…"}</span>
        </div>
        {empty ? (
          <div className="upnext-note">
            No lessons yet — tell the agent what you'd like to learn.
          </div>
        ) : (
          <div className="section-list">
            {(course?.sections ?? []).map((s, i) => {
              const active = activeSection ? activeSection === s.id : i === 0;
              return (
                <button
                  key={s.id}
                  className={`section-item${active ? " active" : ""}`}
                  onClick={() => onSelectSection(s.id)}
                >
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {course && course.upNext.length > 0 && (
        <div>
          <div className="eyebrow">Up next</div>
          {course.upNext.map((label) => (
            <div className="upnext-item" key={label}>
              <Lock size={13} strokeWidth={2.5} style={{ flex: "0 0 auto" }} />
              <span>{label}</span>
            </div>
          ))}
          <div className="upnext-note">Written for you when you reach it.</div>
        </div>
      )}
    </aside>
  );
}
