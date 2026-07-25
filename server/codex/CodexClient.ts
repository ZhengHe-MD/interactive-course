import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { relative } from "node:path";
import type { CodexStatus } from "../../shared/protocol";
import { buildCoursePrompt, selectionInputs, type SelectionContext } from "../course/prompt";
import type { CoursePhase } from "../course/CourseManager";
import { JsonRpcPeer } from "./JsonRpcPeer";

type ThreadStartResponse = { thread: { id: string } };
type TurnStartResponse = { turn: { id: string; status: string } };
type AccountReadResponse = {
  account: { type: string; email?: string; planType?: string } | null;
  requiresOpenaiAuth: boolean;
};

export class CodexClient extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null;
  private peer: JsonRpcPeer | null = null;
  private threadId: string | null = null;
  private connecting: Promise<CodexStatus> | null = null;
  private status: CodexStatus = { state: "starting" };
  private turnsWithDelta = new Set<string>();

  constructor(private courseDirectory: string) {
    super();
  }

  getStatus() {
    return this.status;
  }

  async connect() {
    if (this.status.state === "ready") return this.status;
    if (this.connecting) return this.connecting;
    this.connecting = this.start();
    return this.connecting;
  }

  private setStatus(status: CodexStatus) {
    this.status = status;
    this.emit("status", status);
    return status;
  }

  private async start() {
    try {
      this.process = spawn("codex", ["app-server"], {
        cwd: this.courseDirectory,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.process.stderr.setEncoding("utf8");
      this.process.stderr.on("data", (chunk: string) => this.emit("diagnostic", chunk.trim()));
      this.process.on("error", (error) => this.setStatus({ state: "error", message: error.message }));
      this.process.on("exit", (code) => {
        this.peer?.shutdown(new Error(`Codex app-server exited with code ${code ?? "unknown"}.`));
        this.peer = null;
        this.threadId = null;
        if (this.status.state !== "error") this.setStatus({ state: "error", message: "Codex app-server stopped." });
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

      const thread = await this.peer.request<ThreadStartResponse>("thread/start", {
        cwd: this.courseDirectory,
        approvalPolicy: "never",
        sandbox: "workspace-write",
        serviceName: "Course Studio",
        developerInstructions: `You are the course design agent inside Course Studio. Work only inside the current course directory. A new course starts with no index.html: conduct a short interview about the learner's goal, depth, background, and time, then create only a syllabus from scratch. Never copy a sample course or use a starter template. Wait for syllabus approval before creating the first lesson, and generate later lessons one at a time only when the learner reaches them. For an existing lesson, default to improving it for substantive learner questions, but respect an explicit request for a chat-only or meta answer. Keep chat replies short and oriented around what changed. Courses are plain HTML, CSS, and JavaScript with no build step. Preserve working interactions and visual coherence. Never run git or create commits; Course Studio owns checkpoints.`,
      });
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

    const input = [
      { type: "text" as const, text: buildCoursePrompt(message, selections, options), text_elements: [] },
      ...selectionInputs(selections),
    ];
    const response = await this.peer.request<TurnStartResponse>(
      "turn/start",
      { threadId: this.threadId, input },
      60_000,
    );
    return response.turn;
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
    const params = rawParams as any;
    const turnId = params?.turnId ?? params?.turn?.id;

    if (method === "item/agentMessage/delta" && typeof params?.delta === "string" && turnId) {
      this.turnsWithDelta.add(turnId);
      this.emit("agentDelta", { turnId, delta: params.delta });
      return;
    }

    if (method === "item/started" && turnId) {
      if (params?.item?.type === "fileChange") this.emit("activity", { turnId, label: "Editing the course…" });
      if (params?.item?.type === "commandExecution") this.emit("activity", { turnId, label: "Working in the course…" });
      return;
    }

    if (method === "item/completed" && turnId) {
      const item = params?.item;
      if (item?.type === "fileChange") {
        const changedPath = item.changes?.[0]?.path;
        this.emit("activity", {
          turnId,
          label: "Course updated",
          file: changedPath ? relative(this.courseDirectory, changedPath) : undefined,
          done: true,
        });
      }
      if (item?.type === "agentMessage" && !this.turnsWithDelta.has(turnId) && item.text) {
        this.emit("agentDelta", { turnId, delta: item.text });
      }
      return;
    }

    if (method === "turn/completed" && turnId) {
      this.turnsWithDelta.delete(turnId);
      this.emit("turnCompleted", {
        turnId,
        status: params?.turn?.status ?? "completed",
        error: params?.turn?.error?.message,
      });
    }
  }

  close() {
    this.peer?.shutdown();
    this.process?.kill();
    this.peer = null;
    this.process = null;
    this.threadId = null;
    this.turnsWithDelta.clear();
  }
}
