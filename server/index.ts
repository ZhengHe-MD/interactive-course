import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { CodexClient } from "./codex/CodexClient";
import { CourseManager, EMPTY_OUTLINE } from "./course/CourseManager";
import {
  appendStoredTurn,
  curateStoredTurn,
  mergeConversationSummaries,
  readStoredConversations,
} from "./course/conversations";
import { exportCoursePackage, importCoursePackage } from "./course/packageCourse";
import { buildStandaloneCourse, exportFilename } from "./course/exportCourse";
import { prepareCourseForExport } from "./course/prepareExport";
import { allocateCourseId, isCourseId, listCourses } from "./course/library";
import { ensureCourseLibrary, resolveCourseLibraryRoot } from "./course/storage";
import type { Activity, AgentConfig, ClientMessage, Language, ServerMessage, TranscriptItem } from "../shared/protocol";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "..");
const courseLibraryRoot = resolveCourseLibraryRoot(repositoryRoot);
// Learner material lives in its own library and Git history, independent of the
// Studio source checkout. COURSE_STUDIO_COURSE selects the open directory.
const requestedCourseId = process.env.COURSE_STUDIO_COURSE ?? "current";
let courseId = isCourseId(requestedCourseId) ? requestedCourseId : "current";
let courseDirectory = join(courseLibraryRoot, courseId);
const port = Number(process.env.COURSE_STUDIO_PORT ?? 4310);

const app = express();
const server = createServer(app);
const sockets = new Set<WebSocket>();
let course = new CourseManager(courseLibraryRoot, courseId);
let codex = new CodexClient(courseDirectory);
let courseVersion = Date.now();
let activeTurn: string | null = null;
let exportActive = false;
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
  return listCourses(courseLibraryRoot, courseId);
}

async function broadcastCourses() {
  broadcast({ type: "courses", courseId, courses: await courses() });
}

async function conversationContext(options: { create?: boolean } = {}) {
  const status = await codex.connect();
  if (status.state !== "ready") {
    return { conversationId: null, conversations: [], items: [], models: [], agentConfig: null };
  }
  const current = options.create === false
    ? await codex.currentConversation()
    : await codex.ensureConversation();
  return {
    conversationId: current?.conversation.id ?? null,
    conversations: await conversationListing(current),
    items: current?.items ?? [],
    ...await agentContext(),
  };
}

async function agentContext() {
  try {
    return { models: await codex.listModels(), agentConfig: codex.getAgentConfig() };
  } catch (error) {
    if (process.env.COURSE_STUDIO_DEBUG) {
      console.error(`[models] ${error instanceof Error ? error.message : error}`);
    }
    const config = codex.getAgentConfig();
    return { models: [], agentConfig: config.model ? config : null };
  }
}

async function conversationListing(current: Awaited<ReturnType<CodexClient["currentConversation"]>>) {
  const codexConversations = await codex.listConversations();
  const base = current && !codexConversations.some((entry) => entry.id === current.conversation.id)
    ? [current.conversation, ...codexConversations]
    : codexConversations;
  const storedData = await readStoredConversations(courseDirectory);
  return mergeConversationSummaries(base, storedData);
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

async function waitForTurnReady(timeoutMs = 5000) {
  const start = Date.now();
  while (activeTurn === "pending" && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return activeTurn;
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
  activeTurn = null;
  await course.close();
  codex.removeAllListeners();
  codex.close();

  courseId = nextCourseId;
  courseDirectory = join(courseLibraryRoot, courseId);
  await mkdir(courseDirectory, { recursive: true });
  course = new CourseManager(courseLibraryRoot, courseId);
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

app.post("/api/export", express.json({ limit: "64kb" }), async (request, response) => {
  if (activeTurn || exportActive) return response.status(409).send("Wait for the current work to finish before exporting.");
  exportActive = true;
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const currentOutline = await outline();
    if (!currentOutline.hasContent) return response.status(400).send("This course has no content to export.");
    const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
    const instruction = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 20_000) : "";
    const language: Language = body.language === "zh-CN" ? "zh-CN" : "en";
    const candidate = body.agent && typeof body.agent === "object" ? body.agent as Record<string, unknown> : null;
    const agent: AgentConfig | undefined = candidate && typeof candidate.model === "string"
      ? { model: candidate.model, effort: typeof candidate.effort === "string" ? candidate.effort : null }
      : undefined;
    const prepared = instruction
      ? await prepareCourseForExport({ sourceDirectory: courseDirectory, instruction, agent, language })
      : { courseDirectory, outline: currentOutline, cleanup: undefined };
    cleanup = prepared.cleanup;
    const html = await buildStandaloneCourse({
      courseDirectory: prepared.courseDirectory,
      outline: prepared.outline,
      language,
    });
    const filename = exportFilename(prepared.outline.title);
    response
      .set("Cache-Control", "no-store")
      .set("Content-Disposition", `attachment; filename="course.html"; filename*=UTF-8''${encodeURIComponent(filename)}`)
      .type("html")
      .send(html);
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : "Could not export the course.");
  } finally {
    await cleanup?.();
    exportActive = false;
  }
});

