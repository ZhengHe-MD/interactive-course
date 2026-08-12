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

  it("supports selecting multiple elements sequentially when multiple mode is active", async () => {
    document.body.innerHTML = '<main><h2 id="intro">Intro</h2><p id="para">Paragraph text</p></main>';
    const messages: unknown[] = [];
    vi.spyOn(window, "postMessage").mockImplementation((message: unknown) => { messages.push(message); });

    (window as unknown as { CSS?: { escape: (s: string) => string } }).CSS = { escape: (s: string) => s };
    const bridge = await readFile(join(process.cwd(), "server/assets/preview-bridge.js"), "utf8");
    window.eval(bridge);

    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      data: { source: "course-studio", type: "inspect", active: true, multiple: true },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const heading = document.querySelector("h2")!;
    heading.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Simulate native selection collapse when clicking second element
    document.dispatchEvent(new Event("selectionchange"));

    const paragraph = document.querySelector("p")!;
    paragraph.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const selectionMessages = messages.filter((m: any) => m.type === "selection");
    const clearedMessages = messages.filter((m: any) => m.type === "selection.cleared");

    expect(selectionMessages.length).toBe(2);
    expect(selectionMessages[0]).toEqual(expect.objectContaining({
      source: "course-studio-preview",
      type: "selection",
      selection: expect.objectContaining({ kind: "block", tag: "h2" }),
    }));
    expect(selectionMessages[1]).toEqual(expect.objectContaining({
      source: "course-studio-preview",
      type: "selection",
      selection: expect.objectContaining({ kind: "block", tag: "p" }),
    }));
    expect(clearedMessages.length).toBe(0);

    // Persistent bounding boxes should be rendered for both selections
    const overlays = document.querySelectorAll("[data-course-studio-ui][data-selection-id]");
    expect(overlays.length).toBeGreaterThanOrEqual(2);
  });

  it("deactivates an already selected element when clicked again in multiple mode", async () => {
    document.body.innerHTML = '<main><h2 id="intro">Intro</h2><p id="para">Paragraph text</p></main>';
    const messages: unknown[] = [];
    vi.spyOn(window, "postMessage").mockImplementation((message: unknown) => { messages.push(message); });

    (window as unknown as { CSS?: { escape: (s: string) => string } }).CSS = { escape: (s: string) => s };
    const bridge = await readFile(join(process.cwd(), "server/assets/preview-bridge.js"), "utf8");
    window.eval(bridge);

    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      data: { source: "course-studio", type: "inspect", active: true, multiple: true },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const heading = document.querySelector("h2")!;
    heading.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const paragraph = document.querySelector("p")!;
    paragraph.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const headingSelectionMsg = messages.find((m: any) => m.type === "selection" && m.selection.tag === "h2") as any;
    const headingId = headingSelectionMsg.selection.id;

    // Click heading again to deactivate it
    heading.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(messages).toContainEqual(expect.objectContaining({
      source: "course-studio-preview",
      type: "selection.removed",
      id: headingId,
    }));

    // Bounding box for heading should be removed, while paragraph bounding box remains
    const headingBoxes = document.querySelectorAll(`[data-selection-id="${headingId}"]`);
    expect(headingBoxes.length).toBe(0);
  });
});
