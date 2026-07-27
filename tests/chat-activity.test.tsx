import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Chat } from "../src/components/Chat";

describe("chat activity timeline", () => {
  it("shows live Codex metadata instead of an anonymous typing indicator", () => {
    const html = renderToStaticMarkup(
      <Chat
        codex={{ state: "ready" }}
        statusText="Agent is working"
        connected
        working
        items={[{
          kind: "agent",
          id: "agent-1",
          text: "",
          activities: [{
            id: "reason-1",
            kind: "reasoning",
            label: "Thinking",
            detail: "Comparing the explanation with the learner's selection.",
          }],
        }]}
        open
        selections={[]}
        onToggleOpen={() => {}}
        onExpandSelection={() => {}}
        onRemoveSelection={() => {}}
        onSend={() => {}}
        onInterrupt={() => {}}
        placeholder="Ask"
      />,
    );

    expect(html).toContain('aria-label="Agent activity"');
    expect(html).toContain("Thinking");
    expect(html).toContain("Comparing the explanation");
    expect(html).toContain('aria-label="In progress"');
    expect(html).not.toContain('class="typing"');
  });
});
