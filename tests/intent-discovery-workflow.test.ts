import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { ClientMessage, CourseOutline, ServerMessage } from "../shared/protocol";

vi.mock("../server/codex/CodexClient", async () => {
  const { EventEmitter } = await import("node:events");
  const { writeFile } = await import("node:fs/promises");
  class FakeCodexClient extends EventEmitter {
    private turnNumber = 0;
    constructor(private directory: string) { super(); }
    getStatus() { return { state: "ready" as const }; }
    getAgentConfig() { return { model: "fake", effort: null }; }
    async connect() { return this.getStatus(); }
    async listModels() { return []; }
    async getAllThreads() { return []; }
    async listConversations() { return []; }
    async currentConversation() { return this.ensureConversation(); }
    async ensureConversation() {
      return { conversation: { id: "fake-thread", title: "New conversation", createdAt: "2026-01-01", updatedAt: "2026-01-01" }, items: [] };
    }
    async newConversation() { return this.ensureConversation(); }
    async translateTopicToSlug() { return "how-computers-work"; }
    async startTurn(message: string, _selections: unknown[], options: { coursePhase?: string }) {
      const turn = { id: `fake-turn-${++this.turnNumber}` };
      if (options.coursePhase === "brief-approved") {
        await writeFile(join(this.directory, "syllabus.html"), '<meta name="course-studio-phase" content="syllabus"><meta name="course-studio-page" content="syllabus"><h1>Computers through examples</h1><h2>Session 1</h2>');
      } else {
        const direction = message.includes("everyday")
          ? "Everyday examples of how computers work"
          : message.includes("broad survey") ? "A broad survey of how computers work" : "How computers work";
        await writeFile(join(this.directory, "COURSE.md"), `# Course Brief\n\n## Direction\n${direction}\n\n## Starting point\nCurious beginner.\n\n## Open assumptions\nPrior coding experience is unknown.\n\n## Teaching approach\nWorked examples fit a beginner who wants concrete mechanisms.\n<!-- course-studio-recommended-preset: worked-examples -->\n`);
      }
      setTimeout(() => {
        this.emit("agentDelta", { turnId: turn.id, delta: options.coursePhase === "brief-approved" ? "Syllabus ready." : "What part of computers interests you most?" });
        this.emit("turnCompleted", { turnId: turn.id, status: "completed" });
      }, 20);
      return turn;
    }
    close() {}
  }
  return { CodexClient: FakeCodexClient };
});

let library: string;
let shutdown: (() => Promise<void>) | undefined;
let socket: WebSocket | undefined;
const previousEnvironment = {
  COURSE_STUDIO_LIBRARY: process.env.COURSE_STUDIO_LIBRARY,
  COURSE_STUDIO_COURSE: process.env.COURSE_STUDIO_COURSE,
  COURSE_STUDIO_PORT: process.env.COURSE_STUDIO_PORT,
  COURSE_STUDIO_EMBEDDED: process.env.COURSE_STUDIO_EMBEDDED,
};

afterAll(async () => {
  socket?.close();
  await shutdown?.();
  if (library) await rm(library, { recursive: true, force: true });
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("learner course birth across the Studio WebSocket", () => {
  it("keeps correction and preset selection in the brief until approval creates only a reviewable syllabus", async () => {
    library = await mkdtemp(join(tmpdir(), "course-studio-workflow-"));
    const port = 23000 + Math.floor(Math.random() * 10000);
    process.env.COURSE_STUDIO_LIBRARY = library;
    process.env.COURSE_STUDIO_COURSE = "current";
    process.env.COURSE_STUDIO_PORT = String(port);
    process.env.COURSE_STUDIO_EMBEDDED = "1";
    const server = await import("../server/index");
    shutdown = server.shutdown;
    await server.startServer();
    socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const inbox: ServerMessage[] = [];
    socket.on("message", (raw) => inbox.push(JSON.parse(raw.toString()) as ServerMessage));
    const waitFor = async (predicate: (message: ServerMessage) => boolean) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const index = inbox.findIndex(predicate);
        if (index >= 0) return inbox.splice(index, 1)[0];
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Timed out waiting for Studio frame. Seen: ${inbox.map((item) => item.type).join(", ")}`);
    };
    const send = (message: ClientMessage) => socket!.send(JSON.stringify(message));
    const changed = (phase: CourseOutline["phase"], check: (course: CourseOutline) => boolean = () => true) => waitFor((frame) => frame.type === "course.changed" && frame.course.phase === phase && check(frame.course)) as Promise<Extract<ServerMessage, { type: "course.changed" }>>;

    await waitFor((frame) => frame.type === "session");
    send({ type: "course.start", topic: "How computers work", language: "en" });
    await waitFor((frame) => frame.type === "turn.completed");
    let draft = (await changed("discovery", (course) => Boolean(course.brief))).course.brief!;
    expect(draft.markdown).toContain("How computers work");
    expect(draft.markdown).toContain("Open assumptions");

    send({ type: "course.brief.review" });
    const review = await changed("brief-review");
    expect(review.course.hasContent).toBe(false);
    expect((await readdir(join(library, "how-computers-work"))).filter((file) => file.endsWith(".html"))).toEqual([]);

    send({ type: "course.brief.explore" });
    await changed("discovery");
    send({ type: "turn.start", message: "A broad survey is fine; I can code a little", selections: [], page: "syllabus.html", language: "en" });
    await waitFor((frame) => frame.type === "turn.completed");
    const continued = (await changed("discovery", (course) => Boolean(course.brief?.markdown.includes("A broad survey")))).course.brief!;
    expect(continued.answerCount).toBe(1);
    send({ type: "course.brief.review" });
    await changed("brief-review");

    send({ type: "turn.start", message: "Use everyday examples", selections: [], page: "syllabus.html", language: "en" });
    await waitFor((frame) => frame.type === "turn.completed");
    draft = (await changed("brief-review", (course) => Boolean(course.brief?.markdown.includes("Everyday examples")))).course.brief!;
    expect(draft.markdown).toContain("Everyday examples");
    send({ type: "course.brief.preset", preset: "retrieval-practice" });
    const selected = (await changed("brief-review", (course) => course.brief?.selectedPreset === "retrieval-practice")).course.brief!;
    expect(selected.selectedPreset).toBe("retrieval-practice");
    expect(await readFile(join(library, "how-computers-work", "COURSE.md"), "utf8")).toContain("course-studio-selected-preset: retrieval-practice");

    send({ type: "course.brief.approve", revision: draft.revision, language: "en" });
    await waitFor((frame) => frame.type === "error" && frame.code === "brief.errorChanged");
    send({ type: "course.brief.approve", revision: selected.revision, language: "en" });
    await waitFor((frame) => frame.type === "turn.completed");
    const syllabus = (await changed("syllabus")).course;
    expect(syllabus.hasContent).toBe(true);
    expect(syllabus.pages.map((page) => page.path)).toContain("syllabus.html");
    expect((await readdir(join(library, "how-computers-work"))).filter((file) => /^session\d+\.html$/.test(file))).toEqual([]);
  }, 15000);
});
