import { describe, expect, it } from "vitest";
import { buildCoursePrompt, selectionInputs } from "../server/course/prompt";

describe("course prompt", () => {
  it("grounds an edit in the selected DOM and course-first contract", () => {
    const prompt = buildCoursePrompt("Make this concrete", [
      {
        id: "one",
        tag: "p",
        text: "The explanation goes here.",
        outerHTML: '<p class="lead">The explanation goes here.</p>',
        location: "main > section:nth-of-type(1) > p.lead",
      },
    ]);

    expect(prompt).toContain("Make this concrete");
    expect(prompt).toContain("main > section:nth-of-type(1) > p.lead");
    expect(prompt).toContain('<p class="lead">');
    expect(prompt).toContain("substantive answers live in the course");
    expect(prompt).toContain("explicitly asks for a chat-only or meta answer");
    expect(prompt).toContain("Do not run git");
  });

  it("passes only image data URLs to app-server", () => {
    const inputs = selectionInputs([
      { id: "a", tag: "p", text: "a", outerHTML: "<p>a</p>", location: "p", screenshot: "data:image/jpeg;base64,abc" },
      { id: "b", tag: "p", text: "b", outerHTML: "<p>b</p>", location: "p", screenshot: "https://example.com/b.png" },
    ]);

    expect(inputs).toEqual([{ type: "image", url: "data:image/jpeg;base64,abc" }]);
  });

  it("starts with an interview and builds a new course from scratch", () => {
    const prompt = buildCoursePrompt("I want to learn something new", [], { coursePhase: "empty" });

    expect(prompt).toContain("no index.html yet");
    expect(prompt).toContain("do not create files yet");
    expect(prompt).toContain("goal, desired depth, current background, and time budget");
    expect(prompt).toContain("from scratch");
    expect(prompt).toContain("Do not copy a sample course");
    expect(prompt).toContain("create only a syllabus");
    expect(prompt).toContain('content="syllabus"');
    expect(prompt).toContain("Do not create lesson files");
  });

  it("keeps syllabus approval and lazy lesson generation as explicit phases", () => {
    const syllabus = buildCoursePrompt("Make the outline more practical", [], { coursePhase: "syllabus" });
    const learning = buildCoursePrompt("Continue", [], { coursePhase: "learning" });

    expect(syllabus).toContain("until the learner explicitly approves the syllabus");
    expect(syllabus).toContain("create only the first lesson");
    expect(learning).toContain("only when the learner reaches or explicitly requests it");
    expect(learning).toContain("never the remaining course in advance");
  });
});
