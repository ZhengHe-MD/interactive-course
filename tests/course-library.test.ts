import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allocateCourseId, isCourseId, listCourses } from "../server/course/library";

async function library() {
  const root = await mkdtemp(join(tmpdir(), "course-library-test-"));
  await mkdir(join(root, "courses/current"), { recursive: true });
  await mkdir(join(root, "courses/ev-batteries"), { recursive: true });
  await writeFile(join(root, "courses/current/index.html"), "<h1>From Silicon to a Simple CPU</h1>");
  await writeFile(
    join(root, "courses/ev-batteries/index.html"),
    '<meta name="course-studio-phase" content="syllabus"><h1>EV Battery Fundamentals</h1>',
  );
  return root;
}

describe("course library", () => {
  it("lists isolated course directories and puts the open course first", async () => {
    const root = await library();

    expect(await listCourses(root, "ev-batteries")).toEqual([
      { id: "ev-batteries", title: "EV Battery Fundamentals", phase: "syllabus", hasContent: true },
      { id: "current", title: "From Silicon to a Simple CPU", phase: "learning", hasContent: true },
    ]);
  });

  it("allocates readable, collision-free ids without touching another course", async () => {
    const root = await library();

    expect(await allocateCourseId(root, "EV Batteries")).toBe("ev-batteries-2");
    expect(await allocateCourseId(root, "电动汽车电池")).toBe("course");
  });

  it("rejects ids that could escape the courses directory", () => {
    expect(isCourseId("bayes-theorem")).toBe(true);
    expect(isCourseId("../outside")).toBe(false);
    expect(isCourseId("Course With Spaces")).toBe(false);
  });
});
