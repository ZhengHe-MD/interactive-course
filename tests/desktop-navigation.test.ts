import { describe, expect, it } from "vitest";
import { isExternalLink, isStudioUrl } from "../desktop/navigation";

const studio = "http://127.0.0.1:4310";

describe("desktop navigation policy", () => {
  it("keeps studio pages, the SPA, and course previews inside the shell", () => {
    expect(isStudioUrl(`${studio}/`, studio)).toBe(true);
    expect(isStudioUrl(`${studio}/course/session1.html`, studio)).toBe(true);
    expect(isStudioUrl(`${studio}/api/health?x=1`, studio)).toBe(true);
  });

  it("treats anything off the studio origin as outside, including a different port", () => {
    expect(isStudioUrl("http://127.0.0.1:4311/", studio)).toBe(false);
    expect(isStudioUrl("https://example.com/", studio)).toBe(false);
    expect(isStudioUrl("http://localhost:4310/", studio)).toBe(false);
  });

  it("does not mistake a malformed or relative URL for a studio page", () => {
    expect(isStudioUrl("not a url", studio)).toBe(false);
    expect(isStudioUrl("/course/session1.html", studio)).toBe(false);
    expect(isStudioUrl("", studio)).toBe(false);
  });

  it("hands plain web links to the browser", () => {
    expect(isExternalLink("https://example.com/reading")).toBe(true);
    expect(isExternalLink("http://example.com/reading")).toBe(true);
  });

  it("refuses to hand the operating system anything but a web link", () => {
    // A course page is agent-written HTML; these must never reach openExternal.
    expect(isExternalLink("file:///etc/passwd")).toBe(false);
    expect(isExternalLink("javascript:alert(1)")).toBe(false);
    expect(isExternalLink("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isExternalLink("not a url")).toBe(false);
  });
});
