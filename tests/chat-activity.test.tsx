import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Chat } from "../src/components/Chat";

describe("chat activity timeline", () => {
  it("shows live Codex metadata instead of an anonymous typing indicator", () => {
    const html = renderToStaticMarkup(
      <Chat
        codex={{ state: "ready" }}
        statusText="Agent is working"
        connected
        working
        phase="learning"
        conversationId="conversation-1"
        conversations={[{
          id: "conversation-1",
          title: "Improve the battery lesson",
          createdAt: "2026-07-27T00:00:00.000Z",
          updatedAt: "2026-07-27T00:00:00.000Z",
        }]}
        items={[{
          kind: "agent",
          id: "agent-1",
          text: "",
          activities: [{
            id: "reason-1",
            kind: "reasoning",
            label: "Thinking",
            detail: "Comparing the explanation with the learner's selection.",
          }],
        }]}
        open
        selections={[]}
        onToggleOpen={() => {}}
        onNewConversation={() => {}}
        onSwitchConversation={() => {}}
        onExpandSelection={() => {}}
        onRemoveSelection={() => {}}
        onSend={() => {}}
        onInterrupt={() => {}}
        placeholder="Ask"
      />,
    );

    expect(html).toContain('aria-label="Agent work details"');
    expect(html).toContain('aria-label="Agent activity history"');
    expect(html).toContain('aria-label="Switch conversation"');
    expect(html).toContain('aria-label="New conversation"');
    expect(html).toContain("Improve the battery lesson");
    expect(html).toContain("Thinking");
    expect(html).toContain("Comparing the explanation");
    expect(html).toContain('aria-label="In progress"');
    expect(html).not.toContain('class="typing"');
  });

  it("keeps the latest activity beside the composer and expands to the full history", () => {
    const html = renderToStaticMarkup(
      <Chat
        codex={{ state: "ready" }}
        statusText="Agent is working"
        connected
        working
        phase="learning"
        conversationId="conversation-1"
        conversations={[]}
        items={[{
          kind: "agent",
          id: "agent-1",
          text: "I’m building the lesson now. ".repeat(80),
          activities: [{
            id: "search-1",
            kind: "search",
            label: "Searched the web",
            done: true,
          }, {
            id: "reason-1",
            kind: "reasoning",
            label: "Thinking through the request",
            detail: "Turning the research into the next lesson.",
          }],
        }]}
        open
        selections={[]}
        onToggleOpen={() => {}}
        onNewConversation={() => {}}
        onSwitchConversation={() => {}}
        onExpandSelection={() => {}}
        onRemoveSelection={() => {}}
        onSend={() => {}}
        onInterrupt={() => {}}
        placeholder="Ask"
      />,
    );

    expect(html.indexOf("I’m building the lesson now.")).toBeLessThan(html.indexOf("Agent work details"));
    expect(html).toContain('<details class="working-banner"');
    expect(html).toContain("Searched the web");
    expect(html).toContain("Thinking through the request");
    expect(html).toContain("Turning the research into the next lesson.");
    expect(html).not.toContain("Still working on this request");
    expect(html).not.toContain("Completed agent activity");
    expect(html).toContain('placeholder="Agent is still working…"');
    expect(html).toContain('aria-label="Agent working"');
  });

  it("keeps the activity history with the response after the turn completes", () => {
    const html = renderToStaticMarkup(
      <Chat
        codex={{ state: "ready" }}
        statusText="Codex ready"
        connected
        working={false}
        phase="learning"
        conversationId="conversation-1"
        conversations={[]}
        items={[{
          kind: "agent",
          id: "agent-1",
          text: "The lesson is ready.",
          activities: [{
            id: "edit-1",
            kind: "edit",
            label: "Edited the course",
            file: "session2.html",
            done: true,
          }],
        }]}
        open
        selections={[]}
        onToggleOpen={() => {}}
        onNewConversation={() => {}}
        onSwitchConversation={() => {}}
        onExpandSelection={() => {}}
        onRemoveSelection={() => {}}
        onSend={() => {}}
        onInterrupt={() => {}}
        placeholder="Ask"
      />,
    );

    expect(html).toContain('aria-label="Completed agent activity"');
    expect(html).toContain("Edited the course · session2.html");
    expect(html).not.toContain('aria-label="Agent work details"');
  });

  it("renders agent replies as formatted Markdown", () => {
    const html = renderToStaticMarkup(
      <Chat
        codex={{ state: "ready" }}
        statusText="Codex ready"
        connected
        working={false}
        phase="learning"
        conversationId="conversation-1"
        conversations={[]}
        items={[{
          kind: "agent",
          id: "agent-1",
          text: "That does **not** mean obedience.\n\n> Remonstrate gently.\n\n- Read the passage\n- Compare translations\n\nSee [the source](https://example.com).",
          activities: [],
        }]}
        open
        selections={[]}
        onToggleOpen={() => {}}
        onNewConversation={() => {}}
        onSwitchConversation={() => {}}
        onExpandSelection={() => {}}
        onRemoveSelection={() => {}}
        onSend={() => {}}
        onInterrupt={() => {}}
        placeholder="Ask"
      />,
    );

    expect(html).toContain('<div class="markdown-content">');
    expect(html).toContain("<strong>not</strong>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<ul>");
    expect(html).toContain('<a href="https://example.com">the source</a>');
    expect(html).not.toContain("**not**");
  });

  it("makes the syllabus review phase and next action explicit", () => {
    const html = renderToStaticMarkup(
      <Chat
        codex={{ state: "ready" }}
        statusText="Codex ready"
        connected
        working={false}
        phase="syllabus"
        conversationId="conversation-1"
        conversations={[{
          id: "conversation-1",
          title: "Confucius",
          createdAt: "2026-07-27T00:00:00.000Z",
          updatedAt: "2026-07-27T00:00:00.000Z",
        }]}
        items={[]}
        open
        selections={[]}
        onToggleOpen={() => {}}
        onNewConversation={() => {}}
        onSwitchConversation={() => {}}
        onExpandSelection={() => {}}
        onRemoveSelection={() => {}}
        onSend={() => {}}
        onInterrupt={() => {}}
        placeholder="Review"
      />,
    );

    expect(html).toContain("Step 2 of 3 · Review the syllabus");
    expect(html).toContain("Ask for changes, or approve the plan");
    expect(html).toContain("Approve &amp; start Session 1");
  });

  it("presents selected text as context that may be discussed or edited", () => {
    const html = renderToStaticMarkup(
      <Chat
        codex={{ state: "ready" }}
        statusText="Codex ready"
        connected
        working={false}
        phase="learning"
        conversationId="conversation-1"
        conversations={[]}
        items={[]}
        open
        selections={[{
          id: "quote-1",
          kind: "text",
          tag: "p",
          text: "Energy is not the same as power.",
          outerHTML: "Energy is not the same as power.",
          location: "main > p",
        }]}
        onToggleOpen={() => {}}
        onNewConversation={() => {}}
        onSwitchConversation={() => {}}
        onExpandSelection={() => {}}
        onRemoveSelection={() => {}}
        onSend={() => {}}
        onInterrupt={() => {}}
        placeholder="Ask about this"
      />,
    );

    expect(html).toContain("Quoted text");
    expect(html).toContain("Energy is not the same as power.");
    expect(html).toContain("Selections are context. The course changes only when you ask.");
    expect(html).not.toContain("Step 3 of 3");
    expect(html).not.toContain('aria-label="Course design phase"');
  });
});
