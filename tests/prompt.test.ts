import { describe, expect, it } from "vitest";
import { buildCoursePrompt, selectionInputs } from "../server/course/prompt";

describe("course prompt", () => {
  it("grounds an edit in the selected DOM and course-first contract", () => {
    const prompt = buildCoursePrompt("Make this concrete", [
      {
        id: "one",
        tag: "p",
        text: "Bayes updates a belief.",
        outerHTML: '<p class="lead">Bayes updates a belief.</p>',
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
});
