import type { CourseSection } from "./types";

export type ReadingPosition = {
  page: string;
  top: number;
  section?: CourseSection;
};

const key = (courseId: string) => `course-studio:reading-position:${courseId}`;

export function readReadingPosition(
  courseId: string,
  storage: Pick<Storage, "getItem"> = window.localStorage,
): ReadingPosition | null {
  try {
    const value = JSON.parse(storage.getItem(key(courseId)) ?? "null") as Partial<ReadingPosition> | null;
    if (!value || typeof value.page !== "string" || !value.page) return null;
    if (typeof value.top !== "number" || !Number.isFinite(value.top) || value.top < 0) return null;

    const section = value.section;
    return {
      page: value.page,
      top: value.top,
      section: section
        && typeof section.index === "number"
        && Number.isInteger(section.index)
        && typeof section.label === "string"
        ? { id: typeof section.id === "string" ? section.id : undefined, index: section.index, label: section.label }
        : undefined,
    };
  } catch {
    return null;
  }
}

export function writeReadingPosition(
  courseId: string,
  position: ReadingPosition,
  storage: Pick<Storage, "setItem"> = window.localStorage,
) {
  try {
    storage.setItem(key(courseId), JSON.stringify(position));
  } catch {
    // Resume is a convenience. Storage restrictions must not interrupt study.
  }
}
