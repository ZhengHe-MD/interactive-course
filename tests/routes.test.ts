import { describe, expect, it } from "vitest";
import { courseRoutePath, parseStudioRoute } from "../src/routes";

describe("routes", () => {
  it("parses home route from root and empty paths", () => {
    expect(parseStudioRoute("/")).toEqual({ kind: "home" });
    expect(parseStudioRoute("")).toEqual({ kind: "home" });
    expect(parseStudioRoute("///")).toEqual({ kind: "home" });
  });

  it("parses course route without page", () => {
    expect(parseStudioRoute("/courses/my-course-id")).toEqual({
      kind: "course",
      courseId: "my-course-id",
      page: undefined,
    });
  });

  it("parses course route with encoded characters and page", () => {
    expect(parseStudioRoute("/courses/my%20course/lesson1.html")).toEqual({
      kind: "course",
      courseId: "my course",
      page: "lesson1.html",
    });
  });

  it("parses language parameters and localized page paths", () => {
    expect(parseStudioRoute("/", "?lang=zh-CN")).toEqual({ kind: "home", lang: "zh-CN" });
    expect(parseStudioRoute("/courses/my-course?lang=zh-CN", "?lang=zh-CN")).toEqual({
      kind: "course",
      courseId: "my-course",
      page: undefined,
      lang: "zh-CN",
    });
    expect(parseStudioRoute("/courses/my-course/session1.zh-CN.html")).toEqual({
      kind: "course",
      courseId: "my-course",
      page: "session1.zh-CN.html",
      lang: "zh-CN",
    });
    expect(parseStudioRoute("/courses/my-course/session1.html")).toEqual({
      kind: "course",
      courseId: "my-course",
      page: "session1.html",
      lang: undefined,
    });
    expect(parseStudioRoute("/courses/my-course/session1.html?lang=en")).toEqual({
      kind: "course",
      courseId: "my-course",
      page: "session1.html",
      lang: "en",
    });
  });

  it("builds clean course route paths with language support", () => {
    expect(courseRoutePath("my-course")).toBe("/courses/my-course");
    expect(courseRoutePath("my-course", "syllabus.html")).toBe("/courses/my-course");
    expect(courseRoutePath("my-course", "lesson1.html")).toBe("/courses/my-course/lesson1.html");
    expect(courseRoutePath("my-course", "lesson1.zh-CN.html", "zh-CN")).toBe("/courses/my-course/lesson1.zh-CN.html");
    expect(courseRoutePath("my-course", "syllabus.html", "zh-CN")).toBe("/courses/my-course?lang=zh-CN");
    expect(courseRoutePath("my course", "session 1.html")).toBe("/courses/my%20course/session%201.html");
  });
});
