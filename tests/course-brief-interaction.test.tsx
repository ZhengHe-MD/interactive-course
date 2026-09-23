// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseBriefPanel } from "../src/components/CourseBriefPanel";
import { I18nProvider } from "../src/i18n";
import type { CourseBrief, CoursePhase } from "../shared/protocol";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

const brief: CourseBrief = {
  markdown: "<!-- course-studio-recommended-preset: guided-inquiry -->\n# Course Brief\n\n## Direction\nUnderstand computers\n\n## Open assumptions\nPrior coding experience is unclear.",
  revision: "first-revision",
  recommendedPreset: "guided-inquiry",
  selectedPreset: "guided-inquiry",
  answerCount: 3,
};

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

describe("Course Brief review", () => {
  it("shows the evolving brief, permits continued discovery, and approves the current preset", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const onReview = vi.fn();
    const onExplore = vi.fn();
    const onPreset = vi.fn();
    const onApprove = vi.fn();
    const render = async (phase: CoursePhase, current: CourseBrief) => act(async () => root.render(
      <I18nProvider initialLanguage="en">
        <CourseBriefPanel
          brief={current}
          phase={phase}
          working={false}
          connected
          onReview={onReview}
          onExplore={onExplore}
          onPreset={onPreset}
          onApprove={onApprove}
        />
      </I18nProvider>,
    ));

    await render("discovery", brief);
    expect(container.textContent).toContain("Understand computers");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.textContent).toContain("Prior coding experience is unclear");
    expect(container.textContent).toContain("Ready to review, or keep exploring in chat.");
    expect(container.querySelector('input[value="guided-inquiry"]:checked')).not.toBeNull();
    expect(container.textContent).not.toContain("course-studio-recommended-preset");
    expect(container.textContent).not.toContain("Approve brief & create syllabus");

    await act(async () => (container.querySelector(".course-brief-actions button") as HTMLButtonElement).click());
    expect(onReview).toHaveBeenCalledOnce();
    expect(onApprove).not.toHaveBeenCalled();

    await render("brief-review", brief);
    await act(async () => (container.querySelector('input[value="worked-examples"]') as HTMLInputElement).click());
    expect(onPreset).toHaveBeenCalledWith("worked-examples");
    await render("brief-review", { ...brief, selectedPreset: "worked-examples", revision: "selected-revision" });
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(".course-brief-actions button")];
    await act(async () => buttons[0].click());
    expect(onExplore).toHaveBeenCalledOnce();
    await act(async () => buttons[1].click());
    expect(onApprove).toHaveBeenCalledWith("selected-revision");
  });

  it("renders Chinese controls while preserving the authored brief", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(
      <I18nProvider initialLanguage="zh-CN">
        <CourseBriefPanel brief={brief} phase="brief-review" working={false} connected onReview={() => {}} onExplore={() => {}} onPreset={() => {}} onApprove={() => {}} />
      </I18nProvider>,
    ));
    expect(container.textContent).toContain("课程简述");
    expect(container.textContent).toContain("批准简述并生成大纲");
    expect(container.textContent).toContain("Understand computers");
  });
});
