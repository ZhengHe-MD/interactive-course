import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Preview } from "../src/components/Preview";
import { CourseNav } from "../src/components/CourseNav";
import { Toolbar } from "../src/components/Toolbar";
import { Welcome } from "../src/components/Welcome";

const courses = [
  { id: "ev-batteries", title: "EV Battery Fundamentals", phase: "syllabus" as const, hasContent: true },
  { id: "current", title: "From Silicon to a Simple CPU", phase: "learning" as const, hasContent: true },
];

describe("course switching UI", () => {
  it("offers saved courses in the studio toolbar", () => {
    const html = renderToStaticMarkup(
      <Toolbar
        courseTitle="EV Battery Fundamentals"
        courseId="ev-batteries"
        courses={courses}
        inspecting={false}
        multipleSelection={false}
        canInspect
        courseChanged={false}
        checkpoints={[]}
        working={false}
        exporting={false}
        onHome={() => {}}
        onSwitchCourse={() => {}}
        onToggleInspect={() => {}}
        onToggleMultipleSelection={() => {}}
        onRevert={() => {}}
        onExport={() => {}}
      />,
    );

    expect(html).toContain('aria-label="Switch course"');
    expect(html).toContain("EV Battery Fundamentals");
    expect(html).toContain("From Silicon to a Simple CPU");
    expect(html).toContain("Select");
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="Multiple selection"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('title="Prepare and download a standalone course"');
  });

  it("renders shelf cards from the new-course screen", () => {
    const html = renderToStaticMarkup(
      <Welcome
        connected
        working={false}
        courses={courses}
        onSwitchCourse={() => {}}
        onStart={() => {}}
      />,
    );

    expect(html).toContain("From Silicon to a Simple CPU");
    expect(html).toContain("EV Battery Fundamentals");
    expect(html).toContain("welcome-shelf-card");
  });

  it("hides the previous preview while a separate course is being created", () => {
    const html = renderToStaticMarkup(
      <Preview
        courseId="ev-batteries"
        courseVersion={1}
        inspecting={false}
        multipleSelection={false}
        courseChanged={false}
        codex={{ state: "ready" }}
        startingTopic="Batteries for Electric Vehicles"
        working
        onSelection={() => {}}
        onReadingPosition={() => {}}
        onInspectCancelled={() => {}}
        onStartRequested={() => {}}
      />,
    );

    expect(html).toContain("Batteries for Electric Vehicles");
    expect(html).toContain("Your previous course is saved");
    expect(html).not.toContain("<iframe");
  });

  it("lists the permanent syllabus and each generated session", () => {
    const html = renderToStaticMarkup(
      <CourseNav
        course={{
          phase: "learning",
          hasContent: true,
          title: "Confucius",
          topic: "Philosophy",
          pages: [
            { path: "syllabus.html", title: "Syllabus", kind: "syllabus", sections: [] },
            { path: "session1.html", title: "Practice", kind: "lesson", sections: [] },
            { path: "session2.html", title: "Relationships", kind: "lesson", sections: [] },
          ],
          sections: [],
          upNext: ["Session 3 · Moral authority"],
        }}
        activePage="session1.html"
        activeSection={null}
        working={false}
        onSelectPage={() => {}}
        onSelectSection={() => {}}
        onChooseTopic={() => {}}
      />,
    );

    expect(html).toContain('aria-label="Course materials"');
    expect(html).toContain("Syllabus");
    expect(html).toContain("Practice");
    expect(html).toContain("Relationships");
    expect(html).toContain("Course status");
    expect(html).toContain("Learning session by session");
    expect(html).toContain('aria-label="Collapse course navigation"');
  });

  it("turns the course outline into a compact rail when collapsed", () => {
    const html = renderToStaticMarkup(
      <CourseNav
        course={{
          phase: "learning",
          hasContent: true,
          title: "Confucius",
          topic: "Philosophy",
          pages: [
            { path: "session1.html", title: "Practice", kind: "lesson", sections: [] },
          ],
          sections: [],
          upNext: [],
        }}
        activePage="session1.html"
        activeSection={null}
        working={false}
        collapsed
        onToggleCollapsed={() => {}}
        onSelectPage={() => {}}
        onSelectSection={() => {}}
        onChooseTopic={() => {}}
      />,
    );

    expect(html).toContain('aria-label="Open course navigation"');
    expect(html).not.toContain(">Course</span>");
    expect(html).not.toContain("Practice");
  });

  it("shows an inline spinner and disables the picker when a course switch is in flight", () => {
    const html = renderToStaticMarkup(
      <Toolbar
        courseTitle="From Silicon to a Simple CPU"
        courseId="ev-batteries"
        switchingCourseId="current"
        courses={courses}
        inspecting={false}
        multipleSelection={false}
        canInspect
        courseChanged={false}
        checkpoints={[]}
        working={false}
        exporting={false}
        onHome={() => {}}
        onSwitchCourse={() => {}}
        onToggleInspect={() => {}}
        onToggleMultipleSelection={() => {}}
        onRevert={() => {}}
        onExport={() => {}}
      />,
    );

    expect(html).toContain("course-switcher-spinner");
    expect(html).toContain("disabled");
    expect(html).toContain('title="Opening course…"');
  });

  it("renders a switching transition card in Preview during course switches", () => {
    const html = renderToStaticMarkup(
      <Preview
        courseId="ev-batteries"
        courseVersion={1}
        inspecting={false}
        multipleSelection={false}
        courseChanged={false}
        codex={{ state: "ready" }}
        switchingCourse={{ id: "current", title: "From Silicon to a Simple CPU" }}
        working={false}
        onSelection={() => {}}
        onReadingPosition={() => {}}
        onInspectCancelled={() => {}}
        onStartRequested={() => {}}
      />,
    );

    expect(html).toContain("course-switching-card");
    expect(html).toContain("From Silicon to a Simple CPU");
    expect(html).toContain("course-starting-progress active");
    expect(html).toContain("Opening course environment…");
    expect(html).not.toContain("<iframe");
  });
});

