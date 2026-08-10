import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import AdmZip from "adm-zip";
import { CourseManager } from "./CourseManager";
import { allocateCourseId, isCourseId } from "./library";

export async function exportCoursePackage(courseDirectory: string): Promise<Buffer> {
  const zip = new AdmZip();
  const root = resolve(courseDirectory);

  async function addDirectory(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = join(currentDir, entry.name);
      const relativePath = relative(root, fullPath).split(sep).join("/");
      if (entry.isDirectory()) {
        await addDirectory(fullPath);
      } else if (entry.isFile()) {
        const content = await readFile(fullPath);
        zip.addFile(relativePath, content);
      }
    }
  }

  await addDirectory(root);
  return zip.toBuffer();
}

export async function importCoursePackage(options: {
  libraryRoot: string;
  zipBuffer: Buffer;
  requestedId?: string;
  onConflict?: "replace" | "copy";
}): Promise<{ courseId: string }> {
  const { libraryRoot, zipBuffer, onConflict = "copy" } = options;
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory && !entry.entryName.split("/").some((part) => part.startsWith(".")));

  if (!entries.length) {
    throw new Error("The package is empty or contains only hidden files.");
  }

  // Detect if all entries share a single top-level folder
  const parts = entries.map((entry) => entry.entryName.split("/"));
  const hasCommonRoot = parts.every((p) => p.length > 1 && p[0] === parts[0][0]);
  const rootPrefix = hasCommonRoot ? `${parts[0][0]}/` : "";

  const normalizedEntries = entries.map((entry) => {
    const relativePath = hasCommonRoot ? entry.entryName.slice(rootPrefix.length) : entry.entryName;
    return {
      path: normalize(relativePath).replace(/^[/\\]+/, ""),
      getData: () => entry.getData(),
    };
  }).filter((e) => e.path && !e.path.startsWith(".."));

  const hasHtml = normalizedEntries.some((e) => e.path.toLowerCase().endsWith(".html"));
  if (!hasHtml) {
    throw new Error("The package must contain at least one HTML page (such as syllabus.html or index.html).");
  }

  const baseCandidate = options.requestedId && isCourseId(options.requestedId)
    ? options.requestedId
    : hasCommonRoot && isCourseId(parts[0][0])
      ? parts[0][0]
      : "course";

  const existingEntries = await readdir(libraryRoot, { withFileTypes: true }).catch(() => []);
  const existingDirs = new Set(existingEntries.filter((e) => e.isDirectory()).map((e) => e.name));
  const exists = existingDirs.has(baseCandidate);

  let targetId = baseCandidate;
  let isReplace = false;

  if (exists) {
    if (onConflict === "replace") {
      isReplace = true;
      targetId = baseCandidate;
    } else {
      targetId = await allocateCourseId(libraryRoot, baseCandidate);
    }
  }

  const targetDir = join(libraryRoot, targetId);

  if (isReplace) {
    // Remove existing files in targetDir except .git
    const currentFiles = await readdir(targetDir, { withFileTypes: true }).catch(() => []);
    for (const file of currentFiles) {
      if (file.name !== ".git") {
        await rm(join(targetDir, file.name), { recursive: true, force: true });
      }
    }
  }

  await mkdir(targetDir, { recursive: true });

  for (const entry of normalizedEntries) {
    const destination = resolve(targetDir, entry.path);
    if (!destination.startsWith(resolve(targetDir) + sep) && destination !== resolve(targetDir)) {
      throw new Error(`Invalid file path in package: ${entry.path}`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, entry.getData());
  }

  const manager = new CourseManager(libraryRoot, targetId);
  await manager.createCheckpoint(
    isReplace ? "Replaced course package" : "Imported course package",
    { allowEmpty: true },
  );

  return { courseId: targetId };
}
