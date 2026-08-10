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

    window.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(messages).toContainEqual(expect.objectContaining({
      source: "course-studio-preview",
      type: "selection.cleared",
    }));
  });

  it("clears block selection in select mode when clicking background or toggling", async () => {
    document.body.innerHTML = '<main><h2 id="intro">Intro</h2><p>Hello world</p></main>';
    const messages: unknown[] = [];
    vi.spyOn(window, "postMessage").mockImplementation((message: unknown) => { messages.push(message); });

    (window as unknown as { CSS?: { escape: (s: string) => string } }).CSS = { escape: (s: string) => s };
    const bridge = await readFile(join(process.cwd(), "server/assets/preview-bridge.js"), "utf8");
    window.eval(bridge);

    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      data: { source: "course-studio", type: "inspect", active: true },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const heading = document.querySelector("h2")!;
    heading.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(messages).toContainEqual(expect.objectContaining({
      source: "course-studio-preview",
      type: "selection",
      selection: expect.objectContaining({
        kind: "block",
        tag: "h2",
      }),
    }));

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(messages).toContainEqual(expect.objectContaining({
      source: "course-studio-preview",
      type: "selection.cleared",
    }));
  });
});
