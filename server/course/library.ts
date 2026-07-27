import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { CourseSummary } from "../../shared/protocol";
import { CourseManager } from "./CourseManager";

export async function listCourses(repositoryRoot: string, currentCourseId: string): Promise<CourseSummary[]> {
  const coursesDirectory = join(repositoryRoot, "courses");
  await mkdir(coursesDirectory, { recursive: true });
  const entries = await readdir(coursesDirectory, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory() && isCourseId(entry.name));

  const courses = await Promise.all(directories.map(async (entry) => {
    const manager = new CourseManager(repositoryRoot, `courses/${entry.name}`);
    const outline = await manager.getOutline();
    return {
      id: entry.name,
      title: outline.hasContent ? outline.title : humanize(entry.name),
      phase: outline.phase,
      hasContent: outline.hasContent,
    } satisfies CourseSummary;
  }));

  return courses.sort((left, right) => {
    if (left.id === currentCourseId) return -1;
    if (right.id === currentCourseId) return 1;
    return left.title.localeCompare(right.title);
  });
}

export async function allocateCourseId(repositoryRoot: string, topic: string) {
  const coursesDirectory = join(repositoryRoot, "courses");
  await mkdir(coursesDirectory, { recursive: true });
  const existing = new Set(await readdir(coursesDirectory));
  const base = slug(topic) || "course";
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

export function isCourseId(value: string) {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

function slug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54)
    .replace(/-$/g, "");
}

function humanize(value: string) {
  return value.split("-").filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") || "New course";
}
