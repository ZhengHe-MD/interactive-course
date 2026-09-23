// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentControls } from "../src/components/AgentControls";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const models = ["astra", "sol"].map((name) => ({
  model: `gpt-6-${name}`,
  displayName: name,
  description: "",
  supportedEfforts: [{ effort: "medium", description: "" }, { effort: "high", description: "" }],
  defaultEffort: "medium",
  fastServiceTier: "priority",
  isDefault: name === "astra",
}));

let root: Root;
let container: HTMLDivElement;

async function mount() {
  container = document.createElement("div");
  container.style.overflowY = "hidden";
  document.body.append(container);
  root = createRoot(container);
  const onChange = vi.fn();
  await act(async () => root.render(
    <AgentControls models={models} value={{ model: "gpt-6-astra", effort: "medium", fastMode: true }} onChange={onChange} />,
  ));
  return onChange;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe("agent controls", () => {
  it.each([0, 1])("keeps menu %i within its clipping parent and recalculates on resize", async (index) => {
    await mount();
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({ top: 60, bottom: 450 } as DOMRect);
    const wrapper = container.querySelectorAll<HTMLDivElement>(".custom-dropdown-wrapper")[index];
    const bounds = { top: 330, bottom: 354 };
    vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => bounds as DOMRect);
    await act(async () => wrapper.querySelector("button")!.click());
    const menu = wrapper.querySelector<HTMLDivElement>('[role="menu"]')!;
    expect(Number.parseFloat(menu.style.maxHeight)).toBeLessThan(bounds.top - 60);
    expect(menu.classList.contains("open-down")).toBe(false);

    bounds.top = 85;
    bounds.bottom = 109;
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(menu.classList.contains("open-down")).toBe(true);
    expect(Number.parseFloat(menu.style.maxHeight)).toBeLessThan(450 - bounds.bottom);
  });

  it("toggles Fast independently and preserves it when thinking effort changes", async () => {
    const onChange = await mount();
    const fast = container.querySelector<HTMLButtonElement>('[aria-label="Fast"]')!;
    await act(async () => fast.click());
    expect(onChange).toHaveBeenLastCalledWith({ model: "gpt-6-astra", effort: "medium", fastMode: false });

    const effort = container.querySelectorAll<HTMLDivElement>(".custom-dropdown-wrapper")[1];
    await act(async () => effort.querySelector("button")!.click());
    await act(async () => effort.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[1].click());
    expect(onChange).toHaveBeenLastCalledWith({ model: "gpt-6-astra", effort: "high", fastMode: true });
  });
});
