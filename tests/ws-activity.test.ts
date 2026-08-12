import { describe, expect, it } from "vitest";
import type { Activity } from "../shared/protocol";
import { initialState, mergeTurnActivity, reducer } from "../src/ws";

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

describe("turn steering in ws reducer", () => {
  it("appends new user and agent messages and redirects live deltas when sending a steer message while working", () => {
    const state0 = reducer(initialState, {
      type: "send",
      id: "user-msg-1",
      agentId: "agent-msg-1",
      text: "Initial prompt",
      selections: [],
    });

    expect(state0.working).toBe(true);
    expect(state0.pendingId).toBe("agent-msg-1");
    expect(state0.items).toHaveLength(2);

    const state1 = reducer(state0, {
      type: "server",
      message: { type: "turn.accepted", turnId: "turn-1" },
    });
    expect(state1.turnMessages["turn-1"]).toBe("agent-msg-1");

    const state2 = reducer(state1, {
      type: "server",
      message: { type: "agent.delta", turnId: "turn-1", delta: "Working on it... " },
    });
    expect(state2.items[1]).toMatchObject({ kind: "agent", id: "agent-msg-1", text: "Working on it... " });

    // Learner sends a steering message while the turn is active:
    const state3 = reducer(state2, {
      type: "send",
      id: "user-msg-2",
      agentId: "agent-msg-2",
      text: "Actually, change direction",
      selections: [],
    });

    expect(state3.working).toBe(true);
    expect(state3.pendingId).toBe("agent-msg-2");
    expect(state3.turnMessages["turn-1"]).toBe("agent-msg-2");
    expect(state3.items).toHaveLength(4);
    expect(state3.items[2]).toMatchObject({ kind: "user", id: "user-msg-2", text: "Actually, change direction" });
    expect(state3.items[3]).toMatchObject({ kind: "agent", id: "agent-msg-2", text: "" });

    // Subsequent deltas now stream to the steered agent message container:
    const state4 = reducer(state3, {
      type: "server",
      message: { type: "agent.delta", turnId: "turn-1", delta: "Understood, changing direction now." },
    });

    expect(state4.items[1]).toMatchObject({ kind: "agent", id: "agent-msg-1", text: "Working on it... " });
    expect(state4.items[3]).toMatchObject({ kind: "agent", id: "agent-msg-2", text: "Understood, changing direction now." });

    // Turn completes:
    const state5 = reducer(state4, {
      type: "server",
      message: { type: "turn.completed", turnId: "turn-1", status: "completed" },
    });

    expect(state5.working).toBe(false);
    expect(state5.pendingId).toBe(null);
  });

  it("removes empty intermediate agent placeholders when steering before output begins", () => {
    const state0 = reducer(initialState, {
      type: "send",
      id: "user-1",
      agentId: "agent-1",
      text: "hi",
      selections: [],
    });

    // Agent is working but hasn't output text yet:
    const state1 = reducer(state0, {
      type: "server",
      message: {
        type: "activity",
        turnId: "turn-1",
        activity: { id: "prepare", kind: "reasoning", label: "Reading your course context…", done: true },
      },
    });
    expect(state1.items).toHaveLength(2);

    // Learner steers immediately before any text was generated:
    const state2 = reducer(state1, {
      type: "send",
      id: "user-2",
      agentId: "agent-2",
      text: "trying to steer",
      selections: [],
    });

    // The empty agent placeholder is dropped, resulting in [user-1, user-2, agent-2]:
    expect(state2.items).toHaveLength(3);
    expect(state2.items[0]).toMatchObject({ kind: "user", id: "user-1", text: "hi" });
    expect(state2.items[1]).toMatchObject({ kind: "user", id: "user-2", text: "trying to steer" });
    expect(state2.items[2]).toMatchObject({ kind: "agent", id: "agent-2", text: "" });
  });

  it("cleans up transient spinners and marks all activities completed across multiple steered segments", () => {
    const state0 = reducer(initialState, {
      type: "send",
      id: "user-1",
      agentId: "agent-1",
      text: "Step 1",
      selections: [],
    });

    const state1 = reducer(state0, {
      type: "server",
      message: { type: "turn.accepted", turnId: "turn-1" },
    });

    const state2 = reducer(state1, {
      type: "server",
      message: {
        type: "activity",
        turnId: "turn-1",
        activity: { id: "reason-1", kind: "reasoning", label: "Thinking", detail: "Planning" },
      },
    });

    const state3 = reducer(state2, {
      type: "server",
      message: { type: "agent.delta", turnId: "turn-1", delta: "Initial response" },
    });

    // Learner steers after text arrived:
    const state4 = reducer(state3, {
      type: "send",
      id: "user-2",
      agentId: "agent-2",
      text: "Step 2",
      selections: [],
    });

    // Previous agent-1 activities must have no live spinners and be marked done:
    const agent1 = state4.items.find((item) => item.id === "agent-1") as Extract<typeof state4.items[0], { kind: "agent" }>;
    expect(agent1).toBeDefined();
    expect(agent1.activities.some((a) => a.id === "turn-working" || a.id === "turn-starting")).toBe(false);
    expect(agent1.activities.every((a) => a.done)).toBe(true);
    expect(agent1.activities.find((a) => a.id === "reason-1")?.label).toBe("Thought through the request");

    // Complete the turn:
    const state5 = reducer(state4, {
      type: "server",
      message: { type: "turn.completed", turnId: "turn-1", status: "completed" },
    });

    // All agent items in the conversation must have finalized activities with no live spinners:
    for (const item of state5.items) {
      if (item.kind === "agent") {
        expect(item.activities.some((a) => a.id === "turn-working" || a.id === "turn-starting")).toBe(false);
        expect(item.activities.every((a) => a.done)).toBe(true);
      }
    }
  });

  it("manages switchingCourseId lifecycle across course.switching, course.opened, and error", () => {
    const switchingState = reducer(initialState, {
      type: "course.switching",
      courseId: "ev-batteries",
    });
    expect(switchingState.switchingCourseId).toBe("ev-batteries");

    const openedState = reducer(switchingState, {
      type: "server",
      message: {
        type: "course.opened",
        courseId: "ev-batteries",
        courses: [{ id: "ev-batteries", title: "EV Batteries", phase: "learning", hasContent: true }],
        course: {
          phase: "learning",
          hasContent: true,
          title: "EV Batteries",
          topic: "Batteries",
          pages: [],
          sections: [],
          upNext: [],
        },
        courseVersion: 12345,
        checkpoints: [],
        codex: { state: "ready" },
        conversationId: "c-1",
        conversations: [],
        items: [],
        models: [],
        agentConfig: null,
      },
    });
    expect(openedState.switchingCourseId).toBe(null);
    expect(openedState.courseId).toBe("ev-batteries");

    // Test error clearing switchingCourseId
    const switchingAgain = reducer(openedState, {
      type: "course.switching",
      courseId: "missing-course",
    });
    expect(switchingAgain.switchingCourseId).toBe("missing-course");

    const errorState = reducer(switchingAgain, {
      type: "server",
      message: {
        type: "error",
        message: "That course no longer exists.",
      },
    });
    expect(errorState.switchingCourseId).toBe(null);
  });
});

