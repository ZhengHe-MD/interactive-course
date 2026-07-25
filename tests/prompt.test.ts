import { describe, it, expect } from "vitest";
import { buildTurnText, checkpointLabel } from "../server/course/prompt.ts";
import type { Selection } from "../shared/protocol.ts";

const selection: Selection = {
  tag: "figure",
  text: "A positive test really means 9.2%",
  snippet: '<figure id="sec-sim">…</figure>',
  locationHint: 'figure#sec-sim  (near text: "A positive test")',
  screenshot: "data:image/png;base64,AAAA",
};

describe("buildTurnText", () => {
  it("passes a plain message through untouched", () => {
    expect(buildTurnText("make the intro shorter")).toBe("make the intro shorter");
  });

  it("appends the selected element and its location", () => {
    const text = buildTurnText("this is confusing", selection);
    expect(text).toContain("this is confusing");
    expect(text).toContain("Location: figure#sec-sim");
    expect(text).toContain("<figure id=\"sec-sim\">");
    expect(text).toContain("screenshot");
  });

  it("still frames the selection when the message is empty", () => {
    const text = buildTurnText("", selection);
    expect(text).toContain("Selected element");
    expect(text.startsWith("\n")).toBe(false);
  });
});

describe("checkpointLabel", () => {
  it("uses the message, trimmed and collapsed", () => {
    expect(checkpointLabel("  add   a diagram ")).toBe("add a diagram");
  });

  it("truncates long messages", () => {
    const label = checkpointLabel("x".repeat(100));
    expect(label.length).toBeLessThanOrEqual(48);
    expect(label.endsWith("…")).toBe(true);
  });

  it("falls back to the selected tag when there is no message", () => {
    expect(checkpointLabel("", selection)).toBe("Edit figure");
  });
});
