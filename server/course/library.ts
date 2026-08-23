import { mkdir, readdir } from "node:fs/promises";
import type { AgentConfig, CourseSummary } from "../../shared/protocol";
import { CourseManager } from "./CourseManager";
import { generateCourseSlug, isCourseId, pinyinSlug, slug, type SlugCodexClient } from "./slug";

export { generateCourseSlug, isCourseId, pinyinSlug, slug, type SlugCodexClient };

export async function listCourses(libraryRoot: string, currentCourseId: string): Promise<CourseSummary[]> {
  await mkdir(libraryRoot, { recursive: true });
  const entries = await readdir(libraryRoot, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory() && isCourseId(entry.name));

  const courses = await Promise.all(directories.map(async (entry) => {
    const manager = new CourseManager(libraryRoot, entry.name);
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

export async function allocateCourseId(
  libraryRoot: string,
  topic: string,
  options: {
    codex?: SlugCodexClient | null;
    agent?: AgentConfig;
    timeoutMs?: number;
  } = {},
) {
  await mkdir(libraryRoot, { recursive: true });
  const existing = new Set(await readdir(libraryRoot));
  const base = await generateCourseSlug(topic, options);
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

function humanize(value: string) {
  return value.split("-").filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") || "New course";
}

