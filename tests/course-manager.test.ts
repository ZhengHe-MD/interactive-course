import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CourseManager, deriveMeta } from "../server/course/CourseManager";

const managers: CourseManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.close()));
});

async function repository() {
  const root = await mkdtemp(join(tmpdir(), "course-studio-test-"));
  execFileSync("mkdir", ["-p", "demo"], { cwd: root });
  return root;
}

describe("CourseManager", () => {
  it("detects empty, syllabus, and learning phases from the course directory", async () => {
    const root = await repository();
    const manager = new CourseManager(root, "demo");
    managers.push(manager);

    expect(await manager.getCoursePhase()).toBe("empty");
    await writeFile(join(root, "demo/index.html"), '<meta name="course-studio-phase" content="syllabus"><h1>Plan</h1>');
    expect(await manager.getCoursePhase()).toBe("syllabus");
    await writeFile(join(root, "demo/index.html"), "<h1>Lesson one</h1>");
    expect(await manager.getCoursePhase()).toBe("learning");
  });

  it("reports an unborn course rather than inventing an outline", async () => {
    const root = await repository();
    const manager = new CourseManager(root, "demo");
    managers.push(manager);

    const outline = await manager.getOutline();
    expect(outline.hasContent).toBe(false);
    expect(outline.phase).toBe("empty");
    expect(outline.sections).toEqual([]);
    expect(outline.upNext).toEqual([]);
  });

  it("derives the outline from the course HTML", async () => {
    const root = await repository();
    const manager = new CourseManager(root, "demo");
    managers.push(manager);

    await writeFile(
      join(root, "demo/index.html"),
      `<title>Silicon to CPU — Syllabus</title>
       <meta name="course-studio-phase" content="syllabus">
       <h1>From Silicon to a Simple CPU</h1>
       <h2 id="outcomes">What you'll be able to <em>do</em></h2>
       <h2>The learning path</h2>`,
    );

    const outline = await manager.getOutline();
    expect(outline.phase).toBe("syllabus");
    expect(outline.hasContent).toBe(true);
    expect(outline.title).toBe("From Silicon to a Simple CPU");
    expect(outline.topic).toBe("Proposed syllabus");
    expect(outline.sections).toEqual([
      { id: "outcomes", index: 0, label: "What you'll be able to do" },
      { id: undefined, index: 1, label: "The learning path" },
    ]);
    expect(outline.pages).toEqual([{
      path: "index.html",
      basePath: "index.html",
      lang: "en",
      title: "Syllabus",
      kind: "syllabus",
      translations: { en: "index.html" },
      sections: [
        { id: "outcomes", index: 0, label: "What you'll be able to do" },
        { id: undefined, index: 1, label: "The learning path" },
      ],
    }]);
  });

  it("lets an optional course.json name lessons that do not exist yet", async () => {
    const root = await repository();
    const manager = new CourseManager(root, "demo");
    managers.push(manager);

    await writeFile(join(root, "demo/index.html"), "<h1>Lesson one</h1>");
    await writeFile(
      join(root, "demo/course.json"),
      JSON.stringify({ title: "Bayes, for you", topic: "Probability", upNext: ["Naive Bayes", 7] }),
    );

    const outline = await manager.getOutline();
    expect(outline.title).toBe("Bayes, for you");
    expect(outline.topic).toBe("Probability");
    expect(outline.upNext).toEqual(["Naive Bayes"]);
  });

  it("keeps the syllabus and generated sessions as separate navigable pages", async () => {
    const root = await repository();
    const manager = new CourseManager(root, "demo");
    managers.push(manager);

    await writeFile(
      join(root, "demo/syllabus.html"),
      '<meta name="course-studio-phase" content="learning"><meta name="course-studio-page" content="syllabus"><h1>Confucius</h1><h2 id="arc">Course arc</h2>',
    );
    await writeFile(
      join(root, "demo/session1.html"),
      '<meta name="course-studio-page" content="lesson"><meta name="course-page-title" content="Practice"><h1>Becoming human</h1><h2 id="question">Opening question</h2>',
    );
    await writeFile(
      join(root, "demo/session2.html"),
      '<meta name="course-studio-page" content="lesson"><meta name="course-page-title" content="Relationships"><h1>The relational self</h1>',
    );

    const outline = await manager.getOutline();
    expect(outline.phase).toBe("learning");
    expect(outline.pages).toEqual([
      {
        path: "syllabus.html",
        basePath: "syllabus.html",
        lang: "en",
        title: "Syllabus",
        kind: "syllabus",
        translations: { en: "syllabus.html" },
        sections: [{ id: "arc", index: 0, label: "Course arc" }],
      },
      {
        path: "session1.html",
        basePath: "session1.html",
        lang: "en",
        title: "Practice",
        kind: "lesson",
        translations: { en: "session1.html" },
        sections: [{ id: "question", index: 0, label: "Opening question" }],
      },
      {
        path: "session2.html",
        basePath: "session2.html",
        lang: "en",
        title: "Relationships",
        kind: "lesson",
        translations: { en: "session2.html" },
        sections: [],
      },
    ]);
  });

  it("organizes multilingual sibling pages and detects available languages", async () => {
    const root = await repository();
    const manager = new CourseManager(root, "demo");
    managers.push(manager);

    await writeFile(
      join(root, "demo/syllabus.html"),
      '<meta name="course-studio-phase" content="learning"><meta name="course-studio-page" content="syllabus"><h1>Skills</h1>',
    );
    await writeFile(
      join(root, "demo/syllabus.zh-CN.html"),
      '<meta name="course-studio-phase" content="learning"><meta name="course-studio-page" content="syllabus"><meta name="course-page-title" content="课程大纲"><h1>技能大纲</h1>',
    );
    await writeFile(
      join(root, "demo/session1.html"),
      '<meta name="course-studio-page" content="lesson"><meta name="course-page-title" content="Reading Skills"><h1>Reading</h1>',
    );
    await writeFile(
      join(root, "demo/session1.zh-CN.html"),
      '<meta name="course-studio-page" content="lesson"><meta name="course-page-title" content="技能系统解析"><h1>解析</h1>',
    );
    await writeFile(
      join(root, "demo/session2.html"),
      '<meta name="course-studio-page" content="lesson"><meta name="course-page-title" content="Designing Skills"><h1>Designing</h1>',
    );

    const outline = await manager.getOutline();
    expect(outline.availableLanguages).toEqual(["en", "zh-CN"]);
    expect(outline.pages.map((p) => p.path)).toEqual([
      "syllabus.html",
      "syllabus.zh-CN.html",
      "session1.html",
      "session1.zh-CN.html",
      "session2.html",
    ]);

    const syllabusZh = outline.pages.find((p) => p.path === "syllabus.zh-CN.html");
    expect(syllabusZh?.kind).toBe("syllabus");
    expect(syllabusZh?.basePath).toBe("syllabus.html");
    expect(syllabusZh?.translations).toEqual({ en: "syllabus.html", "zh-CN": "syllabus.zh-CN.html" });

    const session1En = outline.pages.find((p) => p.path === "session1.html");
    expect(session1En?.translations).toEqual({ en: "session1.html", "zh-CN": "session1.zh-CN.html" });

    const session2En = outline.pages.find((p) => p.path === "session2.html");
    expect(session2En?.translations).toEqual({ en: "session2.html" });
  });

  it("survives a course.json the agent wrote badly", async () => {
    const root = await repository();
    const manager = new CourseManager(root, "demo");
    managers.push(manager);

    await writeFile(join(root, "demo/index.html"), "<h1>Lesson one</h1>");
    await writeFile(join(root, "demo/course.json"), "{ not json at all");

    const outline = await manager.getOutline();
    expect(outline.title).toBe("Lesson one");
    expect(outline.upNext).toEqual([]);
  });

  it("checkpoints course edits and restores the previous course state", async () => {
    const root = await mkdtemp(join(tmpdir(), "course-studio-test-"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("mkdir", ["-p", "demo"], { cwd: root });
    await writeFile(join(root, "demo/index.html"), "<h1>First</h1>\n");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "feat: add demo course"], { cwd: root });

    const manager = new CourseManager(root, "demo");
    managers.push(manager);
    await writeFile(join(root, "demo/index.html"), "<h1>Second</h1>\n");

    const checkpoint = await manager.createCheckpoint("Made the title concrete");
    expect(checkpoint?.label).toBe("Made the title concrete");
    expect(await manager.isDirty()).toBe(false);

    await writeFile(join(root, "demo/stray.html"), "partial turn\n");
    const reverted = await manager.revertLast();
    expect(reverted?.label).toBe("Reverted “Made the title concrete”");
    expect(await readFile(join(root, "demo/index.html"), "utf8")).toBe("<h1>First</h1>\n");
    await expect(readFile(join(root, "demo/stray.html"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    // Undo is itself undoable: the reverted state is a checkpoint, not a rewrite.
    const labels = (await manager.listCheckpoints(3)).map(({ label }) => label);
    expect(labels).toEqual(["Reverted “Made the title concrete”", "Made the title concrete", "feat: add demo course"]);
  });

  it("records a checkpoint for a successful turn with no file edits", async () => {
    const root = await mkdtemp(join(tmpdir(), "course-studio-test-"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("mkdir", ["-p", "demo"], { cwd: root });
    await writeFile(join(root, "demo/index.html"), "<h1>First</h1>\n");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "feat: add demo course"], { cwd: root });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-qm", "course(other): Unrelated checkpoint"], { cwd: root });

    const manager = new CourseManager(root, "demo");
    managers.push(manager);
    const checkpoint = await manager.createCheckpoint("Answered in chat", { allowEmpty: true });

    expect(checkpoint?.label).toBe("Answered in chat");
    expect((await manager.listCheckpoints(2)).map(({ label }) => label)).toEqual(["Answered in chat", "feat: add demo course"]);
  });

  it("does not add a course checkpoint for a chat-only answer by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "course-studio-test-"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("mkdir", ["-p", "demo"], { cwd: root });
    await writeFile(join(root, "demo/index.html"), "<h1>First</h1>\n");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "feat: add demo course"], { cwd: root });

    const manager = new CourseManager(root, "demo");
    managers.push(manager);
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

    expect(await manager.createCheckpoint("Answered in chat")).toBeNull();
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()).toBe(head);
  });

  it("keeps checkpoint labels readable after moving a course out of the Studio repository", async () => {
    const root = await mkdtemp(join(tmpdir(), "course-studio-test-"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("mkdir", ["-p", "demo"], { cwd: root });
    await writeFile(join(root, "demo/index.html"), "<h1>First</h1>\n");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "course(courses/demo): Agent course update"], { cwd: root });

    const manager = new CourseManager(root, "demo");
    managers.push(manager);

    expect((await manager.listCheckpoints(1))[0]?.label).toBe("Agent course update");
  });

  it("records a chat-only checkpoint before the course has any files", async () => {
    const root = await mkdtemp(join(tmpdir(), "course-studio-test-"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("mkdir", ["-p", "aristotle"], { cwd: root });
    await writeFile(join(root, "unrelated.txt"), "keep staged\n");
    execFileSync("git", ["add", "unrelated.txt"], { cwd: root });

    const manager = new CourseManager(root, "aristotle");
    managers.push(manager);
    const checkpoint = await manager.createCheckpoint("Agent course update", { allowEmpty: true });

    expect(checkpoint?.label).toBe("Agent course update");
    expect(execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }))
      .toContain("A  unrelated.txt");
    expect(execFileSync("git", ["show", "--format=", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" }).trim())
      .toBe("");
  });

  it("has an empty timeline before the external library's first checkpoint", async () => {
    const root = await mkdtemp(join(tmpdir(), "course-studio-test-"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("mkdir", ["-p", "new-course"], { cwd: root });
    const manager = new CourseManager(root, "new-course");
    managers.push(manager);

    await expect(manager.listCheckpoints()).resolves.toEqual([]);
    await expect(manager.revertLast()).resolves.toBeNull();
  });
});

describe("deriveMeta", () => {
  it("prefers an explicit course title, then the first h1, then the document title", () => {
    expect(deriveMeta('<meta name="course-title" content="Named"><h1>Heading</h1>').title).toBe("Named");
    expect(deriveMeta("<h1>Heading</h1><title>Document</title>").title).toBe("Heading");
    expect(deriveMeta("<title>Document</title><p>no headings</p>").title).toBe("Document");
    expect(deriveMeta("<p>nothing at all</p>").title).toBe("Untitled course");
  });

  it("keeps heading ids where they exist and positions where they do not", () => {
    const html = "<h2 id='a'>Intro</h2><h2>Middle</h2><h2 id='c'>The <em>hard</em> part</h2>";
    expect(deriveMeta(html).sections).toEqual([
      { id: "a", index: 0, label: "Intro" },
      { id: undefined, index: 1, label: "Middle" },
      { id: "c", index: 2, label: "The hard part" },
    ]);
  });
});
