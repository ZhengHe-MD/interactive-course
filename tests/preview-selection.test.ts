// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("preview selection bridge", () => {
  it("attaches an ordinary text highlight as quoted context", async () => {
    document.body.innerHTML = '<main><h2 id="energy">Energy and power</h2><p>Energy is not the same as power.</p></main>';
    const messages: unknown[] = [];
    vi.spyOn(window, "postMessage").mockImplementation((message: unknown) => { messages.push(message); });

    const bridge = await readFile(join(process.cwd(), "server/assets/preview-bridge.js"), "utf8");
    window.eval(bridge);

    expect(messages).toContainEqual(expect.objectContaining({
      source: "course-studio-preview",
      type: "ready",
      section: { id: "energy", index: 0, label: "Energy and power" },
    }));

    const paragraph = document.querySelector("p")!;
    const range = document.createRange();
    range.setStart(paragraph.firstChild!, 0);
    range.setEnd(paragraph.firstChild!, 20);
    window.getSelection()!.addRange(range);
    paragraph.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(messages).toContainEqual(expect.objectContaining({
      source: "course-studio-preview",
      type: "selection",
      selection: expect.objectContaining({
        kind: "text",
        tag: "p",
        text: "Energy is not the sa",
      }),
    }));
  });
});
