import { describe, expect, it } from "vitest";
import type { Activity } from "../shared/protocol";
import { mergeTurnActivity } from "../src/ws";

describe("turn activity gaps", () => {
  it("keeps Working live when the preflight row finishes before Codex emits an item", () => {
    const current: Activity[] = [
      { id: "turn-working", kind: "reasoning", label: "Working" },
    ];

    const activities = mergeTurnActivity(current, {
      id: "prepare",
      kind: "reasoning",
      label: "Reading your course context…",
      done: true,
    }, false);

    expect(activities).toEqual([
      { id: "turn-working", kind: "reasoning", label: "Working" },
      {
        id: "prepare",
        kind: "reasoning",
        label: "Reading your course context…",
        done: true,
      },
    ]);
  });

  it("restores Working between completed Codex items, then replaces it with the next item", () => {
    const afterCommand = mergeTurnActivity([], {
      id: "command-1",
      kind: "command",
      label: "Ran a command",
      done: true,
    }, false);

    expect(afterCommand.at(-1)).toMatchObject({ id: "turn-working" });
    expect(afterCommand.at(-1)).not.toHaveProperty("done");

    const whileEditing = mergeTurnActivity(afterCommand, {
      id: "edit-1",
      kind: "edit",
      label: "Editing the course",
    }, false);

    expect(whileEditing.some((activity) => activity.id === "turn-working")).toBe(false);
    expect(whileEditing.at(-1)).toMatchObject({ id: "edit-1" });
    expect(whileEditing.at(-1)).not.toHaveProperty("done");
  });
});
