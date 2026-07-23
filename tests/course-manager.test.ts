import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CourseManager } from "../server/course/CourseManager";

const managers: CourseManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.close()));
});

describe("CourseManager", () => {
  it("checkpoints course edits and restores the previous course state", async () => {
    const root = await mkdtemp(join(tmpdir(), "course-studio-test-"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("mkdir", ["-p", "courses/demo"], { cwd: root });
    await writeFile(join(root, "courses/demo/index.html"), "<h1>First</h1>\n");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "feat: add demo course"], { cwd: root });

    const manager = new CourseManager(root, "courses/demo");
    managers.push(manager);
    await writeFile(join(root, "courses/demo/index.html"), "<h1>Second</h1>\n");

    const checkpoint = await manager.createCheckpoint("Made the title concrete");
    expect(checkpoint?.label).toBe("Made the title concrete");
    expect(await manager.isDirty()).toBe(false);

    await writeFile(join(root, "courses/demo/stray.html"), "partial turn\n");
    const reverted = await manager.revertLast();
    expect(reverted?.label).toBe("Reverted “Made the title concrete”");
    expect(await readFile(join(root, "courses/demo/index.html"), "utf8")).toBe("<h1>First</h1>\n");
    await expect(readFile(join(root, "courses/demo/stray.html"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("records a checkpoint for a successful turn with no file edits", async () => {
    const root = await mkdtemp(join(tmpdir(), "course-studio-test-"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("mkdir", ["-p", "courses/demo"], { cwd: root });
    await writeFile(join(root, "courses/demo/index.html"), "<h1>First</h1>\n");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "feat: add demo course"], { cwd: root });

    const manager = new CourseManager(root, "courses/demo");
    managers.push(manager);
    const checkpoint = await manager.createCheckpoint("Answered in chat", { allowEmpty: true });

    expect(checkpoint?.label).toBe("Answered in chat");
    expect((await manager.listCheckpoints(2)).map(({ label }) => label)).toEqual(["Answered in chat", "feat: add demo course"]);
  });
});