app.get("/api/package/export", async (_request, response) => {
  if (activeTurn || exportActive) return response.status(409).send("Wait for current work to finish before packaging.");
  try {
    const buffer = await exportCoursePackage(courseDirectory);
    const outlineData = await outline();
    const filename = `${exportFilename(outlineData.title || courseId).replace(/\.html$/, "")}.course.zip`;
    response
      .set("Cache-Control", "no-store")
      .set("Content-Disposition", `attachment; filename="${courseId}.course.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`)
      .type("application/zip")
      .send(buffer);
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : "Could not package the course.");
  }
});

app.get("/api/package/check/:targetId", async (request, response) => {
  const targetId = request.params.targetId;
  if (!isCourseId(targetId)) return response.status(400).json({ error: "Invalid course ID" });
  const list = await courses();
  const exists = list.some((c) => c.id === targetId);
  response.json({ exists });
});

app.post("/api/package/import", express.raw({ type: "*/*", limit: "100mb" }), async (request, response) => {
  if (activeTurn || exportActive) return response.status(409).send("Wait for current work to finish before importing.");
  try {
    const zipBuffer = request.body as Buffer;
    if (!zipBuffer || !Buffer.isBuffer(zipBuffer) || !zipBuffer.length) {
      return response.status(400).send("No package data provided.");
    }
    const requestedId = typeof request.query.requestedId === "string" ? request.query.requestedId : undefined;
    const onConflict = request.query.onConflict === "replace" ? "replace" : "copy";
    const result = await importCoursePackage({
      libraryRoot: courseLibraryRoot,
      zipBuffer,
      requestedId,
      onConflict,
    });
    await broadcastCourses();
    response.json({ ok: true, courseId: result.courseId });
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : "Could not import the course package.");
  }
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
  let conversation = {
    conversationId: null,
    conversations: [],
    items: [],
    models: [],
    agentConfig: null,
  } as Awaited<ReturnType<typeof conversationContext>>;
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
    if (activeTurn || exportActive) {
      send(socket, { type: "error", message: "Wait for the current work to finish before switching courses." });
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
        : { conversationId: null, conversations: [], items: [], models: [], agentConfig: null };
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
    if (activeTurn || exportActive) {
      send(socket, { type: "error", message: "Wait for the current work to finish before switching conversations." });
      return;
    }
    try {
      if (message.type === "conversation.open") {
        const available = await codex.listConversations();
        const inCodex = available.some((entry) => entry.id === message.conversationId);
        if (!inCodex) {
          const storedData = await readStoredConversations(courseDirectory);
          const storedConv = storedData.conversations.find((c) => c.id === message.conversationId);
          if (!storedConv) {
            throw new Error("That conversation no longer exists in this course.");
          }
          const items: TranscriptItem[] = [];
          for (const turn of storedConv.turns) {
            if (turn.prompt) {
              items.push({ kind: "user", id: `${turn.id}-user`, text: turn.prompt, selections: [] });
            }
            if (turn.response) {
              const activities: Activity[] = turn.reasoning.map((r, i) => ({
                id: `${turn.id}-reasoning-${i}`,
                kind: "reasoning",
                label: "Thinking",
                detail: r,
                done: true,
              }));
              items.push({ kind: "agent", id: `${turn.id}-agent`, text: turn.response, activities });
            }
          }
          broadcast({
            type: "conversation.opened",
            conversationId: storedConv.id,
            conversations: await conversationListing(null),
            items,
            ...await agentContext(),
          });
          return;
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
        ...await agentContext(),
      });
    } catch (error) {
      send(socket, { type: "error", message: error instanceof Error ? error.message : "Could not open the conversation." });
    }
    return;
  }

  if (message.type === "turn.start" || message.type === "turn.steer" || message.type === "course.start") {
    if (exportActive) {
      send(socket, { type: "error", message: "Wait for the course export to finish before sending instructions." });
      return;
    }

    if (activeTurn === "pending") {
      await waitForTurnReady();
    }

    if (activeTurn && message.type !== "course.start") {
      try {
        broadcast({
          type: "activity",
          activity: { id: "steer", kind: "reasoning", label: "Steering the agent…" },
        });
        const response = await codex.steerTurn(
          message.message,
          message.selections,
          {
            coursePhase: await course.getCoursePhase(),
            activePage: message.page,
            activeSection: message.section,
            agent: message.agent,
            language: message.language,
          },
        );
        broadcast({ type: "turn.steered", turnId: response.turnId });
        broadcast({ type: "activity", activity: { id: "steer", kind: "reasoning", label: "Steering the agent…", done: true } });
        return;
      } catch (error) {
        broadcast({ type: "activity", activity: { id: "steer", kind: "reasoning", label: "Steering the agent…", done: true } });
        const errMsg = error instanceof Error ? error.message : String(error);
        if (!errMsg.toLowerCase().includes("no active turn to steer")) {
          send(socket, { type: "error", message: errMsg || "Could not steer the turn." });
          return;
        }
        // If the active turn completed in the instant before steer reached the server,
        // seamlessly fall through to start a new turn.
      }
    }

    // Claim the slot before awaiting, so two quick sends cannot both get through.
    activeTurn = "pending";
    try {
      if (message.type === "course.start") {
        // Verify Codex first: a missing CLI must never move the learner away
        // from the course they were reading.
        const currentStatus = await codex.connect();
        if (currentStatus.state !== "ready") throw new Error(currentStatus.message ?? "Codex is unavailable.");

        const nextCourseId = await allocateCourseId(courseLibraryRoot, message.topic);
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
        broadcast({ type: "agent.config", ...await agentContext() });
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
          activePage: message.type === "turn.start" || message.type === "turn.steer" ? message.page : "syllabus.html",
          activeSection: message.type === "turn.start" || message.type === "turn.steer" ? message.section : undefined,
          agent: message.agent,
          language: message.language,
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
    if (activeTurn || exportActive) {
      send(socket, { type: "error", message: "Wait for the current work to finish before reverting." });
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
    if (turn.status === "completed") {
      await course.createCheckpoint("Agent course update");
      try {
        const currentConv = await codex.currentConversation();
        if (currentConv) {
          const curated = curateStoredTurn({
            turnId: turn.turnId,
            items: currentConv.items,
          });
          await appendStoredTurn(courseDirectory, {
            conversationId: currentConv.conversation.id,
            title: currentConv.conversation.title,
            turn: curated,
          });
        }
      } catch (convErr) {
        if (process.env.COURSE_STUDIO_DEBUG) console.error(`[conv-save] ${convErr}`);
      }
    }
    courseVersion = Date.now();
    broadcast({
      type: "course.changed",
      courseVersion,
      course: await outline(),
    });
    broadcast({ type: "checkpoints", checkpoints: await checkpoints() });
    await broadcastCourses();
    await broadcastConversations();
  } catch (checkpointError) {
    broadcast({ type: "error", message: checkpointError instanceof Error ? checkpointError.message : "Checkpoint failed." });
  }
  broadcast({ type: "turn.completed", ...turn });
}

async function startServer() {
  await ensureCourseLibrary(courseLibraryRoot);
  await mkdir(courseDirectory, { recursive: true });
  wireCodex(codex);
  watchCourse(course);
  server.listen(port, "127.0.0.1", () => {
    console.log(`Course Studio server: http://127.0.0.1:${port} (${courseDirectory})`);
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
