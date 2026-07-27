import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Preview } from "../src/components/Preview";
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
        canInspect
        courseChanged={false}
        checkpoints={[]}
        working={false}
        onHome={() => {}}
        onSwitchCourse={() => {}}
        onToggleInspect={() => {}}
        onRevert={() => {}}
      />,
    );

    expect(html).toContain('aria-label="Switch course"');
    expect(html).toContain("EV Battery Fundamentals");
    expect(html).toContain("From Silicon to a Simple CPU");
  });

  it("keeps the course picker available from the new-course screen", () => {
    const html = renderToStaticMarkup(
      <Welcome
        connected
        hasCourse
        working={false}
        courseId="ev-batteries"
        courses={courses}
        onBack={() => {}}
        onSwitchCourse={() => {}}
        onStart={() => {}}
      />,
    );

    expect(html).toContain("Open course");
    expect(html).toContain("From Silicon to a Simple CPU");
  });

  it("hides the previous preview while a separate course is being created", () => {
    const html = renderToStaticMarkup(
      <Preview
        courseVersion={1}
        inspecting={false}
        courseChanged={false}
        codex={{ state: "ready" }}
        startingTopic="Batteries for Electric Vehicles"
        working
        onSelection={() => {}}
        onInspectCancelled={() => {}}
        onStartRequested={() => {}}
      />,
    );

    expect(html).toContain("Batteries for Electric Vehicles");
    expect(html).toContain("Your previous course is saved");
    expect(html).not.toContain("<iframe");
  });
});
