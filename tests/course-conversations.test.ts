import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendStoredTurn,
  curateStoredTurn,
  mergeConversationSummaries,
  readStoredConversations,
  storedConversationToTranscriptItems,
} from "../server/course/conversations";
import type { ConversationSummary, TranscriptItem } from "../shared/protocol";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("course conversations persistence", () => {
  it("reads empty conversations data when conversations.json does not exist", async () => {
    const directory = await mkdtemp(join(tmpdir(), "course-conv-test-"));
    temporaryDirectories.push(directory);

    const data = await readStoredConversations(directory);
    expect(data).toEqual({ version: 1, conversations: [] });
  });

  it("appends a turn to a new or existing conversation on disk", async () => {
    const directory = await mkdtemp(join(tmpdir(), "course-conv-test-"));
    temporaryDirectories.push(directory);

    await appendStoredTurn(directory, {
      conversationId: "conv-1",
      title: "Silicon Physics Basics",
      turn: {
        id: "turn-1",
        prompt: "How does a MOSFET work?",
        response: "A MOSFET is a field-effect transistor...",
        reasoning: ["Explain gate oxide electric field", "Model channel inversion"],
        createdAt: "2026-08-10T20:00:00.000Z",
      },
    });

    const data = await readStoredConversations(directory);
    expect(data.conversations).toHaveLength(1);
    expect(data.conversations[0].id).toBe("conv-1");
    expect(data.conversations[0].title).toBe("Silicon Physics Basics");
    expect(data.conversations[0].turns).toHaveLength(1);
    expect(data.conversations[0].turns[0].prompt).toBe("How does a MOSFET work?");
    expect(data.conversations[0].turns[0].reasoning).toEqual([
      "Explain gate oxide electric field",
      "Model channel inversion",
    ]);

    // Append second turn to same conversation
    await appendStoredTurn(directory, {
      conversationId: "conv-1",
      title: "Silicon Physics Basics",
      turn: {
        id: "turn-2",
        prompt: "What about CMOS inverter?",
        response: "CMOS pairs NMOS with PMOS...",
        reasoning: ["Show pull-up PMOS and pull-down NMOS"],
        createdAt: "2026-08-10T20:05:00.000Z",
      },
    });

    const updated = await readStoredConversations(directory);
    expect(updated.conversations[0].turns).toHaveLength(2);
    expect(updated.conversations[0].turns[1].prompt).toBe("What about CMOS inverter?");
  });

  it("curates transcript items into a clean stored turn with reasoning", () => {
    const items: TranscriptItem[] = [
      {
        kind: "user",
        id: "item-1",
        text: "Explain NAND gate logic",
        selections: [{ kind: "text", tag: "p", text: "NAND logic" }],
      },
      {
        kind: "agent",
        id: "item-2",
        text: "Here is the interactive NAND simulator...",
        activities: [
          { id: "act-1", kind: "reasoning", label: "Thinking", detail: "Formulate boolean truth table" },
          { id: "act-2", kind: "edit", label: "Editing session1.html" },
          { id: "act-3", kind: "reasoning", label: "Thinking", detail: "Check voltage thresholds" },
        ],
      },
    ];

    const curated = curateStoredTurn({
      turnId: "turn-100",
      items,
      createdAt: "2026-08-10T20:10:00.000Z",
      page: "session1.html",
    });

    expect(curated.id).toBe("turn-100");
    expect(curated.prompt).toBe("Explain NAND gate logic");
    expect(curated.response).toBe("Here is the interactive NAND simulator...");
    expect(curated.reasoning).toEqual(["Formulate boolean truth table", "Check voltage thresholds"]);
    expect(curated.page).toBe("session1.html");
  });

  it("merges active Codex conversations with disk-stored conversations, marking non-local ones as read-only", () => {
    const activeCodexSummaries: ConversationSummary[] = [
      { id: "conv-local", title: "Active local chat", createdAt: "2026-08-10T20:00:00Z", updatedAt: "2026-08-10T20:00:00Z" },
    ];

    const storedData = {
      version: 1 as const,
      conversations: [
        {
          id: "conv-local",
          title: "Active local chat",
          createdAt: "2026-08-10T20:00:00Z",
          updatedAt: "2026-08-10T20:00:00Z",
          turns: [],
        },
        {
          id: "conv-imported",
          title: "Imported historical chat",
          createdAt: "2026-08-01T10:00:00Z",
          updatedAt: "2026-08-01T10:00:00Z",
          turns: [],
        },
      ],
    };

    const merged = mergeConversationSummaries(activeCodexSummaries, storedData);
    expect(merged).toHaveLength(2);
    expect(merged.find((c) => c.id === "conv-local")?.readOnly).toBeFalsy();
    expect(merged.find((c) => c.id === "conv-imported")?.readOnly).toBe(true);
  });

  it("converts stored conversation to transcript items", () => {
    const items = storedConversationToTranscriptItems({
      id: "conv-1",
      title: "Title",
      createdAt: "2026-08-10T20:00:00Z",
      updatedAt: "2026-08-10T20:00:00Z",
      turns: [
        {
          id: "t1",
          prompt: "Hello",
          response: "World",
          reasoning: ["Think"],
          createdAt: "2026-08-10T20:00:00Z",
        },
      ],
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ kind: "user", id: "t1-user", text: "Hello", selections: [] });
    expect(items[1].kind).toBe("agent");
    expect(items[1].text).toBe("World");
  });

  it("curates the latest turn from a multi-turn transcript", () => {
    const items: TranscriptItem[] = [
      { kind: "user", id: "u1", text: "First prompt", selections: [] },
      { kind: "agent", id: "a1", text: "First response", activities: [] },
      { kind: "user", id: "u2", text: "Second prompt", selections: [] },
      {
        kind: "agent",
        id: "a2",
        text: "Second response",
        activities: [{ id: "r2", kind: "reasoning", label: "Thinking", detail: "Latest reasoning" }],
      },
    ];

    const curated = curateStoredTurn({
      turnId: "turn-2",
      items,
      createdAt: "2026-08-10T20:15:00.000Z",
    });

    expect(curated.id).toBe("turn-2");
    expect(curated.prompt).toBe("Second prompt");
    expect(curated.response).toBe("Second response");
    expect(curated.reasoning).toEqual(["Latest reasoning"]);
  });
});
