import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { basename, isAbsolute, relative } from "node:path";
import type { CodexStatus, CoursePhase } from "../../shared/protocol";
import { DESIGN_GUIDE } from "../course/designGuide";
import { buildCoursePrompt, writeSelectionImages, type SelectionContext } from "../course/prompt";
import { JsonRpcPeer } from "./JsonRpcPeer";
import type {
  AccountReadResponse,
  AgentMessageDeltaNotification,
  ErrorNotification,
  ItemNotification,
  ThreadStartParams,
  ThreadStartResponse,
  TurnCompletedNotification,
  TurnStartResponse,
  UserInput,
} from "./types";

/**
 * The thin seam over Codex `app-server` (DESIGN.md decision 3). It owns the child
 * process and the JSON-RPC handshake, and exposes exactly what the studio needs:
 * connect, start a turn with streamed events, interrupt. Nothing above this class
 * knows the wire protocol.
 */
export class CodexClient extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null;
  private peer: JsonRpcPeer | null = null;
  private threadId: string | null = null;
  private connecting: Promise<CodexStatus> | null = null;
  private status: CodexStatus = { state: "starting" };
  private turnsWithDelta = new Set<string>();
  private activeTurn: string | null = null;

  constructor(
    private courseDirectory: string,
    private binary = process.env.CODEX_BIN ?? "codex",
  ) {
    super();
  }

  getStatus() {
    return this.status;
  }

  async connect(): Promise<CodexStatus> {
    if (this.status.state === "ready") return this.status;
    if (!this.connecting) {
      this.connecting = this.start();
      // A failed attempt must not be cached forever, or the studio can never
      // recover from a Codex that was merely missing or briefly unavailable.
      void this.connecting.then((status) => {
        if (status.state !== "ready") this.connecting = null;
      });
    }
    return this.connecting;
  }

  private setStatus(status: CodexStatus) {
    this.status = status;
    this.emit("status", status);
    return status;
  }

  private async start() {
    try {
      this.setStatus({ state: "starting" });
      this.process = spawn(this.binary, ["app-server"], {
        cwd: this.courseDirectory,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.process.stderr.setEncoding("utf8");
      this.process.stderr.on("data", (chunk: string) => this.emit("diagnostic", chunk.trim()));
      this.process.on("error", (error) => {
        this.setStatus({ state: "error", message: `Could not start Codex: ${error.message}` });
        this.peer?.shutdown(new Error(error.message));
        this.failActiveTurn(error.message);
      });
      this.process.on("exit", (code) => {
        this.peer?.shutdown(new Error(`Codex app-server exited with code ${code ?? "unknown"}.`));
        this.peer = null;
        this.threadId = null;
        this.connecting = null;
        if (this.status.state !== "error") this.setStatus({ state: "error", message: "Codex app-server stopped." });
        this.failActiveTurn("Codex app-server stopped before the turn finished.");
      });

      this.peer = new JsonRpcPeer(this.process.stdout, this.process.stdin, (method) => this.handleServerRequest(method));
      this.peer.on("notification", (method: string, params: unknown) => this.handleNotification(method, params));
      this.peer.on("diagnostic", (message) => this.emit("diagnostic", message));

      await this.peer.request("initialize", {
        clientInfo: { name: "course_studio", title: "Course Studio", version: "0.1.0" },
      });
      this.peer.notify("initialized", {});
      const account = await this.peer.request<AccountReadResponse>("account/read", { refreshToken: false });
      if (account.requiresOpenaiAuth && !account.account) {
        throw new Error("Codex is not signed in. Run `codex login`, then restart Course Studio.");
      }

      const params: ThreadStartParams = {
        cwd: this.courseDirectory,
        approvalPolicy: "never",
        sandbox: "workspace-write",
        serviceName: "Course Studio",
        developerInstructions: DESIGN_GUIDE,
      };
      const thread = await this.peer.request<ThreadStartResponse>("thread/start", params);
      this.threadId = thread.thread.id;
      const accountLabel = account.account?.email ?? account.account?.planType ?? account.account?.type;
      return this.setStatus({ state: "ready", account: accountLabel });
    } catch (error) {
      return this.setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Could not start Codex app-server.",
      });
    }
  }

  async startTurn(message: string, selections: SelectionContext[], options: { coursePhase?: CoursePhase } = {}) {
    await this.connect();
    if (!this.peer || !this.threadId || this.status.state !== "ready") {
      throw new Error(this.status.message ?? "Codex is unavailable.");
    }

    const text: UserInput = {
      type: "text",
      text: buildCoursePrompt(message, selections, options),
      text_elements: [],
    };
    const images = await writeSelectionImages(selections);

    try {
      const turn = await this.send([text, ...images.inputs]);
      this.activeTurn = turn.id;
      return turn;
    } catch (error) {
      // The screenshot is a bonus, never the point: if app-server rejects the
      // image input, retry once on words alone rather than losing the turn.
      if (images.inputs.length === 0) throw error;
      this.emit("diagnostic", `Retrying the turn without selection screenshots: ${describe(error)}`);
      this.emit("notice", "Sent your selection without its screenshot — Codex rejected the image.");
      const turn = await this.send([text]);
      this.activeTurn = turn.id;
      return turn;
    } finally {
      await images.cleanup().catch(() => {});
    }
  }

  private async send(input: UserInput[]) {
    const response = await this.peer!.request<TurnStartResponse>(
      "turn/start",
      { threadId: this.threadId, input },
      60_000,
    );
    return response.turn;
  }

  /** Ask Codex to stop the turn in flight. Best effort — never throws. */
  async interrupt() {
    if (!this.peer || !this.threadId || !this.activeTurn) return;
    try {
      await this.peer.request("turn/interrupt", { threadId: this.threadId }, 10_000);
    } catch (error) {
      this.emit("diagnostic", `Interrupt failed: ${describe(error)}`);
    }
  }

  /** A short, learner-facing name for a file the agent touched. */
  private courseRelative(path: string) {
    if (!isAbsolute(path)) return path;
    const inside = relative(this.courseDirectory, path);
    return inside && !inside.startsWith("..") ? inside : basename(path);
  }

  private failActiveTurn(message: string) {
    const turnId = this.activeTurn;
    if (!turnId) return;
    this.activeTurn = null;
    this.turnsWithDelta.delete(turnId);
    this.emit("turnCompleted", { turnId, status: "failed", error: message });
  }

  private handleServerRequest(method: string) {
    if (method === "item/fileChange/requestApproval" || method === "applyPatchApproval") {
      return { decision: "acceptForSession" };
    }
    if (method === "item/commandExecution/requestApproval" || method === "execCommandApproval") {
      return { decision: "decline" };
    }
    throw new Error(`Course Studio does not support app-server request: ${method}`);
  }

  private handleNotification(method: string, rawParams: unknown) {
    if (method === "item/agentMessage/delta") {
      const params = rawParams as AgentMessageDeltaNotification;
      const turnId = params.turnId ?? this.activeTurn;
      if (!turnId || typeof params.delta !== "string") return;
      this.turnsWithDelta.add(turnId);
      this.emit("agentDelta", { turnId, delta: params.delta });
      return;
    }

    if (method === "item/started" || method === "item/completed") {
      const params = rawParams as ItemNotification;
      const turnId = params.turnId ?? this.activeTurn ?? undefined;
      const item = params.item;
      if (!item) return;
      const done = method === "item/completed";

      if (item.type === "agentMessage") {
        if (done && turnId && !this.turnsWithDelta.has(turnId) && item.text) {
          this.emit("agentDelta", { turnId, delta: item.text });
        }
        return;
      }

      const id = item.id ?? `${item.type}-${turnId ?? "turn"}`;
      if (item.type === "fileChange") {
        const changedPath = item.changes?.[0]?.path;
        const file = changedPath ? this.courseRelative(changedPath) : undefined;
        this.emit("activity", {
          turnId,
          activity: { id, kind: "edit", label: done ? "Course updated" : "Editing the course…", file, done },
        });
        return;
      }
      if (item.type === "reasoning") {
        this.emit("activity", { turnId, activity: { id, kind: "reasoning", label: "Thinking…", done } });
        return;
      }
      if (item.type === "commandExecution") {
        this.emit("activity", { turnId, activity: { id, kind: "command", label: "Working in the course…", done } });
        return;
      }
      if (item.type === "webSearch") {
        this.emit("activity", { turnId, activity: { id, kind: "search", label: "Searching the web…", done } });
      }
      return;
    }

    if (method === "turn/completed") {
      const params = rawParams as TurnCompletedNotification;
      const turnId = params.turnId ?? params.turn?.id ?? this.activeTurn;
      if (!turnId) return;
      this.turnsWithDelta.delete(turnId);
      if (this.activeTurn === turnId) this.activeTurn = null;
      this.emit("turnCompleted", {
        turnId,
        status: params.turn?.status ?? "completed",
        error: params.turn?.error?.message,
      });
      return;
    }

    if (method === "error") {
      const params = rawParams as ErrorNotification;
      this.emit("diagnostic", params.error?.message ?? params.message ?? "Codex reported an error.");
    }
  }

  close() {
    this.peer?.shutdown();
    this.process?.kill();
    this.peer = null;
    this.process = null;
    this.threadId = null;
    this.connecting = null;
    this.activeTurn = null;
    this.turnsWithDelta.clear();
  }
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
