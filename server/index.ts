import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import chokidar from "chokidar";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexClient, type UserInput } from "./codex/CodexClient.ts";
import { CourseManager } from "./course/CourseManager.ts";
import { DESIGN_GUIDE } from "./course/designGuide.ts";
import { buildTurnText, checkpointLabel } from "./course/prompt.ts";
import type { ClientMessage, Selection, ServerMessage } from "../shared/protocol.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const PORT = Number(process.env.PORT) || 4310;
// Courses start empty and are born from what the learner wants to study. Setting
// COURSE_ID to a folder under courses/ (e.g. an example) seeds from it instead.
const COURSE_ID = process.env.COURSE_ID || "my-course";

const course = new CourseManager(
  path.join(repoRoot, "courses", COURSE_ID),
  path.join(repoRoot, ".workspace"),
  COURSE_ID,
);
const codex = new CodexClient();

const app = express();
const bridgePath = path.join(here, "assets", "preview-bridge.js");

// The selection/live-reload bridge, injected into served course HTML.
app.get("/__studio/preview-bridge.js", async (_req, res) => {
  res.type("application/javascript").set("Cache-Control", "no-store");
  res.send(await fs.readFile(bridgePath, "utf8"));
});

// Serve course files. HTML gets the bridge injected; everything else is static.
app.use("/course", async (req, res, next) => {
  let rel = decodeURIComponent(req.path).replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) rel += course.entryFile();
  const full = path.join(course.dir, rel);
  if (!full.startsWith(course.dir + path.sep) && full !== course.dir) {
    res.status(403).end();
    return;
  }
  if (rel.endsWith(".html")) {
    try {
      const html = await fs.readFile(full, "utf8");
      res.type("html").set("Cache-Control", "no-store").send(injectBridge(html));
    } catch {
      res.status(404).end();
    }
    return;
  }
  next();
});
app.use("/course", express.static(course.dir, { index: false, dotfiles: "ignore" }));

app.get("/api/state", async (_req, res) => {
  res.json(await course.getState());
});

// In production (`npm start`) serve the built studio; in dev Vite handles it.
const distDir = path.join(repoRoot, "dist");
app.use(express.static(distDir));
app.get(/^(?!\/(api|course|__studio|ws)).*/, async (_req, res, next) => {
  try {
    res.type("html").send(await fs.readFile(path.join(distDir, "index.html"), "utf8"));
  } catch {
    next();
  }
});

function injectBridge(html: string): string {
  const tag = '\n<script src="/__studio/preview-bridge.js"></script>\n';
  return html.includes("</body>") ? html.replace("</body>", tag + "</body>") : html + tag;
}

// --- WebSocket: the live studio channel -----------------------------------

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set<WebSocket>();
let threadId: string | null = null;
let busy = false;

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
}

wss.on("connection", async (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.t === "chat") void handleChat(msg.text, msg.selection ?? null);
    else if (msg.t === "revert") void handleRevert();
    else if (msg.t === "interrupt") void (threadId && codex.interrupt(threadId));
  });
  send(ws, { t: "hello", course: await course.getState(), agent: codex.getStatus() });
});

async function handleChat(text: string, selection: Selection | null): Promise<void> {
  if (!text.trim() && !selection) return;
  if (busy) {
    broadcast({ t: "error", message: "A turn is already running — one at a time." });
    return;
  }
  if (!codex.getStatus().ready) {
    broadcast({
      t: "error",
      message: `Codex isn't available: ${codex.getStatus().detail}. Run \`codex login\` and restart.`,
    });
    return;
  }

  busy = true;
  let tmpImage: string | null = null;
  try {
    console.log(`[turn] chat received (${text.slice(0, 40)}…); starting thread if needed`);
    if (!threadId) threadId = await codex.startThread(course.dir, DESIGN_GUIDE);
    console.log(`[turn] thread ${threadId}; sending turn`);

    const input: UserInput[] = [
      { type: "text", text: buildTurnText(text, selection), text_elements: [] },
    ];
    if (selection?.screenshot) {
      tmpImage = await writeTempImage(selection.screenshot);
      if (tmpImage) input.push({ type: "localImage", path: tmpImage });
    }

    broadcast({ t: "turn_start" });
    const status = await codex.runTurn(threadId, input, {
      onDelta: (id, delta) => broadcast({ t: "delta", id, text: delta }),
      onMessage: (id, txt) => broadcast({ t: "message", id, text: txt }),
      onActivity: (id, kind, label) =>
        broadcast({ t: "activity", activity: { id, kind, label } }),
      onActivityDone: (id) => broadcast({ t: "activity_done", id }),
      onError: (message) => broadcast({ t: "error", message }),
    });

    console.log(`[turn] completed with status=${status}`);
    if (status === "completed") {
      const committed = await course.checkpoint(checkpointLabel(text, selection));
      console.log(`[turn] checkpoint committed=${committed}`);
      if (committed) broadcast({ t: "state", course: await course.getState() });
    }
    broadcast({ t: "turn_end", status: normalizeStatus(status) });
  } catch (err) {
    broadcast({ t: "error", message: (err as Error).message });
    broadcast({ t: "turn_end", status: "failed" });
  } finally {
    busy = false;
    if (tmpImage) await fs.rm(tmpImage, { force: true }).catch(() => {});
  }
}

async function handleRevert(): Promise<void> {
  if (busy) return;
  try {
    const reverted = await course.revert();
    if (reverted) {
      broadcast({ t: "state", course: await course.getState() });
      broadcast({ t: "course_changed" });
      broadcast({ t: "note", text: "Reverted the last change." });
    }
  } catch (err) {
    broadcast({ t: "error", message: (err as Error).message });
  }
}

function normalizeStatus(status: string): "completed" | "failed" | "interrupted" {
  if (status === "completed") return "completed";
  if (status === "interrupted" || status === "cancelled") return "interrupted";
  return "failed";
}

async function writeTempImage(dataUrl: string): Promise<string | null> {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const file = path.join(os.tmpdir(), `studio-sel-${Date.now()}.png`);
  await fs.writeFile(file, Buffer.from(match[1], "base64"));
  return file;
}

// --- Live reload: watch the course dir for the agent's edits ---------------

let reloadTimer: NodeJS.Timeout | null = null;
function watchCourse(): void {
  chokidar
    .watch(course.dir, {
      ignored: (p) => p.includes(`${path.sep}.git`),
      ignoreInitial: true,
    })
    .on("all", () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(async () => {
        // Refresh metadata too, so the course appears (title, TOC, preview) the
        // moment the agent writes it — watch the birth happen live.
        broadcast({ t: "state", course: await course.getState() });
        broadcast({ t: "course_changed" });
      }, 200);
    });
}

async function main(): Promise<void> {
  await course.init();
  watchCourse();
  const status = await codex.start();
  broadcast({ t: "agent", status });
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Course Studio server on http://127.0.0.1:${PORT}`);
    console.log(status.ready ? "Codex: connected" : `Codex: ${status.detail}`);
  });
}

void main();
