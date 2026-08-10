import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { afterEach, describe, expect, it } from "vitest";
import { CourseManager } from "../server/course/CourseManager";
import { exportCoursePackage, importCoursePackage } from "../server/course/packageCourse";
import { ensureCourseLibrary } from "../server/course/storage";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("course package export and import", () => {
  it("exports a course directory into a standard .zip package containing all course files", async () => {
    const libraryRoot = await mkdtemp(join(tmpdir(), "course-pkg-lib-"));
    temporaryDirectories.push(libraryRoot);
    await ensureCourseLibrary(libraryRoot);

    const courseDir = join(libraryRoot, "logic-gates");
    await mkdir(courseDir, { recursive: true });
    await writeFile(join(courseDir, "syllabus.html"), "<!doctype html><html><head><title>Logic</title></head><body><h1>Syllabus</h1></body></html>");
    await writeFile(join(courseDir, "COURSE.md"), "# Course Brief\n\nTeaching digital logic.");
    await writeFile(join(courseDir, "conversations.json"), JSON.stringify({ version: 1, conversations: [] }));

    const zipBuffer = await exportCoursePackage(courseDir);
    expect(zipBuffer).toBeInstanceOf(Buffer);

    const zip = new AdmZip(zipBuffer);
    const entryNames = zip.getEntries().map((entry) => entry.entryName);
    expect(entryNames).toContain("syllabus.html");
    expect(entryNames).toContain("COURSE.md");
    expect(entryNames).toContain("conversations.json");
  });

  it("imports a course package into the library, creating an initial git checkpoint", async () => {
    const libraryRoot = await mkdtemp(join(tmpdir(), "course-pkg-lib-"));
    temporaryDirectories.push(libraryRoot);
    await ensureCourseLibrary(libraryRoot);

    const zip = new AdmZip();
    zip.addFile("syllabus.html", Buffer.from("<!doctype html><html><head><title>Quantum</title></head><body><h1>Quantum</h1></body></html>"));
    zip.addFile("COURSE.md", Buffer.from("# Quantum Brief"));
    const zipBuffer = zip.toBuffer();

    const result = await importCoursePackage({
      libraryRoot,
      zipBuffer,
      requestedId: "quantum-computing",
      onConflict: "copy",
    });

    expect(result.courseId).toBe("quantum-computing");

    const manager = new CourseManager(libraryRoot, "quantum-computing");
    const outline = await manager.getOutline();
    expect(outline.hasContent).toBe(true);

    const checkpoints = await manager.listCheckpoints();
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].label).toContain("Imported course package");
  });

  it("handles naming conflict by allocating a deduplicated ID when onConflict is copy", async () => {
    const libraryRoot = await mkdtemp(join(tmpdir(), "course-pkg-lib-"));
    temporaryDirectories.push(libraryRoot);
    await ensureCourseLibrary(libraryRoot);

    // Create existing course
    const existingCourseDir = join(libraryRoot, "quantum-computing");
    await mkdir(existingCourseDir, { recursive: true });
    await writeFile(join(existingCourseDir, "syllabus.html"), "<!doctype html><html><head><title>Existing</title></head></html>");

    const zip = new AdmZip();
    zip.addFile("syllabus.html", Buffer.from("<!doctype html><html><head><title>New Copy</title></head></html>"));
    const zipBuffer = zip.toBuffer();

    const result = await importCoursePackage({
      libraryRoot,
      zipBuffer,
      requestedId: "quantum-computing",
      onConflict: "copy",
    });

    expect(result.courseId).toBe("quantum-computing-2");

    const manager = new CourseManager(libraryRoot, "quantum-computing-2");
    const checkpoints = await manager.listCheckpoints();
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].label).toContain("Imported course package");
  });

  it("replaces existing course files when onConflict is replace", async () => {
    const libraryRoot = await mkdtemp(join(tmpdir(), "course-pkg-lib-"));
    temporaryDirectories.push(libraryRoot);
    await ensureCourseLibrary(libraryRoot);

    const existingCourseDir = join(libraryRoot, "quantum-computing");
    await mkdir(existingCourseDir, { recursive: true });
    await writeFile(join(existingCourseDir, "syllabus.html"), "<!doctype html><html><head><title>Old Syllabus</title></head></html>");

    const zip = new AdmZip();
    zip.addFile("syllabus.html", Buffer.from("<!doctype html><html><head><title>Replaced Syllabus</title></head></html>"));
    const zipBuffer = zip.toBuffer();

    const result = await importCoursePackage({
      libraryRoot,
      zipBuffer,
      requestedId: "quantum-computing",
      onConflict: "replace",
    });

    expect(result.courseId).toBe("quantum-computing");

    const content = await readFile(join(existingCourseDir, "syllabus.html"), "utf8");
    expect(content).toContain("Replaced Syllabus");

    const manager = new CourseManager(libraryRoot, "quantum-computing");
    const checkpoints = await manager.listCheckpoints();
    expect(checkpoints.some((c) => c.label.includes("Replaced course package"))).toBe(true);
  });

  it("rejects zip packages that have no valid HTML entry files", async () => {
    const libraryRoot = await mkdtemp(join(tmpdir(), "course-pkg-lib-"));
    temporaryDirectories.push(libraryRoot);
    await ensureCourseLibrary(libraryRoot);

    const zip = new AdmZip();
    zip.addFile("notes.txt", Buffer.from("No HTML in this zip"));
    const zipBuffer = zip.toBuffer();

    await expect(
      importCoursePackage({
        libraryRoot,
        zipBuffer,
        requestedId: "invalid-course",
        onConflict: "copy",
      }),
    ).rejects.toThrow("The package must contain at least one HTML page");
  });
});
