import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { CodexClient } from "./codex/CodexClient";
import { CourseManager } from "./course/CourseManager";
import type { Activity, ClientMessage, CourseOutline, ServerMessage } from "../shared/protocol";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "..");
// Courses live in the studio repository so they are versioned and shareable with
// it. COURSE_ID selects which one is open; the default is the working course.
const courseId = process.env.COURSE_STUDIO_COURSE ?? "current";
const courseRelativePath = `courses/${courseId}`;
const courseDirectory = join(repositoryRoot, courseRelativePath);
const port = Number(process.env.COURSE_STUDIO_PORT ?? 4310);

const app = express();
const server = createServer(app);
const sockets = new Set<WebSocket>();
const course = new CourseManager(repositoryRoot, courseRelativePath);
const codex = new CodexClient(courseDirectory);
let courseVersion = Date.now();
let activeTurn: string | null = null;
let changeTimer: NodeJS.Timeout | null = null;

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

const emptyOutline: CourseOutline = {
  phase: "empty",
  hasContent: false,
  title: "What will you learn?",
  topic: "New course",
  sections: [],
  upNext: [],
};

async function outline() {
  try {
    return await course.getOutline();
  } catch {
    return emptyOutline;
  }
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
  const file = safeCoursePath(request.path === "/" ? "/index.html" : request.path);
  if (!file) return response.status(403).send("Outside the course directory");
  try {
    const html = await readFile(file, "utf8");
    response.set("Cache-Control", "no-store").type("html").send(instrumentCourseHtml(html));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && (request.path === "/" || request.path === "/index.html")) {
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
app.use("/course", express.static(courseDirectory, { etag: false, lastModified: false, maxAge: 0 }));

const distDirectory = join(repositoryRoot, "dist");
app.use(express.static(distDirectory));
app.get("/{*splat}", (_request, response) => response.sendFile(join(distDirectory, "index.html")));

const websocket = new WebSocketServer({ server, path: "/ws" });
websocket.on("connection", async (socket) => {
  sockets.add(socket);
  send(socket, {
    type: "session",
    codex: codex.getStatus(),
    checkpoints: await checkpoints(),
    course: await outline(),
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

  if (message.type === "turn.start") {
    if (activeTurn) {
      send(socket, { type: "error", message: "The course agent is already working on a turn." });
      return;
    }
    // Claim the slot before awaiting, so two quick sends cannot both get through.
    activeTurn = "pending";
    try {
      broadcast({
        type: "activity",
        activity: { id: "prepare", kind: "reasoning", label: "Reading your course context…" },
      });
      const turn = await codex.startTurn(message.message, message.selections, {
        coursePhase: await course.getCoursePhase(),
      });
      activeTurn = turn.id;
      broadcast({ type: "turn.accepted", turnId: turn.id });
      broadcast({ type: "activity", activity: { id: "prepare", kind: "reasoning", label: "Reading your course context…", done: true } });
    } catch (error) {
      activeTurn = null;
      broadcast({ type: "activity", activity: { id: "prepare", kind: "reasoning", label: "Reading your course context…", done: true } });
      broadcast({ type: "error", message: error instanceof Error ? error.message : "Could not start the turn." });
    }
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

codex.on("status", (status) => broadcast({ type: "codex.status", status }));
codex.on("agentDelta", ({ turnId, delta }) => broadcast({ type: "agent.delta", turnId, delta }));
codex.on("activity", ({ turnId, activity }: { turnId?: string; activity: Activity }) =>
  broadcast({ type: "activity", turnId, activity }),
);
codex.on("notice", (message: string) => broadcast({ type: "system", message }));
codex.on("turnCompleted", (turn) => void handleTurnCompleted(turn));
codex.on("diagnostic", (message) => {
  if (process.env.COURSE_STUDIO_DEBUG) console.error(`[codex] ${message}`);
});

async function handleTurnCompleted(turn: { turnId: string; status: string; error?: string }) {
  // Clear the slot first: a failed checkpoint must never leave the studio stuck.
  activeTurn = null;
  try {
    if (turn.status === "completed") await course.createCheckpoint("Agent course update", { allowEmpty: true });
    broadcast({ type: "checkpoints", checkpoints: await checkpoints() });
  } catch (checkpointError) {
    broadcast({ type: "error", message: checkpointError instanceof Error ? checkpointError.message : "Checkpoint failed." });
  }
  broadcast({ type: "turn.completed", ...turn });
}

course.onChange((path) => {
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
    })();
  }, 120);
});
course.watch();

server.listen(port, "127.0.0.1", () => {
  console.log(`Course Studio server: http://127.0.0.1:${port} (${courseRelativePath})`);
  void codex.connect();
});

async function shutdown() {
  codex.close();
  await course.close();
  server.close();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
