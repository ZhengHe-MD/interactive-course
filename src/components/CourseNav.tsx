import { BookOpen, CircleHelp, FileText, LockKeyhole, Sparkles } from "lucide-react";
import type { CourseOutline, CoursePage, CourseSection } from "../types";

type Props = {
  course: CourseOutline;
  activePage: string;
  activeSection: string | null;
  working: boolean;
  onSelectPage: (page: CoursePage) => void;
  onSelectSection: (section: CourseSection) => void;
  onChooseTopic: () => void;
};

export function CourseNav({ course, activePage, activeSection, working, onSelectPage, onSelectSection, onChooseTopic }: Props) {
  const empty = !course.hasContent;
  const page = course.pages.find((entry) => entry.path === activePage) ?? course.pages[0];
  const sections: CourseSection[] = page?.sections.length
    ? page.sections
    : page
      ? [{ index: 0, label: "Overview" }]
      : [];
  const key = (section: CourseSection) => section.id ?? `index-${section.index}`;
  const current = activeSection ?? (sections[0] ? key(sections[0]) : null);

  return (
    <aside className="course-nav">
      <div className="nav-kicker">Course materials</div>
      <div className="course-identity">
        <span className={`course-status-dot ${working ? "working" : ""}`} />
        <h1>{course.title}</h1>
      </div>

      <nav aria-label="Course materials">
        {empty ? (
          <button className="nav-generating active" onClick={onChooseTopic}>
            <Sparkles size={12} /> {working ? "Writing next section…" : "Shape this course"}
          </button>
        ) : (
          course.pages.flatMap((coursePage, pageIndex) => {
            const selected = coursePage.path === page?.path;
            const pageSections = selected ? sections : [];
            return [
              <button
                key={coursePage.path}
                className={`course-page-link ${selected ? "active" : ""}`}
                onClick={() => onSelectPage(coursePage)}
              >
                {coursePage.kind === "syllabus" ? <FileText size={14} /> : <BookOpen size={14} />}
                <span>
                  <small>{coursePage.kind === "syllabus" ? "Plan" : `Session ${pageIndex}`}</small>
                  {coursePage.title}
                </span>
              </button>,
              ...pageSections.map((section) => (
                <button
                  key={`${coursePage.path}:${key(section)}`}
                  className={`course-section-link ${key(section) === current ? "active" : ""}`}
                  onClick={() => onSelectSection(section)}
                >
                  <span className="section-marker">{String(section.index + 1).padStart(2, "0")}</span>
                  {section.label}
                </button>
              )),
            ];
          })
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

      {course.phase === "learning" && (
        <details className="course-phase-details">
          <summary><CircleHelp size={12} /> Course status</summary>
          <div>
            <strong>Learning session by session</strong>
            <p>The syllabus remains available, and new sessions appear separately as you reach them.</p>
          </div>
        </details>
      )}
    </aside>
  );
}
