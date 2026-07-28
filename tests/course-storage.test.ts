import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureCourseLibrary, resolveCourseLibraryRoot } from "../server/course/storage";

describe("course storage", () => {
  it("keeps generated courses in a user library outside the Studio repository", () => {
    expect(resolveCourseLibraryRoot("/workspace/course-studio", {}, "/Users/learner")).toBe("/Users/learner/.courses");
    expect(resolveCourseLibraryRoot("/workspace/course-studio", { COURSE_STUDIO_LIBRARY: "/Volumes/learning/courses" }, "/Users/learner"))
      .toBe("/Volumes/learning/courses");
  });

  it("rejects a configured library inside the Studio checkout", () => {
    expect(() => resolveCourseLibraryRoot(
      "/workspace/course-studio",
      { COURSE_STUDIO_LIBRARY: "/workspace/course-studio/generated-courses" },
      "/Users/learner",
    )).toThrow("outside the Course Studio repository");
  });

  it("rejects ancestors and symlinks that would overlap the Studio checkout", async () => {
    const root = await mkdtemp(join(tmpdir(), "course-storage-boundary-test-"));
    const studioRoot = join(root, "studio");
    const materialInsideStudio = join(studioRoot, "generated-courses");
    const disguisedLibrary = join(root, "external-looking-library");
    await mkdir(materialInsideStudio, { recursive: true });
    await symlink(materialInsideStudio, disguisedLibrary, "dir");

    expect(() => resolveCourseLibraryRoot(
      studioRoot,
      { COURSE_STUDIO_LIBRARY: root },
      "/Users/learner",
    )).toThrow("outside the Course Studio repository");
    expect(() => resolveCourseLibraryRoot(
      studioRoot,
      { COURSE_STUDIO_LIBRARY: disguisedLibrary },
      "/Users/learner",
    )).toThrow("outside the Course Studio repository");
  });

  it("gives the course library its own Git history", async () => {
    const libraryRoot = await mkdtemp(join(tmpdir(), "course-library-storage-test-"));

    await ensureCourseLibrary(libraryRoot);

    expect(execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: libraryRoot, encoding: "utf8" }).trim())
      .toBe(await realpath(libraryRoot));
  });
});
