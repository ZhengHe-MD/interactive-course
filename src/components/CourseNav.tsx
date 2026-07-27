import { LockKeyhole, MessageCircle, Sparkles } from "lucide-react";
import type { CourseOutline, CourseSection } from "../types";

type Props = {
  course: CourseOutline;
  activeSection: string | null;
  onSelectSection: (section: CourseSection) => void;
  onChooseTopic: () => void;
};

export function CourseNav({ course, activeSection, onSelectSection, onChooseTopic }: Props) {
  const empty = !course.hasContent;
  // A course with content but no headings still deserves one place to jump to.
  const sections: CourseSection[] = course.sections.length
    ? course.sections
    : empty
      ? []
      : [{ index: 0, label: "Overview" }];
  const key = (section: CourseSection) => section.id ?? `index-${section.index}`;
  const current = activeSection ?? (sections[0] ? key(sections[0]) : null);

  return (
    <aside className="course-nav">
      <div className="studio-brand">
        <span>Course</span> Studio
      </div>
      <div className="course-identity">
        <span className="nav-kicker">{course.topic}</span>
        <h1>{course.title}</h1>
        <div className={`course-progress ${empty ? "empty" : ""}`}>
          <span />
          <small>
            {empty
              ? "Waiting for your topic"
              : `${sections.length} ${sections.length === 1 ? "section" : "sections"} ready`}
          </small>
        </div>
      </div>

      <nav aria-label="Course sections">
        {empty ? (
          <button className="active" onClick={onChooseTopic}>
            <span>01</span>Choose a topic
          </button>
        ) : (
          sections.map((section) => (
            <button
              key={key(section)}
              className={key(section) === current ? "active" : ""}
              onClick={() => onSelectSection(section)}
            >
              <span>{String(section.index + 1).padStart(2, "0")}</span>
              {section.label}
            </button>
          ))
        )}
      </nav>

      {course.upNext.length > 0 && (
        <div className="locked-lessons">
          <p>Up next</p>
          {course.upNext.map((lesson) => (
            <span key={lesson}>
              <LockKeyhole size={12} /> {lesson}
            </span>
          ))}
        </div>
      )}

      <div className="locked-lessons">
        <p>{empty ? "Shaped with you" : "Keep shaping it"}</p>
        {empty ? (
          <>
            <span>
              <LockKeyhole size={12} /> Your goal and background
            </span>
            <span>
              <LockKeyhole size={12} /> The right depth and pace
            </span>
          </>
        ) : (
          <>
            <span>
              <Sparkles size={12} /> Select anything to reshape it
            </span>
            <span>
              <MessageCircle size={12} /> Ask whenever you get stuck
            </span>
          </>
        )}
      </div>

      <div className="nav-foot">
        <Sparkles size={14} /> Built for one learner
      </div>
    </aside>
  );
}
