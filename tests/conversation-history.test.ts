import { describe, expect, it } from "vitest";
import {
  conversationListParams,
  extractLearnerRequest,
  transcriptFromThread,
} from "../server/codex/CodexClient";
import { buildCoursePrompt } from "../server/course/prompt";
import type { PersistedThread } from "../server/codex/types";

describe("conversation history", () => {
  it("discovers conversations by course directory without an unreliable source filter", () => {
    expect(conversationListParams("/courses/confucious")).toEqual({
      cwd: "/courses/confucious",
      sortKey: "updated_at",
      sortDirection: "desc",
      limit: 100,
    });
  });

  it("restores the learner's original message instead of the studio prompt wrapper", () => {
    const prompt = buildCoursePrompt("Make this example more visual", [{
      id: "selection-1",
      tag: "section",
      text: "Charge flow",
      outerHTML: "<section>Charge flow</section>",
      location: "main > section:nth-child(2)",
    }]);

    expect(extractLearnerRequest(prompt)).toBe("Make this example more visual");
  });

  it("reconstructs messages, selections, and completed design activity from Codex turns", () => {
    const prompt = buildCoursePrompt("Make this example more visual", [{
      id: "selection-1",
      tag: "section",
      text: "Charge flow",
      outerHTML: "<section>Charge flow</section>",
      location: "main > section:nth-child(2)",
    }]);
    const thread: PersistedThread = {
      id: "thread-1",
      preview: prompt,
      createdAt: 1_753_574_400,
      updatedAt: 1_753_578_000,
      turns: [{
        id: "turn-1",
        status: "completed",
        items: [
          { id: "user-1", type: "userMessage", content: [{ type: "text", text: prompt, text_elements: [] }] },
          { id: "reason-1", type: "reasoning", summary: ["Reviewing the selected interaction"] },
          { id: "edit-1", type: "fileChange", changes: [{ path: "/tmp/course/index.html" }] },
          { id: "agent-1", type: "agentMessage", text: "I turned the section into an interactive diagram." },
        ],
      }],
    };

    expect(transcriptFromThread(thread)).toEqual([
      {
        kind: "user",
        id: "user-1",
        text: "Make this example more visual",
        selections: [{ kind: "block", tag: "section", text: "Charge flow" }],
      },
      {
        kind: "agent",
        id: "agent-turn-1",
        text: "I turned the section into an interactive diagram.",
        failed: false,
        activities: [
          {
            id: "reason-1",
            kind: "reasoning",
            label: "Thought through the request",
            detail: "Reviewing the selected interaction",
            done: true,
          },
          {
            id: "edit-1",
            kind: "edit",
            label: "Updated the course",
            file: "index.html",
            detail: undefined,
            done: true,
          },
        ],
      },
    ]);
  });

  it("reconstructs steered turns with interleaved user and agent messages in chronological order", () => {
    const prompt1 = buildCoursePrompt("Write chapter 1", []);
    const prompt2 = buildCoursePrompt("Also include a diagram", []);
    const thread: PersistedThread = {
      id: "thread-steer",
      preview: prompt1,
      createdAt: 1_753_574_400,
      updatedAt: 1_753_578_000,
      turns: [{
        id: "turn-steered",
        status: "completed",
        items: [
          { id: "user-1", type: "userMessage", content: [{ type: "text", text: prompt1, text_elements: [] }] },
          { id: "reason-1", type: "reasoning", summary: ["Drafting initial outline"] },
          { id: "agent-1", type: "agentMessage", text: "Starting Chapter 1." },
          { id: "user-2", type: "userMessage", content: [{ type: "text", text: prompt2, text_elements: [] }] },
          { id: "edit-1", type: "fileChange", changes: [{ path: "/tmp/course/chapter1.html" }] },
          { id: "agent-2", type: "agentMessage", text: "Chapter 1 with diagram is complete." },
        ],
      }],
    };

    const transcript = transcriptFromThread(thread);
    expect(transcript).toEqual([
      {
        kind: "user",
        id: "user-1",
        text: "Write chapter 1",
        selections: [],
      },
      {
        kind: "agent",
        id: "agent-turn-steered",
        text: "Starting Chapter 1.",
        failed: false,
        activities: [
          {
            id: "reason-1",
            kind: "reasoning",
            label: "Thought through the request",
            detail: "Drafting initial outline",
            done: true,
          },
        ],
      },
      {
        kind: "user",
        id: "user-2",
        text: "Also include a diagram",
        selections: [],
      },
      {
        kind: "agent",
        id: "agent-turn-steered-1",
        text: "Chapter 1 with diagram is complete.",
        failed: false,
        activities: [
          {
            id: "edit-1",
            kind: "edit",
            label: "Updated the course",
            file: "chapter1.html",
            detail: undefined,
            done: true,
          },
        ],
      },
    ]);
  });
});
