import { BookOpen, ChevronLeft, ChevronRight, CircleHelp, FileText, LockKeyhole, Sparkles } from "lucide-react";
import { useI18n } from "../i18n";
import type { CourseOutline, CoursePage, CourseSection } from "../types";

type Props = {
  course: CourseOutline;
  activePage: string;
  activeSection: string | null;
  working: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onSelectPage: (page: CoursePage) => void;
  onSelectSection: (section: CourseSection) => void;
  onChooseTopic: () => void;
};

export function CourseNav({
  course,
  activePage,
  activeSection,
  working,
  collapsed = false,
  onToggleCollapsed = () => undefined,
  onSelectPage,
  onSelectSection,
  onChooseTopic,
}: Props) {
  const { t } = useI18n();
  const empty = !course.hasContent;
  const page = course.pages.find((entry) => entry.path === activePage) ?? course.pages[0];
  const sections: CourseSection[] = page?.sections.length
    ? page.sections
    : page
      ? [{ index: 0, label: t("nav.overview") }]
      : [];
  const key = (section: CourseSection) => section.id ?? `index-${section.index}`;
  const current = activeSection ?? (sections[0] ? key(sections[0]) : null);

  if (collapsed) {
    return (
      <aside className="course-nav collapsed" aria-label={t("nav.label")}>
        <button
          className="collapsed-course-nav-button"
          onClick={onToggleCollapsed}
          aria-label={t("nav.open")}
          title={t("nav.open")}
        >
          <span className="course-nav-toggle-icon"><ChevronRight size={15} /></span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="course-nav">
      <div className="course-nav-header">
        <div className="nav-kicker">{t("nav.materials")}</div>
        <button
          className="course-nav-collapse-button"
          onClick={onToggleCollapsed}
          aria-label={t("nav.collapse")}
          title={t("nav.collapse")}
        >
          <ChevronLeft size={16} />
        </button>
      </div>
      <div className="course-identity">
        <span className={`course-status-dot ${working ? "working" : ""}`} />
        <h1>{course.title}</h1>
      </div>

      <nav aria-label={t("nav.materials")}>
        {empty ? (
          <button className="nav-generating active" onClick={onChooseTopic}>
            <Sparkles size={12} /> {working ? t("nav.writing") : t("nav.shape")}
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
                  <small>{coursePage.kind === "syllabus" ? t("nav.plan") : `${t("nav.session")} ${pageIndex}`}</small>
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
          <p>{t("nav.upNext")}</p>
          {(course.upNext.length ? course.upNext : [t("nav.writtenWhenReady")]).map((lesson) => (
            <span key={lesson}>
              <LockKeyhole size={12} /> {lesson}
            </span>
          ))}
          <small>{t("nav.writtenForYou")}</small>
        </div>
      )}

      {course.phase === "learning" && (
        <details className="course-phase-details">
          <summary><CircleHelp size={12} /> {t("nav.status")}</summary>
          <div>
            <strong>{t("nav.learning")}</strong>
            <p>{t("nav.learningDescription")}</p>
          </div>
        </details>
      )}
    </aside>
  );
}
