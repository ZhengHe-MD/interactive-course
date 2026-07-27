import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { CodexClient } from "./codex/CodexClient";
import { CourseManager, EMPTY_OUTLINE } from "./course/CourseManager";
import { allocateCourseId, isCourseId, listCourses } from "./course/library";
import type { Activity, ClientMessage, ServerMessage } from "../shared/protocol";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "..");
// Courses live in the studio repository so they are versioned and shareable with
// it. COURSE_ID selects which one is open; the default is the working course.
const requestedCourseId = process.env.COURSE_STUDIO_COURSE ?? "current";
let courseId = isCourseId(requestedCourseId) ? requestedCourseId : "current";
let courseRelativePath = `courses/${courseId}`;
let courseDirectory = join(repositoryRoot, courseRelativePath);
const port = Number(process.env.COURSE_STUDIO_PORT ?? 4310);

const app = express();
const server = createServer(app);
const sockets = new Set<WebSocket>();
let course = new CourseManager(repositoryRoot, courseRelativePath);
let codex = new CodexClient(courseDirectory);
let courseVersion = Date.now();
let activeTurn: string | null = null;
let changeTimer: NodeJS.Timeout | null = null;
let stopCourseChange: (() => void) | null = null;

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(message: ServerMessage) {
  for (const socket of sockets) send(socket, message);
}

async function checkpoints() {
  try {
    return await course.listCheckpoints();
  } catch {
    return [];
  }
}

async function outline() {
  try {
    return await course.getOutline();
  } catch {
    return EMPTY_OUTLINE;
  }
}

async function courses() {
  return listCourses(repositoryRoot, courseId);
}

async function broadcastCourses() {
  broadcast({ type: "courses", courseId, courses: await courses() });
}

async function conversationContext(options: { create?: boolean } = {}) {
  const status = await codex.connect();
  if (status.state !== "ready") {
    return { conversationId: null, conversations: [], items: [] };
  }
  const current = options.create === false
    ? await codex.currentConversation()
    : await codex.ensureConversation();
  return {
    conversationId: current?.conversation.id ?? null,
    conversations: await conversationListing(current),
    items: current?.items ?? [],
  };
}

async function conversationListing(current: Awaited<ReturnType<CodexClient["currentConversation"]>>) {
  const conversations = await codex.listConversations();
  if (current && !conversations.some((entry) => entry.id === current.conversation.id)) {
    return [current.conversation, ...conversations];
  }
  return conversations;
}

async function broadcastConversations() {
  const current = await codex.currentConversation();
  broadcast({
    type: "conversations",
    conversationId: current?.conversation.id ?? null,
    conversations: codex.getStatus().state === "ready" ? await conversationListing(current) : [],
  });
}

function wireCodex(client: CodexClient) {
  client.on("status", (status) => broadcast({ type: "codex.status", status }));
  client.on("agentDelta", ({ turnId, delta }) => broadcast({ type: "agent.delta", turnId, delta }));
  client.on("activity", ({ turnId, activity }: { turnId?: string; activity: Activity }) =>
    broadcast({ type: "activity", turnId, activity }),
  );
  client.on("notice", (message: string) => broadcast({ type: "system", message }));
  client.on("turnCompleted", (turn) => void handleTurnCompleted(turn));
  client.on("diagnostic", (message) => {
    if (process.env.COURSE_STUDIO_DEBUG) console.error(`[codex] ${message}`);
  });
}

function watchCourse(manager: CourseManager) {
  stopCourseChange?.();
  stopCourseChange = manager.onChange((path) => {
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      void (async () => {
        courseVersion = Date.now();
        broadcast({
          type: "course.changed",
          courseVersion,
          course: await outline(),
          path: relative(courseDirectory, path),
        });
        await broadcastCourses();
      })();
    }, 120);
  });
  manager.watch();
}

async function activateCourse(nextCourseId: string) {
  if (!isCourseId(nextCourseId)) throw new Error("That course could not be opened.");

  // Capture any manual edits before the active directory changes. The normal
  // agent path is already checkpointed, so this is usually a no-op.
  await course.createCheckpoint("Saved before switching courses");
  if (changeTimer) clearTimeout(changeTimer);
  changeTimer = null;
  stopCourseChange?.();
  stopCourseChange = null;
  await course.close();
  codex.removeAllListeners();
  codex.close();

  courseId = nextCourseId;
  courseRelativePath = `courses/${courseId}`;
  courseDirectory = join(repositoryRoot, courseRelativePath);
  await mkdir(courseDirectory, { recursive: true });
  course = new CourseManager(repositoryRoot, courseRelativePath);
  codex = new CodexClient(courseDirectory);
  wireCodex(codex);
  watchCourse(course);
  courseVersion = Date.now();
}

