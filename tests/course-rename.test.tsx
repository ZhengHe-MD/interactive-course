// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Toolbar } from "../src/components/Toolbar";

const courses = [{ id: "cpu", title: "From Silicon to a Simple CPU", phase: "learning" as const, hasContent: true }];

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(props: Partial<Parameters<typeof Toolbar>[0]> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Toolbar
        courseTitle="From Silicon to a Simple CPU"
        courseId="cpu"
        courses={courses}
        inspecting={false}
        multipleSelection={false}
        canInspect
        canRename
        courseChanged={false}
        checkpoints={[]}
        working={false}
        exporting={false}
        onHome={() => {}}
        onSwitchCourse={() => {}}
        onRenameCourse={() => {}}
        onToggleInspect={() => {}}
        onToggleMultipleSelection={() => {}}
        onRevert={() => {}}
        onExport={() => {}}
        {...props}
      />,
    );
  });
  return container;
}

describe("renaming a course from the toolbar", () => {
  it("opens the field on a double-click and commits the new title", async () => {
    const renamed: string[] = [];
    const container = await mount({ onRenameCourse: (title) => renamed.push(title) });

    const pill = container.querySelector(".course-switcher-btn") as HTMLButtonElement;
    expect(pill.getAttribute("title")).toBe("Switch course — double-click to rename");
    await act(async () => {
      pill.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    const input = container.querySelector(".course-rename-input") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe("From Silicon to a Simple CPU");
    expect(document.activeElement).toBe(input);

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "How a CPU actually works");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      (container.querySelector(".course-rename-form") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(renamed).toEqual(["How a CPU actually works"]);
    expect(container.querySelector(".course-rename-input")).toBeNull();
    expect(container.querySelector(".course-switcher-title")?.textContent).toBe("From Silicon to a Simple CPU");

    // Escape abandons the edit without renaming.
    await act(async () => {
      (container.querySelector(".course-switcher-btn") as HTMLButtonElement)
        .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const second = container.querySelector(".course-rename-input") as HTMLInputElement;
    await act(async () => {
      second.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector(".course-rename-input")).toBeNull();
    expect(renamed).toEqual(["How a CPU actually works"]);
  });

  it("offers rename in the course menu, and withholds it before the course exists", async () => {
    const container = await mount();
    const openMenu = async (element: Element) => {
      await act(async () => {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    };

    await openMenu(container.querySelector(".course-switcher-btn")!);
    const rename = [...container.querySelectorAll(".course-menu-new-btn")]
      .find((button) => button.textContent?.includes("Rename this course")) as HTMLButtonElement;
    expect(rename.disabled).toBe(false);
    await openMenu(rename);
    expect(container.querySelector(".course-rename-input")).toBeTruthy();

    const unborn = await mount({ canInspect: false, canRename: false });
    await openMenu(unborn.querySelector(".course-switcher-btn")!);
    const disabled = [...unborn.querySelectorAll(".course-menu-new-btn")]
      .find((button) => button.textContent?.includes("Rename this course")) as HTMLButtonElement;
    expect(disabled.disabled).toBe(true);
    await openMenu(disabled);
    expect(unborn.querySelector(".course-rename-input")).toBeNull();
  });
});
