import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  allocateCourseId,
  generateCourseSlug,
  isCourseId,
  listCourses,
  pinyinSlug,
  slug,
} from "../server/course/library";

async function library() {
  const root = await mkdtemp(join(tmpdir(), "course-library-test-"));
  await mkdir(join(root, "current"), { recursive: true });
  await mkdir(join(root, "ev-batteries"), { recursive: true });
  await writeFile(join(root, "current/index.html"), "<h1>From Silicon to a Simple CPU</h1>");
  await writeFile(
    join(root, "ev-batteries/index.html"),
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

  it("allocates readable, collision-free ids for English topics", async () => {
    const root = await library();

    expect(await allocateCourseId(root, "EV Batteries")).toBe("ev-batteries-2");
    expect(await allocateCourseId(root, "Quantum Mechanics")).toBe("quantum-mechanics");
  });

  it("allocates Pinyin slugs for Chinese topics when Codex is not available", async () => {
    const root = await library();

    expect(await allocateCourseId(root, "电动汽车电池")).toBe("dian-dong-qi-che-dian-chi");
    expect(await allocateCourseId(root, "火影忍者")).toBe("huo-ying-ren-zhe");
    // Collision handling
    await mkdir(join(root, "huo-ying-ren-zhe"), { recursive: true });
    expect(await allocateCourseId(root, "火影忍者")).toBe("huo-ying-ren-zhe-2");
  });

  it("allocates semantic English slugs when Codex translation is available", async () => {
    const root = await library();
    const mockCodex = {
      translateTopicToSlug: async (topic: string) => {
        if (topic.includes("火影忍者")) return "naruto-storyline";
        return null;
      },
    };

    expect(
      await allocateCourseId(root, "火影忍者（不含博人传）的主要故事线和精神内核", { codex: mockCodex }),
    ).toBe("naruto-storyline");
  });

  it("falls back to Pinyin if Codex translation returns null or fails", async () => {
    const root = await library();
    const failingCodex = {
      translateTopicToSlug: async () => null,
    };

    expect(
      await allocateCourseId(root, "电动汽车电池", { codex: failingCodex }),
    ).toBe("dian-dong-qi-che-dian-chi");
  });

  it("falls back to 'course' if topic contains no alphanumeric characters", async () => {
    const root = await library();
    expect(await allocateCourseId(root, "??? !@#")).toBe("course");
  });

  it("rejects ids that could escape the courses directory", () => {
    expect(isCourseId("bayes-theorem")).toBe(true);
    expect(isCourseId("../outside")).toBe(false);
    expect(isCourseId("Course With Spaces")).toBe(false);
  });

  it("generates correct slugs across different inputs", async () => {
    expect(slug("EV Batteries 101!")).toBe("ev-batteries-101");
    expect(pinyinSlug("微积分入门")).toBe("wei-ji-fen-ru-men");
    expect(await generateCourseSlug("React 19 核心解析")).toBe("react-19-he-xin-jie-xi");
  });
});

