// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { I18nProvider } from "../src/i18n";

const mockStudio = vi.hoisted(() => ({
  state: null as unknown,
  actions: new Proxy({}, { get: () => () => undefined }),
}));
vi.mock("../src/ws", () => ({ useStudio: () => mockStudio }));
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
});

describe("unfinished course resume", () => {
  it("opens a saved Course Brief from the shelf even without chat history or HTML", async () => {
    window.history.replaceState(null, "", "/");
    const course = {
      phase: "empty", hasContent: false, title: "Computers", topic: "Computers", pages: [], sections: [], upNext: [],
    };
    mockStudio.state = {
      connected: true, codex: { state: "ready" }, models: [], agentConfig: null, checkpoints: [],
      courseId: "current", courses: [{ id: "computers", title: "Computers", phase: "discovery", hasContent: false }],
      conversationId: null, conversations: [], course, courseVersion: 1, courseChanged: false,
      items: [], working: false, switchingCourseId: null, pendingId: null, turnMessages: {},
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<I18nProvider initialLanguage="en"><App /></I18nProvider>));
      expect(container.querySelector(".welcome-shelf-card")).not.toBeNull();
      await act(async () => (container.querySelector(".welcome-shelf-card") as HTMLButtonElement).click());
      mockStudio.state = {
        ...mockStudio.state as Record<string, unknown>,
        courseId: "computers",
        course: {
          ...course,
          phase: "discovery",
          brief: {
            markdown: "# Course Brief\n\n## Direction\nUnderstand computers\n<!-- course-studio-recommended-preset: guided-inquiry -->",
            revision: "saved", recommendedPreset: "guided-inquiry", selectedPreset: "guided-inquiry", answerCount: 1,
          },
        },
      };
      await act(async () => root.render(<I18nProvider initialLanguage="en"><App /></I18nProvider>));
      expect(container.querySelector(".course-brief-panel")?.textContent).toContain("Understand computers");
      expect(container.querySelector(".welcome-page-container")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
