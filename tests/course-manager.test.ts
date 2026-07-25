import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CourseManager, deriveMeta } from "../server/course/CourseManager.ts";

const manifest = {
  title: "Test course",
  lessonTag: "Lesson 01",
  lessonMeta: "Test · 1 min",
  entry: "index.html",
  sections: [{ id: "sec-intro", label: "Introduction" }],
  upNext: ["Next thing"],
};

let root: string;
let templateDir: string;
let workspaceRoot: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "cs-test-"));
  templateDir = path.join(root, "template");
  workspaceRoot = path.join(root, "workspace");
  await fs.mkdir(templateDir, { recursive: true });
  await fs.writeFile(path.join(templateDir, "course.json"), JSON.stringify(manifest));
  await fs.writeFile(path.join(templateDir, "index.html"), "<h1>Original</h1>");
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("CourseManager", () => {
  it("seeds the workspace and makes a birth checkpoint", async () => {
    const cm = new CourseManager(templateDir, workspaceRoot, "test");
    await cm.init();

    const checkpoints = await cm.listCheckpoints();
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].seed).toBe(true);
    expect(checkpoints[0].label).toBe("Course created");

    const state = await cm.getState();
    expect(state.title).toBe("Test course");
    expect(state.sections[0].label).toBe("Introduction");
    expect(state.upNext).toEqual(["Next thing"]);
  });

  it("commits a checkpoint only when files changed", async () => {
    const cm = new CourseManager(templateDir, workspaceRoot, "test");
    await cm.init();

    expect(await cm.checkpoint("nothing changed")).toBe(false);

    await fs.writeFile(path.join(cm.dir, "index.html"), "<h1>Edited</h1>");
    expect(await cm.checkpoint("edit the heading")).toBe(true);

    const checkpoints = await cm.listCheckpoints();
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[1].label).toBe("edit the heading");
    expect(checkpoints[1].seed).toBe(false);
  });

  it("reverts the last checkpoint but never below the seed", async () => {
    const cm = new CourseManager(templateDir, workspaceRoot, "test");
    await cm.init();

    await fs.writeFile(path.join(cm.dir, "index.html"), "<h1>Edited</h1>");
    await cm.checkpoint("edit");

    expect(await cm.revert()).toBe(true);
    expect(await fs.readFile(path.join(cm.dir, "index.html"), "utf8")).toBe("<h1>Original</h1>");
    expect(await cm.listCheckpoints()).toHaveLength(1);

    // Only the seed remains — refuse to revert it away.
    expect(await cm.revert()).toBe(false);
  });

  it("starts empty when there is no template, and is born on first content", async () => {
    // No template dir at this path → an unborn course.
    const cm = new CourseManager(path.join(root, "nope"), workspaceRoot, "fresh");
    await cm.init();

    let state = await cm.getState();
    expect(state.hasContent).toBe(false);
    expect(state.title).toBe("New course");
    expect(state.sections).toEqual([]);
    const seed = await cm.listCheckpoints();
    expect(seed).toHaveLength(1);
    expect(seed[0].label).toBe("New course");

    // The agent writes the first lesson (no course.json) — metadata is derived.
    await fs.writeFile(
      path.join(cm.dir, "index.html"),
      "<title>Intro to Graphs</title><h1 id='top'>Graphs</h1><h2 id='edges'>Edges</h2>",
    );
    await cm.checkpoint("build first lesson");

    state = await cm.getState();
    expect(state.hasContent).toBe(true);
    expect(state.title).toBe("Intro to Graphs");
    expect(state.sections).toEqual([
      { id: "top", label: "Graphs" },
      { id: "edges", label: "Edges" },
    ]);
  });

  it("does not re-seed an existing workspace", async () => {
    const first = new CourseManager(templateDir, workspaceRoot, "test");
    await first.init();
    await fs.writeFile(path.join(first.dir, "index.html"), "<h1>Edited</h1>");
    await first.checkpoint("edit");

    const second = new CourseManager(templateDir, workspaceRoot, "test");
    await second.init();
    // Preserves history and edits rather than copying the template again.
    expect(await second.listCheckpoints()).toHaveLength(2);
    expect(await fs.readFile(path.join(second.dir, "index.html"), "utf8")).toBe("<h1>Edited</h1>");
  });
});

describe("deriveMeta", () => {
  it("prefers <title>, falls back to the first <h1>", () => {
    expect(deriveMeta("<title>Named</title><h1>Heading</h1>").title).toBe("Named");
    expect(deriveMeta("<h1>Only Heading</h1>").title).toBe("Only Heading");
    expect(deriveMeta("<p>no headings</p>").title).toBe("Untitled lesson");
  });

  it("collects h1/h2 with ids as the table of contents, stripping inner tags", () => {
    const html =
      "<h1 id='a'>Intro</h1><h2>skip me</h2><h2 id='b'>The <em>hard</em> part</h2>";
    expect(deriveMeta(html).sections).toEqual([
      { id: "a", label: "Intro" },
      { id: "b", label: "The hard part" },
    ]);
  });
});
