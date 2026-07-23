import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { CodexClient } from "./codex/CodexClient";
import { CourseManager } from "./course/CourseManager";
import type { ClientMessage, ServerMessage } from "../shared/protocol";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "..");
const courseRelativePath = "courses/bayes-intuition";
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

function safeCoursePath(requestPath: string) {
  const candidate = resolve(courseDirectory, `.${decodeURIComponent(requestPath)}`);
  if (candidate !== courseDirectory && !candidate.startsWith(`${courseDirectory}${sep}`)) return null;
  return candidate;
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
    const bridge = '<script src="/studio-vendor/html2canvas.min.js"></script><script src="/studio-preview.js"></script>';
    const instrumented = html.includes("</body>") ? html.replace("</body>", `${bridge}</body>`) : `${html}${bridge}`;
    response.set("Cache-Control", "no-store").type("html").send(instrumented);
  } catch {
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
    courseVersion,
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
    try {
      broadcast({ type: "activity", label: "Reading your course context…" });
      const turn = await codex.startTurn(message.message, message.selections);
      activeTurn = turn.id;
      broadcast({ type: "turn.accepted", turnId: turn.id });
    } catch (error) {
      activeTurn = null;
      broadcast({ type: "error", message: error instanceof Error ? error.message : "Could not start the turn." });
    }
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
      broadcast({ type: "course.changed", courseVersion });
    } catch (error) {
      send(socket, { type: "error", message: error instanceof Error ? error.message : "Could not restore the checkpoint." });
    }
  }
}

codex.on("status", (status) => broadcast({ type: "codex.status", status }));
codex.on("agentDelta", ({ turnId, delta }) => broadcast({ type: "agent.delta", turnId, delta }));
codex.on("activity", (activity) => broadcast({ type: "activity", ...activity }));
codex.on("turnCompleted", (turn) => void handleTurnCompleted(turn));
codex.on("diagnostic", (message) => {
  if (process.env.COURSE_STUDIO_DEBUG) console.error(`[codex] ${message}`);
});

async function handleTurnCompleted(turn: { turnId: string; status: string; error?: string }) {
  try {
    if (turn.status === "completed") await course.createCheckpoint("Agent course update", { allowEmpty: true });
    broadcast({ type: "checkpoints", checkpoints: await checkpoints() });
  } catch (checkpointError) {
    broadcast({ type: "error", message: checkpointError instanceof Error ? checkpointError.message : "Checkpoint failed." });
  }
  broadcast({ type: "turn.completed", ...turn });
  activeTurn = null;
}

course.onChange((path) => {
  if (changeTimer) clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    courseVersion = Date.now();
    broadcast({ type: "course.changed", courseVersion, path: relative(courseDirectory, path) });
  }, 120);
});
course.watch();

server.listen(port, "127.0.0.1", () => {
  console.log(`Course Studio server: http://127.0.0.1:${port}`);
  void codex.connect();
});

async function shutdown() {
  codex.close();
  await course.close();
  server.close();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