function safeCoursePath(requestPath: string) {
  const candidate = resolve(courseDirectory, `.${decodeURIComponent(requestPath)}`);
  if (candidate !== courseDirectory && !candidate.startsWith(`${courseDirectory}${sep}`)) return null;
  return candidate;
}

function instrumentCourseHtml(html: string) {
  const bridge = '<script src="/studio-vendor/html2canvas.min.js"></script><script src="/studio-preview.js"></script>';
  return html.includes("</body>") ? html.replace("</body>", `${bridge}</body>`) : `${html}${bridge}`;
}

app.get("/api/health", async (_request, response) => {
  response.json({ ok: true, codex: codex.getStatus(), checkpoints: await checkpoints(), courseVersion });
});

app.get("/studio-preview.js", (_request, response) => {
  response.type("application/javascript").sendFile(join(here, "assets/preview-bridge.js"));
});

app.get("/studio-vendor/html2canvas.min.js", (_request, response) => {
  response.type("application/javascript").sendFile(join(repositoryRoot, "node_modules/html2canvas/dist/html2canvas.min.js"));
});

app.use("/course", async (request, response, next) => {
  if (extname(request.path).toLowerCase() !== ".html" && request.path !== "/") return next();
  const rootEntry = request.path === "/"
    ? (await outline()).pages[0]?.path ?? "syllabus.html"
    : request.path;
  const file = safeCoursePath(rootEntry.startsWith("/") ? rootEntry : `/${rootEntry}`);
  if (!file) return response.status(403).send("Outside the course directory");
  try {
    const html = await readFile(file, "utf8");
    response.set("Cache-Control", "no-store").type("html").send(instrumentCourseHtml(html));
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT"
      && (request.path === "/" || request.path === "/syllabus.html" || request.path === "/index.html")
    ) {
      try {
        const html = await readFile(join(here, "assets/empty-course.html"), "utf8");
        response.set("Cache-Control", "no-store").type("html").send(instrumentCourseHtml(html));
        return;
      } catch {
        // Fall through to the regular static-file response.
      }
    }
    next();
  }
});
app.use("/course", (request, response, next) => {
  express.static(courseDirectory, { etag: false, lastModified: false, maxAge: 0 })(request, response, next);
});

const distDirectory = join(repositoryRoot, "dist");
app.use(express.static(distDirectory));
app.get("/{*splat}", (_request, response) => response.sendFile(join(distDirectory, "index.html")));

const websocket = new WebSocketServer({ server, path: "/ws" });
websocket.on("connection", async (socket) => {
  sockets.add(socket);
  let conversation = { conversationId: null, conversations: [], items: [] } as Awaited<ReturnType<typeof conversationContext>>;
  try {
    conversation = await conversationContext();
  } catch (error) {
    if (process.env.COURSE_STUDIO_DEBUG) console.error(`[conversation] ${error instanceof Error ? error.message : error}`);
  }
  send(socket, {
    type: "session",
    codex: codex.getStatus(),
    checkpoints: await checkpoints(),
    course: await outline(),
    courseId,
    courses: await courses(),
    ...conversation,
    courseVersion,
    turnActive: activeTurn !== null,
  });
  socket.on("close", () => sockets.delete(socket));
  socket.on("message", (raw) => void handleClientMessage(socket, raw.toString()));
});

