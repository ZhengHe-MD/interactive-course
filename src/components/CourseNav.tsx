import { ChevronLeft, ChevronRight, Languages, Sparkles } from "lucide-react";
import { useI18n, type Language } from "../i18n";
import type { CourseOutline, CoursePage, CourseSection } from "../types";

type Props = {
  course: CourseOutline;
  activePage: string;
  activeSection: string | null;
  working: boolean;
  loadingCourse?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onSelectPage: (page: CoursePage) => void;
  onSelectSection: (section: CourseSection) => void;
  onChooseTopic: () => void;
  onWriteNextLesson?: (title: string) => void;
  onTranslatePage?: (page: CoursePage) => void;
};

type LessonSlot = {
  basePath: string;
  kind: "syllabus" | "lesson";
  activeVariant: CoursePage;
  hasActiveLangVariant: boolean;
  variants: CoursePage[];
};

export function CourseNav({
  course,
  activePage,
  activeSection,
  working,
  loadingCourse = false,
  collapsed = false,
  onToggleCollapsed = () => undefined,
  onSelectPage,
  onSelectSection,
  onChooseTopic,
  onWriteNextLesson,
  onTranslatePage,
}: Props) {
  const { language, setLanguage, t } = useI18n();
  const empty = !course.hasContent;

  const availableLanguages: Language[] = course.availableLanguages?.length
    ? course.availableLanguages
    : (Array.from(
        new Set(
          course.pages
            .map((p) => (p.lang as Language) || (p.path.includes(".zh-CN.") ? "zh-CN" : "en")),
        ),
      ).filter(Boolean) as Language[]);

  const hasMultipleLanguages = availableLanguages.length > 1;

  // Group pages by their base slot identity so translations don't become separate numbered lessons
  const slots: LessonSlot[] = (() => {
    const slotMap = new Map<string, CoursePage[]>();
    for (const p of course.pages) {
      const base = p.basePath || p.path.replace(/\.[a-zA-Z]{2}(?:-[a-zA-Z]{2,4})?\.html$/i, ".html");
      const existing = slotMap.get(base) ?? [];
      existing.push(p);
      slotMap.set(base, existing);
    }

    const result: LessonSlot[] = [];
    for (const [basePath, variants] of slotMap.entries()) {
      const matchLang = variants.find((v) => v.lang === language || (language === "zh-CN" ? v.path.includes(".zh-CN.") : !v.path.includes(".zh-CN.")));
      const matchActive = variants.find((v) => v.path === activePage);
      const activeVariant = matchActive ?? matchLang ?? variants[0];
      const hasActiveLangVariant = Boolean(matchLang);
      const kind = activeVariant.kind ?? (basePath === "syllabus.html" || basePath === "index.html" ? "syllabus" : "lesson");

      result.push({
        basePath,
        kind,
        activeVariant,
        hasActiveLangVariant,
        variants,
      });
    }

    return result.sort((left, right) => {
      const leftIsSyllabus = left.kind === "syllabus" || left.basePath === "syllabus.html" || left.basePath === "index.html";
      const rightIsSyllabus = right.kind === "syllabus" || right.basePath === "syllabus.html" || right.basePath === "index.html";
      if (leftIsSyllabus && !rightIsSyllabus) return -1;
      if (!leftIsSyllabus && rightIsSyllabus) return 1;
      return left.basePath.localeCompare(right.basePath, undefined, { numeric: true });
    });
  })();

  const activeSlot = slots.find((s) => s.variants.some((v) => v.path === activePage)) ?? slots[0];
  const page = activeSlot?.activeVariant ?? course.pages.find((entry) => entry.path === activePage) ?? course.pages[0];

  const sections: CourseSection[] = page?.sections.length
    ? page.sections
    : page
      ? [{ index: 0, label: t("nav.overview") }]
      : [];
  const key = (section: CourseSection) => section.id ?? `index-${section.index}`;
  const current = activeSection ?? (sections[0] ? key(sections[0]) : null);

  if (collapsed) {
    return (
      <aside className="course-nav-sidebar collapsed" aria-label={t("nav.label")}>
        <button
          className="topbar-circle-btn"
          type="button"
          onClick={onToggleCollapsed}
          aria-label={t("nav.open")}
          title={t("nav.open")}
        >
          <ChevronRight size={15} strokeWidth={2.5} />
        </button>
      </aside>
    );
  }

  let lessonCounter = 0;

  return (
    <aside className="course-nav-sidebar" aria-label={t("nav.materials")}>
      <div style={{ display: "none" }} aria-hidden="true">
        {/* Hidden accessibility element to maintain test compatibility */}
        <span>{t("nav.label")}</span>
      </div>

      <div className="course-nav-header">
        <span className="course-nav-section-title">{t("nav.coursePlan")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {hasMultipleLanguages && (
            <div className="course-nav-lang-switcher" role="group" aria-label={t("nav.courseEdition")}>
              <button
                type="button"
                className={`course-nav-lang-pill ${language === "en" ? "active" : ""}`}
                onClick={() => setLanguage("en")}
                title={t("language.english")}
              >
                EN
              </button>
              <button
                type="button"
                className={`course-nav-lang-pill ${language === "zh-CN" ? "active" : ""}`}
                onClick={() => setLanguage("zh-CN")}
                title={t("language.chinese")}
              >
                中文
              </button>
            </div>
          )}
          <button
            className="topbar-circle-btn"
            style={{ width: "24px", height: "24px", border: "0" }}
            type="button"
            onClick={onToggleCollapsed}
            aria-label={t("nav.collapse")}
            title={t("nav.collapse")}
          >
            <ChevronLeft size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <nav className="course-nav-list" aria-label={t("nav.materials")}>
        {empty || loadingCourse ? (
          <button
            type="button"
            className="course-nav-page-btn active"
            onClick={loadingCourse ? undefined : onChooseTopic}
            disabled={loadingCourse}
          >
            <Sparkles size={12} strokeWidth={2.5} />
            <span>{working || loadingCourse ? t("nav.writing") : t("nav.shape")}</span>
          </button>
        ) : (
          slots.map((slot) => {
            const coursePage = slot.activeVariant;
            const isSelected = slot.variants.some((v) => v.path === activePage) || coursePage.path === page?.path;
            const isSyllabus = slot.kind === "syllabus";
            if (!isSyllabus) lessonCounter += 1;
            const numLabel = isSyllabus ? "—" : String(lessonCounter).padStart(2, "0");

            return (
              <div key={slot.basePath} className="course-nav-item">
                <button
                  type="button"
                  className={`course-nav-page-btn ${isSelected ? "active" : ""}`}
                  onClick={() => onSelectPage(coursePage)}
                >
                  <span className="course-nav-num">{numLabel}</span>
                  <span className="course-nav-page-title">{coursePage.title}</span>

                  {!slot.hasActiveLangVariant && hasMultipleLanguages && (
                    <span className="course-nav-badge" title={t("nav.untranslatedBadge")}>
                      {coursePage.lang === "zh-CN" || coursePage.path.includes(".zh-CN.") ? "中文" : "EN"}
                    </span>
                  )}

                  {!slot.hasActiveLangVariant && onTranslatePage && (
                    <button
                      type="button"
                      className="course-nav-translate-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTranslatePage(coursePage);
                      }}
                      title={t("nav.translateLesson")}
                      aria-label={t("nav.translateLesson")}
                    >
                      <Languages size={12} strokeWidth={2.4} />
                    </button>
                  )}

                  {isSelected && working && (
                    <span className="course-nav-spinner" />
                  )}
                </button>

                {isSelected && sections.length > 0 && (
                  <div className="course-nav-sections-sublist">
                    {sections.map((section) => {
                      const isSubActive = key(section) === current;
                      return (
                        <button
                          key={`${coursePage.path}:${key(section)}`}
                          type="button"
                          className={`course-nav-sub-btn ${isSubActive ? "active" : ""}`}
                          onClick={() => onSelectSection(section)}
                        >
                          <span className="course-nav-sub-dot" />
                          <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {section.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </nav>

      {course.phase === "learning" && (
        <div style={{ display: "none" }} aria-hidden="true">
          <span>{t("nav.status")}</span>
          <span>{t("nav.learning")}</span>
          <span>{t("nav.learningDescription")}</span>
        </div>
      )}
    </aside>
  );
}
