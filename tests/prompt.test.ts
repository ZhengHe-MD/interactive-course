import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildCoursePrompt, writeSelectionImages } from "../server/course/prompt";

const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("course prompt", () => {
  it("grounds a request in the selected DOM without treating selection as edit permission", () => {
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
    expect(prompt).toContain("reference context, not as authorization to edit");
    expect(prompt).toContain("answer fully in chat and do not modify course files");
    expect(prompt).toContain("Edit the course only when they explicitly ask");
    expect(prompt).toContain("Do not run git");
  });

  it("marks highlighted text as an exact quote for chat questions", () => {
    const prompt = buildCoursePrompt("Why does this distinction matter?", [{
      id: "quote",
      kind: "text",
      tag: "p",
      text: "Energy is not the same as power.",
      outerHTML: "Energy is not the same as power.",
      location: "main > p",
      page: "session1.html",
    }]);

    expect(prompt).toContain("Selection kind: text");
    expect(prompt).toContain("Exact quoted text: Energy is not the same as power.");
    expect(prompt).toContain("Page: session1.html");
    expect(prompt).toContain("do not make a speculative edit");
  });

  it("writes only image data URLs to disk, then cleans them up", async () => {
    const { inputs, cleanup } = await writeSelectionImages([
      { id: "a", tag: "p", text: "a", outerHTML: "<p>a</p>", location: "p", screenshot: `data:image/png;base64,${pixel}` },
      { id: "b", tag: "p", text: "b", outerHTML: "<p>b</p>", location: "p", screenshot: "https://example.com/b.png" },
      { id: "c", tag: "p", text: "c", outerHTML: "<p>c</p>", location: "p" },
    ]);

    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ type: "localImage" });
    const path = (inputs[0] as { path: string }).path;
    expect(path.endsWith(".png")).toBe(true);
    expect((await readFile(path)).byteLength).toBeGreaterThan(0);

    await cleanup();
    await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("touches the disk only when something was actually captured", async () => {
    const { inputs } = await writeSelectionImages([
      { id: "a", tag: "p", text: "a", outerHTML: "<p>a</p>", location: "p" },
    ]);
    expect(inputs).toEqual([]);
  });

  it("starts with an interview and builds a new course from scratch", () => {
    const prompt = buildCoursePrompt("I want to learn something new", [], { coursePhase: "empty" });

    expect(prompt).toContain("no syllabus.html or legacy index.html yet");
    expect(prompt).toContain("do not create files yet");
    expect(prompt).toContain("goal, desired depth, current background, and time budget");
    expect(prompt).toContain("from scratch");
    expect(prompt).toContain("Do not copy a sample course");
    expect(prompt).toContain("create only a syllabus as syllabus.html");
    expect(prompt).toContain('content="syllabus"');
    expect(prompt).toContain("Do not create session files");
  });

  it("keeps syllabus approval and lazy lesson generation as explicit phases", () => {
    const syllabus = buildCoursePrompt("Make the outline more practical", [], { coursePhase: "syllabus" });
    const learning = buildCoursePrompt("Continue", [], { coursePhase: "learning" });

    expect(syllabus).toContain("until the learner explicitly approves the syllabus");
    expect(syllabus).toContain("preserve the syllabus file permanently");
    expect(syllabus).toContain("session1.html");
    expect(learning).toContain("only when the learner reaches or explicitly requests it");
    expect(learning).toContain("never the remaining course in advance");
    expect(learning).toContain("must never be repurposed or overwritten");
  });

  it("tells the agent which course page the learner is viewing", () => {
    const prompt = buildCoursePrompt("Make the exercise clearer", [], {
      coursePhase: "learning",
      activePage: "session2.html",
      activeSection: { id: "counterexample", index: 2, label: "A surprising counterexample" },
    });

    expect(prompt).toContain("Reading position when the learner sent this request:");
    expect(prompt).toContain("Page: session2.html");
    expect(prompt).toContain("Nearest section: A surprising counterexample");
    expect(prompt).toContain("Section location: #counterexample");
    expect(prompt).toContain("currently viewing session2.html");
    expect(prompt).toContain("use that page");
  });

  it("still records page-level context when no section can be identified", () => {
    const prompt = buildCoursePrompt("Can you explain this?", [], {
      coursePhase: "syllabus",
      activePage: "syllabus.html",
    });

    expect(prompt).toContain("Page: syllabus.html");
    expect(prompt).toContain("Nearest section: (no section identified)");
  });

  it("gives the agent the selected Chinese language without treating it as a translation request", () => {
    const prompt = buildCoursePrompt("继续讲解", [], {
      coursePhase: "learning",
      activePage: "session1.html",
      language: "zh-CN",
    });

    expect(prompt).toContain("Simplified Chinese (zh-CN)");
    expect(prompt).toContain("Reply in Simplified Chinese");
    expect(prompt).toContain('<html lang="zh-CN">');
    expect(prompt).toContain("Do not translate or rewrite existing course material merely because the Studio language changed");
    expect(prompt).toContain("unless the learner explicitly asks to translate it");
  });

  it("includes 3-tier terminology and widget safety instructions for translation requests", () => {
    const prompt = buildCoursePrompt("把这一课翻译成中文", [], {
      coursePhase: "learning",
      activePage: "session1.html",
      language: "zh-CN",
    });

    expect(prompt).toContain("3-tier terminology standard");
    expect(prompt).toContain("梯度下降, 反向传播, 过拟合");
    expect(prompt).toContain("提示词注入 (Prompt Injection)");
    expect(prompt).toContain("Token, Transformer, LoRA, Fine-tuning, PyTorch");
    expect(prompt).toContain("session1.zh-CN.html");
    expect(prompt).toContain("Strictly preserve all HTML element IDs, class names, data-* attributes, localStorage keys");
  });
});