async function handleClientMessage(socket: WebSocket, raw: string) {
  let message: ClientMessage;
  try {
    message = JSON.parse(raw) as ClientMessage;
  } catch {
    send(socket, { type: "error", message: "Course Studio received an invalid message." });
    return;
  }

  if (message.type === "course.open") {
    if (activeTurn) {
      send(socket, { type: "error", message: "Wait for the course agent to finish before switching courses." });
      return;
    }
    try {
      const available = await courses();
      if (!available.some((entry) => entry.id === message.courseId)) {
        throw new Error("That course no longer exists.");
      }
      if (message.courseId !== courseId) await activateCourse(message.courseId);
      const status = await codex.connect();
      const conversation = status.state === "ready"
        ? await conversationContext()
        : { conversationId: null, conversations: [], items: [] };
      broadcast({
        type: "course.opened",
        courseId,
        courses: await courses(),
        course: await outline(),
        courseVersion,
        checkpoints: await checkpoints(),
        codex: status,
        ...conversation,
      });
    } catch (error) {
      send(socket, { type: "error", message: error instanceof Error ? error.message : "Could not open the course." });
    }
    return;
  }

  if (message.type === "conversation.new" || message.type === "conversation.open") {
    if (activeTurn) {
      send(socket, { type: "error", message: "Wait for the course agent to finish before switching conversations." });
      return;
    }
    try {
      if (message.type === "conversation.open") {
        const available = await codex.listConversations();
        if (!available.some((entry) => entry.id === message.conversationId)) {
          throw new Error("That conversation no longer exists in this course.");
        }
      }
      const next = message.type === "conversation.new"
        ? await codex.newConversation()
        : await codex.openConversation(message.conversationId);
      broadcast({
        type: "conversation.opened",
        conversationId: next.conversation.id,
        conversations: await conversationListing(next),
        items: next.items,
      });
    } catch (error) {
      send(socket, { type: "error", message: error instanceof Error ? error.message : "Could not open the conversation." });
    }
    return;
  }

  if (message.type === "turn.start" || message.type === "course.start") {
    if (activeTurn) {
      send(socket, { type: "error", message: "The course agent is already working on a turn." });
      return;
    }
    // Claim the slot before awaiting, so two quick sends cannot both get through.
    activeTurn = "pending";
    try {
      if (message.type === "course.start") {
        // Verify Codex first: a missing CLI must never move the learner away
        // from the course they were reading.
        const currentStatus = await codex.connect();
        if (currentStatus.state !== "ready") throw new Error(currentStatus.message ?? "Codex is unavailable.");

        const nextCourseId = await allocateCourseId(repositoryRoot, message.topic);
        await activateCourse(nextCourseId);
        const nextStatus = await codex.connect();
        if (nextStatus.state !== "ready") throw new Error(nextStatus.message ?? "Codex is unavailable.");
        const nextConversation = await codex.newConversation();

        broadcast({ type: "checkpoints", checkpoints: await checkpoints() });
        await broadcastCourses();
        broadcast({
          type: "conversations",
          conversationId: nextConversation.conversation.id,
          conversations: await conversationListing(nextConversation),
        });
        broadcast({ type: "course.changed", courseVersion, course: await outline() });
      }
      broadcast({
        type: "activity",
        activity: { id: "prepare", kind: "reasoning", label: "Reading your course context…" },
      });
      const turn = await codex.startTurn(
        message.type === "course.start" ? message.topic : message.message,
        message.type === "course.start" ? [] : message.selections,
        {
          coursePhase: await course.getCoursePhase(),
          activePage: message.type === "turn.start" ? message.page : "syllabus.html",
        },
      );
      activeTurn = turn.id;
      broadcast({ type: "turn.accepted", turnId: turn.id });
      broadcast({ type: "activity", activity: { id: "prepare", kind: "reasoning", label: "Reading your course context…", done: true } });
    } catch (error) {
      activeTurn = null;
      broadcast({ type: "activity", activity: { id: "prepare", kind: "reasoning", label: "Reading your course context…", done: true } });
      broadcast({ type: "error", message: error instanceof Error ? error.message : "Could not start the turn." });
    }
    return;
  }

  if (message.type === "turn.interrupt") {
    if (!activeTurn) return;
    broadcast({ type: "system", message: "Stopping the current turn…" });
    await codex.interrupt();
  }

  if (message.type === "checkpoint.revert") {
    if (activeTurn) {
      send(socket, { type: "error", message: "Wait for the current turn to finish before reverting." });
      return;
    }
    try {
      const checkpoint = await course.revertLast();
      if (!checkpoint) {
        send(socket, { type: "error", message: "There is no earlier course checkpoint to restore." });
        return;
      }
      courseVersion = Date.now();
      broadcast({ type: "system", message: checkpoint.label });
      broadcast({ type: "checkpoints", checkpoints: await checkpoints() });
      broadcast({ type: "course.changed", courseVersion, course: await outline() });
    } catch (error) {
      send(socket, { type: "error", message: error instanceof Error ? error.message : "Could not restore the checkpoint." });
    }
  }
}

async function handleTurnCompleted(turn: { turnId: string; status: string; error?: string }) {
  // Clear the slot first: a failed checkpoint must never leave the studio stuck.
  activeTurn = null;
  try {
    if (turn.status === "completed") await course.createCheckpoint("Agent course update");
    broadcast({ type: "checkpoints", checkpoints: await checkpoints() });
    await broadcastCourses();
    await broadcastConversations();
  } catch (checkpointError) {
    broadcast({ type: "error", message: checkpointError instanceof Error ? checkpointError.message : "Checkpoint failed." });
  }
  broadcast({ type: "turn.completed", ...turn });
}

async function startServer() {
  await mkdir(courseDirectory, { recursive: true });
  wireCodex(codex);
  watchCourse(course);
  server.listen(port, "127.0.0.1", () => {
    console.log(`Course Studio server: http://127.0.0.1:${port} (${courseRelativePath})`);
    void codex.connect();
  });
}

void startServer();

async function shutdown() {
  if (changeTimer) clearTimeout(changeTimer);
  stopCourseChange?.();
  codex.removeAllListeners();
  codex.close();
  await course.close();
  server.close();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
