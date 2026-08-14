export type StudioRoute =
  | { kind: "home" }
  | { kind: "course"; courseId: string; page?: string };

export function parseStudioRoute(pathname = typeof window !== "undefined" ? window.location.pathname : "/"): StudioRoute {
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  if (!clean) return { kind: "home" };
  const parts = clean.split("/");
  if (parts[0] === "courses" && parts[1]) {
    return {
      kind: "course",
      courseId: decodeURIComponent(parts[1]),
      page: parts[2] ? decodeURIComponent(parts[2]) : undefined,
    };
  }
  return { kind: "home" };
}

export function courseRoutePath(courseId: string, page?: string) {
  const base = `/courses/${encodeURIComponent(courseId)}`;
  return page && page !== "syllabus.html" ? `${base}/${encodeURIComponent(page)}` : base;
}
