import { describe, expect, it } from "vitest";
import { describeStartupError } from "../server/codex/CodexClient";
import { CodexClient } from "../server/codex/CodexClient";
import type { Activity } from "../shared/protocol";

function notify(client: CodexClient, method: string, params: unknown) {
  (client as unknown as { handleNotification: (method: string, params: unknown) => void })
    .handleNotification(method, params);
}

describe("describeStartupError", () => {
  it("turns a missing Codex executable into actionable setup steps", () => {
    const error = Object.assign(new Error("spawn codex ENOENT"), { code: "ENOENT" });

    expect(describeStartupError(error)).toBe([
      "Codex CLI was not found.",
      "Open Terminal and install it:",
      "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
      "Then sign in:",
      "codex login",
      "Finally, stop and restart Course Studio with `npm run dev`.",
      "If Codex is already installed, set CODEX_BIN to its full path before starting the studio.",
    ].join("\n"));
  });

  it("preserves startup errors that need diagnosis", () => {
    expect(describeStartupError(new Error("Codex app-server rejected initialization")))
      .toBe("Codex app-server rejected initialization");
  });
});

describe("Codex activity streaming", () => {
  it("streams display-safe reasoning summaries without consuming raw reasoning text", () => {
    const client = new CodexClient("/tmp/course-studio-test");
    const activities: Activity[] = [];
    client.on("activity", ({ activity }) => activities.push(activity));

    notify(client, "item/reasoning/summaryTextDelta", {
      turnId: "turn-1",
      itemId: "reason-1",
      summaryIndex: 0,
      delta: "Inspecting the current lesson",
    });
    notify(client, "item/reasoning/summaryTextDelta", {
      turnId: "turn-1",
      itemId: "reason-1",
      summaryIndex: 0,
      delta: " and its interaction.",
    });
    notify(client, "item/reasoning/textDelta", {
      turnId: "turn-1",
      itemId: "reason-1",
      contentIndex: 0,
      delta: "private model reasoning",
    });

    expect(activities).toHaveLength(2);
    expect(activities.at(-1)).toMatchObject({
      id: "reason-1",
      kind: "reasoning",
      label: "Thinking",
      detail: "Inspecting the current lesson and its interaction.",
    });
  });

  it("surfaces plans and named tool calls with useful metadata", () => {
    const client = new CodexClient("/tmp/course-studio-test");
    const activities: Activity[] = [];
    client.on("activity", ({ activity }) => activities.push(activity));

    notify(client, "turn/plan/updated", {
      turnId: "turn-2",
      plan: [
        { step: "Inspect the lesson", status: "completed" },
        { step: "Build the interaction", status: "inProgress" },
      ],
    });
    notify(client, "item/started", {
      turnId: "turn-2",
      item: { id: "tool-1", type: "mcpToolCall", server: "browser", tool: "take_screenshot" },
    });
    notify(client, "item/mcpToolCall/progress", {
      turnId: "turn-2",
      itemId: "tool-1",
      message: "Capturing the updated lesson",
    });

    expect(activities[0]).toMatchObject({
      kind: "plan",
      label: "Planning · 1/2",
      detail: "Build the interaction",
    });
    expect(activities.at(-1)).toMatchObject({
      kind: "tool",
      label: "Using Take screenshot",
      detail: "Capturing the updated lesson",
    });
  });
});
