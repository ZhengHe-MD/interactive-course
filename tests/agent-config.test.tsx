import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CodexClient } from "../server/codex/CodexClient";
import { AgentControls } from "../src/components/AgentControls";

const models = [{
  model: "gpt-deep",
  displayName: "Deep model",
  description: "Best for difficult course design work.",
  supportedEfforts: [
    { effort: "medium", description: "Balanced speed and depth." },
    { effort: "xhigh", description: "More time for difficult work." },
  ],
  defaultEffort: "medium",
  isDefault: true,
}, {
  model: "gpt-quick",
  displayName: "Quick model",
  description: "Best for focused changes.",
  supportedEfforts: [{ effort: "low", description: "Fast responses." }],
  defaultEffort: "low",
  isDefault: false,
}];

describe("agent configuration", () => {
  it("renders the selected model and only its supported thinking efforts", () => {
    const html = renderToStaticMarkup(
      <AgentControls
        models={models}
        value={{ model: "gpt-deep", effort: "xhigh" }}
        onChange={() => {}}
      />,
    );

    expect(html).toContain('aria-label="Model"');
    expect(html).toContain("Deep model");
    expect(html).toContain("Quick model");
    expect(html).toContain('aria-label="Thinking effort"');
    expect(html).toContain("Medium");
    expect(html).toContain("Extra high");
    expect(html).not.toContain("Fast responses.");
  });

  it("uses the account catalog and forwards model and effort to app-server", async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const client = new CodexClient("/tmp/course-studio-agent-config-test");

    Object.assign(client, {
      status: { state: "ready" },
      threadId: "thread-1",
      peer: {
        request: async (method: string, params: unknown) => {
          requests.push({ method, params });
          if (method === "model/list") {
            return {
              data: models.map((model) => ({
                ...model,
                hidden: false,
                supportedReasoningEfforts: model.supportedEfforts.map((effort) => ({
                  reasoningEffort: effort.effort,
                  description: effort.description,
                })),
                defaultReasoningEffort: model.defaultEffort,
              })),
              nextCursor: null,
            };
          }
          if (method === "turn/start") return { turn: { id: "turn-1", status: "inProgress" } };
          throw new Error(`Unexpected request: ${method}`);
        },
      },
    });

    await client.startTurn("Make this explanation more visual.", [], {
      agent: { model: "gpt-deep", effort: "xhigh" },
    });

    expect(requests[0]).toMatchObject({
      method: "model/list",
      params: { includeHidden: false, limit: 100 },
    });
    expect(requests[1]).toMatchObject({
      method: "turn/start",
      params: { threadId: "thread-1", model: "gpt-deep", effort: "xhigh" },
    });
    expect(client.getAgentConfig()).toEqual({ model: "gpt-deep", effort: "xhigh" });
  });
});
