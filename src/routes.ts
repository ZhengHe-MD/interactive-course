import type { Language } from "../shared/protocol";

export type StudioRoute =
  | { kind: "home"; lang?: Language }
  | { kind: "course"; courseId: string; page?: string; lang?: Language };

export function parseStudioRoute(
  pathname = typeof window !== "undefined" ? window.location.pathname : "/",
  search = typeof window !== "undefined" ? window.location.search : "",
): StudioRoute {
  const [pathOnly, inlineSearch] = pathname.split("?");
  const effectiveSearch = search || (inlineSearch ? `?${inlineSearch}` : "");
  const params = new URLSearchParams(effectiveSearch);
  const searchLang = params.get("lang");
  const parsedSearchLang: Language | undefined =
    searchLang === "zh-CN" || searchLang === "zh"
      ? "zh-CN"
      : searchLang === "en"
        ? "en"
        : undefined;

  const clean = pathOnly.replace(/^\/+|\/+$/g, "");
  if (!clean) return { kind: "home", lang: parsedSearchLang };
  const parts = clean.split("/");
  if (parts[0] === "courses" && parts[1]) {
    const page = parts[2] ? decodeURIComponent(parts[2]) : undefined;
    const pageLang: Language | undefined = page
      ? page.includes(".zh-CN.") || page.endsWith(".zh-CN.html")
        ? "zh-CN"
        : undefined
      : undefined;

    return {
      kind: "course",
      courseId: decodeURIComponent(parts[1]),
      page,
      lang: parsedSearchLang ?? pageLang,
    };
  }
  return { kind: "home", lang: parsedSearchLang };
}

export function courseRoutePath(courseId: string, page?: string, lang?: Language) {
  const base = `/courses/${encodeURIComponent(courseId)}`;
  const pageSegment = page && page !== "syllabus.html" ? `/${encodeURIComponent(page)}` : "";
  const query = lang && lang !== "en" && (!page || !page.includes(`.${lang}.`)) ? `?lang=${encodeURIComponent(lang)}` : "";
  return `${base}${pageSegment}${query}`;
}
