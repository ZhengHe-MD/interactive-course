import { LockKeyhole, Sparkles } from "lucide-react";
import type { CourseOutline, CourseSection } from "../types";

type Props = {
  course: CourseOutline;
  activeSection: string | null;
  working: boolean;
  onSelectSection: (section: CourseSection) => void;
  onChooseTopic: () => void;
};

export function CourseNav({ course, activeSection, working, onSelectSection, onChooseTopic }: Props) {
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
      <div className="nav-kicker">Course outline</div>
      <div className="course-identity">
        <span className={`course-status-dot ${working ? "working" : ""}`} />
        <h1>{course.title}</h1>
      </div>

      <nav aria-label="Course sections">
        {empty ? (
          <button className="nav-generating active" onClick={onChooseTopic}>
            <Sparkles size={12} /> {working ? "Writing next section…" : "Shape this course"}
          </button>
        ) : (
          sections.map((section) => (
            <button
              key={key(section)}
              className={key(section) === current ? "active" : ""}
              onClick={() => onSelectSection(section)}
            >
              <span className="section-marker">{String(section.index + 1).padStart(2, "0")}</span>
              {section.label}
            </button>
          ))
        )}
      </nav>

      {(course.upNext.length > 0 || working) && (
        <div className="locked-lessons">
          <p>Up next</p>
          {(course.upNext.length ? course.upNext : ["Written when this section is ready"]).map((lesson) => (
            <span key={lesson}>
              <LockKeyhole size={12} /> {lesson}
            </span>
          ))}
          <small>Written for you when you reach it.</small>
        </div>
      )}
    </aside>
  );
}
