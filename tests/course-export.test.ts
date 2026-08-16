import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildStandaloneCourse, exportFilename } from "../server/course/exportCourse";
import { buildExportPreparationPrompt } from "../server/course/prepareExport";
import type { CourseOutline } from "../shared/protocol";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("standalone course export", () => {
  it("turns an ad-hoc request into an export-only file transformation", () => {
    const prompt = buildExportPreparationPrompt("Translate the course into Simplified Chinese and add an executive summary.");

    expect(prompt).toContain("temporary copy of a completed course");
    expect(prompt).toContain("Translate the course into Simplified Chinese and add an executive summary.");
    expect(prompt).toContain("must edit the course files");
    expect(prompt).toContain("course material only");
    expect(prompt).toContain("Do not add chat transcripts, learner questions, agent answers");
    expect(prompt).toContain("Do not create the final bundled HTML yourself");
  });

  it("embeds every course page and its local assets in one TIL-compatible HTML file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "course-export-test-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "lesson.css"), ".diagram{background:url('./pixel.png')}\n");
    await writeFile(join(directory, "lesson.js"), "document.body.dataset.interactive = 'yes';\n");
    await writeFile(join(directory, "pixel.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(join(directory, "syllabus.html"), "<!doctype html><html><head><title>Syllabus</title></head><body><main><h1>Plan</h1></main></body></html>");
    await writeFile(join(directory, "session1.html"), `<!doctype html><html><head>
      <title>Practice</title><link rel="stylesheet" href="lesson.css">
      </head><body><main><section id="practice"><p class="diagram">Practice matters.</p><img src="pixel.png"></section></main>
      <script src="lesson.js"></script></body></html>`);

    const outline: CourseOutline = {
      phase: "learning",
      hasContent: true,
      title: "Practice & Humanity",
      topic: "A course about becoming humane through practice.",
      pages: [
        { path: "syllabus.html", title: "Syllabus", kind: "syllabus", sections: [] },
        { path: "session1.html", title: "Practice", kind: "lesson", sections: [] },
      ],
      sections: [],
      upNext: [],
    };

    const html = await buildStandaloneCourse({
      courseDirectory: directory,
      outline,
      language: "en",
      exportedAt: new Date("2026-07-28T10:00:00Z"),
    });

    expect(html).toContain('<meta name="date" content="2026-07-28">');
    expect(html).toContain('<meta name="summary" content="A course about becoming humane through practice.">');
    expect(html).toContain("<title>Practice & Humanity</title>");
    expect(html).toContain('<div class="cs-export-shell">');
    expect(html).toContain("data:image/png;base64,iVBORw==");
    expect(html).toContain('data-exported-from=\\"lesson.css\\"');
    expect(html).toContain('data-exported-from=\\"lesson.js\\"');
    expect(html).toContain("document.body.dataset.interactive = 'yes'");
    expect(html).not.toContain("Learner question");
    expect(html).not.toContain("Agent answer");
    expect(html).not.toContain("anchored conversations");
    expect(html).not.toContain('src=\"pixel.png\"');
    expect(html).not.toContain('href=\"lesson.css\"');
    expect(html).not.toContain('src=\"lesson.js\"');
    const runtime = /<script>\n([\s\S]*?)\n<\/script>\n<\/body>/.exec(html)?.[1];
    expect(runtime).toBeTruthy();
    expect(() => new Function(runtime!)).not.toThrow();
  });

  it("embeds conversation history in the standalone HTML with a toggleable Co-Design Companion drawer", async () => {
    const directory = await mkdtemp(join(tmpdir(), "course-export-test-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "syllabus.html"), "<!doctype html><html><head><title>Syllabus</title></head><body><main><h1>Plan</h1></main></body></html>");
    await writeFile(
      join(directory, "conversations.json"),
      JSON.stringify({
        version: 1,
        conversations: [
          {
            id: "conv-1",
            title: "Course Conception",
            createdAt: "2026-08-10T20:00:00Z",
            updatedAt: "2026-08-10T20:05:00Z",
            turns: [
              {
                id: "turn-1",
                prompt: "Can you create an interactive logic simulator?",
                response: "I've structured a 4-step logic simulator...",
                reasoning: ["Model gates visually", "Include truth tables"],
                createdAt: "2026-08-10T20:00:15Z",
              },
            ],
          },
        ],
      }),
    );

    const outline: CourseOutline = {
      phase: "learning",
      hasContent: true,
      title: "Interactive Digital Logic",
      topic: "Build intuition for logic gates.",
      pages: [{ path: "syllabus.html", title: "Syllabus", kind: "syllabus", sections: [] }],
      sections: [],
      upNext: [],
    };

    const html = await buildStandaloneCourse({
      courseDirectory: directory,
      outline,
      language: "en",
    });

    expect(html).toContain("cs-companion-toggle");
    expect(html).toContain("Co-Design Notes");
    expect(html).toContain("cs-companion-drawer");
    expect(html).toContain("cs-nav-num");
    expect(html).toContain("cs-frame-card");
    expect(html).toContain("cs-export-title");
    expect(html).not.toContain("cs-export-eyebrow");
    expect(html).not.toContain("cs-export-topic");
    expect(html).not.toContain("cs-export-pagebar");
    expect(html).toContain("fonts.googleapis.com/css2?family=Caprasimo");
    expect(html).toContain("--color-accent: #c67139;");
    expect(html).toContain("Can you create an interactive logic simulator?");
    expect(html).toContain("I've structured a 4-step logic simulator...");
    expect(html).toContain("Model gates visually");
  });

  it("renders bilingual labels for the Co-Design Companion in Simplified Chinese", async () => {
    const directory = await mkdtemp(join(tmpdir(), "course-export-test-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "syllabus.html"), "<!doctype html><html><head><title>教学大纲</title></head><body><main><h1>大纲</h1></main></body></html>");

    const outline: CourseOutline = {
      phase: "learning",
      hasContent: true,
      title: "数字逻辑",
      topic: "构建逻辑门直觉。",
      pages: [{ path: "syllabus.html", title: "教学大纲", kind: "syllabus", sections: [] }],
      sections: [],
      upNext: [],
    };

    const html = await buildStandaloneCourse({
      courseDirectory: directory,
      outline,
      language: "zh-CN",
    });

    expect(html).toContain("共同设计对话");
    expect(html).toContain("课程内容");
    expect(html).toContain("独立课程导出");
  });

  it("embeds multilingual sibling pages with a Course Edition Switcher in standalone exports", async () => {
    const directory = await mkdtemp(join(tmpdir(), "course-export-test-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "syllabus.html"), "<!doctype html><html><head><title>Syllabus</title></head><body><main><h1>Plan</h1></main></body></html>");
    await writeFile(join(directory, "syllabus.zh-CN.html"), "<!doctype html><html><head><title>课程大纲</title></head><body><main><h1>教学大纲</h1></main></body></html>");
    await writeFile(join(directory, "session1.html"), "<!doctype html><html><head><title>Practice</title></head><body><main><h1>Practice Matters</h1></main></body></html>");
    await writeFile(join(directory, "session1.zh-CN.html"), "<!doctype html><html><head><title>实战训练</title></head><body><main><h1>实战进阶</h1></main></body></html>");

    const outline: CourseOutline = {
      phase: "learning",
      hasContent: true,
      title: "Skills & Practice",
      topic: "Mastering skills.",
      availableLanguages: ["en", "zh-CN"],
      pages: [
        {
          path: "syllabus.html",
          basePath: "syllabus.html",
          lang: "en",
          title: "Syllabus",
          kind: "syllabus",
          translations: { en: "syllabus.html", "zh-CN": "syllabus.zh-CN.html" },
          sections: [],
        },
        {
          path: "syllabus.zh-CN.html",
          basePath: "syllabus.html",
          lang: "zh-CN",
          title: "课程大纲",
          kind: "syllabus",
          translations: { en: "syllabus.html", "zh-CN": "syllabus.zh-CN.html" },
          sections: [],
        },
        {
          path: "session1.html",
          basePath: "session1.html",
          lang: "en",
          title: "Practice",
          kind: "lesson",
          translations: { en: "session1.html", "zh-CN": "session1.zh-CN.html" },
          sections: [],
        },
        {
          path: "session1.zh-CN.html",
          basePath: "session1.html",
          lang: "zh-CN",
          title: "实战训练",
          kind: "lesson",
          translations: { en: "session1.html", "zh-CN": "session1.zh-CN.html" },
          sections: [],
        },
      ],
      sections: [],
      upNext: [],
    };

    const html = await buildStandaloneCourse({
      courseDirectory: directory,
      outline,
      language: "en",
    });

    expect(html).toContain("cs-lang-switcher");
    expect(html).toContain('data-lang="en"');
    expect(html).toContain('data-lang="zh-CN"');
    expect(html).toContain("实战进阶");
    expect(html).toContain("Practice Matters");

    const runtime = /<script>\n([\s\S]*?)\n<\/script>\n<\/body>/.exec(html)?.[1];
    expect(runtime).toBeTruthy();
    expect(() => new Function(runtime!)).not.toThrow();
  });

  it("creates a portable filename from the course title", () => {
    expect(exportFilename("Practice & Humanity")).toBe("practice-humanity.html");
    expect(exportFilename("论语：仁与礼")).toBe("论语-仁与礼.html");
  });
});
