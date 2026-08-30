import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Chat } from "../src/components/Chat";
import { I18nProvider } from "../src/i18n";

const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function chat(props: Partial<Parameters<typeof Chat>[0]> = {}) {
  return (
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
      selections={[]}
      onToggleOpen={() => {}}
      onNewConversation={() => {}}
      onSwitchConversation={() => {}}
      onExpandSelection={() => {}}
      onRemoveSelection={() => {}}
      onSend={() => {}}
      onInterrupt={() => {}}
      placeholder="Ask"
      {...props}
    />
  );
}

describe("composer attachments", () => {
  it("offers the picker and previews the images waiting to be sent", () => {
    const html = renderToStaticMarkup(
      chat({ attachments: [{ id: "one", name: "quiz-error.png", dataUrl: pixel }] }),
    );

    expect(html).toContain('aria-label="Attach an image"');
    expect(html).toContain('accept="image/png,image/jpeg,image/webp,image/gif"');
    expect(html).toContain('aria-label="Attached images"');
    expect(html).toContain(`src="${pixel}"`);
    expect(html).toContain('aria-label="Remove image · quiz-error.png"');
  });

  it("lets an image alone be the message", () => {
    const withImage = renderToStaticMarkup(
      chat({ attachments: [{ id: "one", name: "shot.png", dataUrl: pixel }] }),
    );
    const empty = renderToStaticMarkup(chat());

    expect(withImage).toContain('aria-label="Send"');
    expect(withImage).not.toMatch(/aria-label="Send"[^>]*disabled/);
    expect(empty).toMatch(/disabled[^>]*aria-label="Send"|aria-label="Send"[^>]*disabled/);
  });

  it("shows sent images in the transcript, and their names once the thread is reopened", () => {
    const html = renderToStaticMarkup(
      chat({
        items: [
          {
            kind: "user",
            id: "user-1",
            text: "Why does this fail?",
            selections: [],
            attachments: [{ name: "live.png", dataUrl: pixel }],
          },
          {
            kind: "user",
            id: "user-2",
            text: "And this one?",
            selections: [],
            attachments: [{ name: "reloaded.png" }],
          },
        ],
      }),
    );

    expect(html).toContain('class="user-attachment-thumb"');
    expect(html).toContain('alt="live.png"');
    expect(html).toContain("Attached image · reloaded.png");
  });

  it("localizes the attachment controls in Simplified Chinese", () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLanguage="zh-CN">
        {chat({ attachments: [{ id: "one", name: "shot.png", dataUrl: pixel }] })}
      </I18nProvider>,
    );

    expect(html).toContain('aria-label="添加图片"');
    expect(html).toContain("已添加的图片");
    expect(html).toContain("移除图片 · shot.png");
    expect(html).not.toContain("Attach an image");
  });
});
