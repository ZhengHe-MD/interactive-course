import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CodexClient } from "../server/codex/CodexClient";
import { AgentControls } from "../src/components/AgentControls";
import { I18nProvider } from "../src/i18n";

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
  it.each(["en", "zh-CN"] as const)("does not advertise a stale model before discovery (%s)", (language) => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLanguage={language}>
        <AgentControls models={[]} value={null} onChange={() => {}} />
      </I18nProvider>,
    );

    expect(html).not.toContain("GPT-5.6");
    expect(html).not.toContain(">High<");
  });

  it("rediscovers paginated models without changing an existing selection", async () => {
    const client = new CodexClient("/tmp/course-studio-agent-config-test");
    let refreshed = false;
    const currentModel = {
      model: "gpt-6-astra",
      displayName: "GPT-6 Astra",
      description: "Newly available model",
      hidden: false,
      supportedReasoningEfforts: [
        { reasoningEffort: "medium", description: "Balanced" },
        { reasoningEffort: "ultra", description: "Deepest reasoning" },
      ],
      defaultReasoningEffort: "medium",
      isDefault: true,
    };
    Object.assign(client, {
      status: { state: "ready" },
      agentConfig: { model: "gpt-deep", effort: "xhigh" },
      peer: {
        request: async (_method: string, params: { cursor: string | null }) => {
          if (params.cursor === "next") {
            return { data: [currentModel, { ...currentModel, model: "hidden-model", hidden: true }], nextCursor: null };
          }
          return {
            data: [{ ...currentModel, model: "gpt-deep", isDefault: false }],
            nextCursor: refreshed ? "next" : null,
          };
        },
      },
    });

    expect((await client.listModels()).map((model) => model.model)).toEqual(["gpt-deep"]);
    refreshed = true;
    const available = await client.listModels();
    expect(available.map((model) => model.model)).toEqual(["gpt-deep", "gpt-6-astra"]);
    expect(available[1].supportedEfforts.map((option) => option.effort)).toEqual(["medium", "ultra"]);
    expect(client.getAgentConfig()).toEqual({ model: "gpt-deep", effort: "xhigh" });
  });

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

  it("offers Fast only for a model advertising that tier, with localized credit guidance", () => {
    const fastModel = { ...models[0], model: "gpt-6-astra", fastServiceTier: "priority" };
    const english = renderToStaticMarkup(
      <AgentControls models={[fastModel]} value={{ model: fastModel.model, effort: "medium", fastMode: true }} onChange={() => {}} />,
    );
    const chinese = renderToStaticMarkup(
      <I18nProvider initialLanguage="zh-CN">
        <AgentControls models={[fastModel]} value={{ model: fastModel.model, effort: "medium", fastMode: false }} onChange={() => {}} />
      </I18nProvider>,
    );
    const unavailable = renderToStaticMarkup(
      <AgentControls models={models} value={{ model: "gpt-deep", effort: "medium" }} onChange={() => {}} />,
    );

    expect(english).toContain('aria-label="Fast"');
    expect(english).toContain('aria-pressed="true"');
    expect(english).toContain("2.5×");
    expect(chinese).toContain('aria-label="快速"');
    expect(chinese).toContain('aria-pressed="false"');
    expect(chinese).toContain("2.5 倍");
    expect(unavailable).not.toContain('aria-label="Fast"');
  });

  it("sends Fast and Standard tiers only when selected for a supported model", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    let fastSupported = true;
    const client = new CodexClient("/tmp/course-studio-fast-mode-test");
    Object.assign(client, {
      status: { state: "ready" },
      threadId: "thread-1",
      peer: {
        request: async (method: string, params: Record<string, unknown>) => {
          requests.push({ method, params });
          if (method === "model/list") return {
            data: [{
              ...models[0],
              hidden: false,
              supportedReasoningEfforts: models[0].supportedEfforts.map((option) => ({
                reasoningEffort: option.effort, description: option.description,
              })),
              defaultReasoningEffort: models[0].defaultEffort,
              serviceTiers: fastSupported ? [{ id: "priority", name: "Fast", description: "Faster" }] : [],
            }],
            nextCursor: null,
          };
          if (method === "turn/start") return { turn: { id: "turn-1", status: "inProgress" } };
          throw new Error(`Unexpected request: ${method}`);
        },
      },
    });

    await client.startTurn("Explain this.", [], { agent: { model: "gpt-deep", effort: "medium", fastMode: true } });
    await client.startTurn("Explain more.", [], { agent: { model: "gpt-deep", effort: "medium", fastMode: false } });
    const turns = requests.filter((request) => request.method === "turn/start");
    expect(turns.map((request) => request.params.serviceTierForTurn)).toEqual(["priority", "default"]);
    fastSupported = false;
    await expect(client.startTurn("Explain this.", [], {
      agent: { model: "gpt-deep", effort: "medium", fastMode: true },
    })).rejects.toThrow("Fast mode is not available");
    expect(requests.filter((request) => request.method === "turn/start")).toHaveLength(2);
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
