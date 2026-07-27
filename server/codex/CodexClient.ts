import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { basename, isAbsolute, relative } from "node:path";
import type {
  Activity,
  CodexStatus,
  ConversationSummary,
  CoursePhase,
  CourseSection,
  TranscriptItem,
} from "../../shared/protocol";
import { DESIGN_GUIDE } from "../course/designGuide";
import { buildCoursePrompt, writeSelectionImages, type SelectionContext } from "../course/prompt";
import { JsonRpcPeer } from "./JsonRpcPeer";
import type {
  AccountReadResponse,
  AgentMessageDeltaNotification,
  ErrorNotification,
  ItemNotification,
  McpToolCallProgressNotification,
  ReasoningSummaryTextDeltaNotification,
  ThreadStartParams,
  ThreadStartResponse,
  ThreadListResponse,
  ThreadListParams,
  ThreadReadResponse,
  ThreadResumeResponse,
  TurnCompletedNotification,
  TurnInterruptParams,
  TurnPlanUpdatedNotification,
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
  private conversationSnapshot: ConversationSnapshot | null = null;
  private connecting: Promise<CodexStatus> | null = null;
  private status: CodexStatus = { state: "starting" };
  private turnsWithDelta = new Set<string>();
  private reasoningSummaries = new Map<string, string[]>();
  private toolActivities = new Map<string, Activity>();
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
        const message = describeStartupError(error, this.binary);
        this.setStatus({ state: "error", message });
        this.peer?.shutdown(new Error(error.message));
        this.failActiveTurn(message);
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

      const accountLabel = account.account?.email ?? account.account?.planType ?? account.account?.type;
      return this.setStatus({ state: "ready", account: accountLabel });
    } catch (error) {
      return this.setStatus({
        state: "error",
        message: describeStartupError(error, this.binary),
      });
    }
  }

  async newConversation() {
    await this.requireReady();
    const params: ThreadStartParams = {
      cwd: this.courseDirectory,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      serviceName: "Course Studio",
      developerInstructions: DESIGN_GUIDE,
    };
    const thread = await this.peer!.request<ThreadStartResponse>("thread/start", params);
    this.threadId = thread.thread.id;
    this.conversationSnapshot = snapshot(thread.thread);
    return this.conversationSnapshot;
  }

  async listConversations(): Promise<ConversationSummary[]> {
    await this.requireReady();
    const response = await this.peer!.request<ThreadListResponse>("thread/list", conversationListParams(this.courseDirectory));
    return response.data
      .filter((thread) => Boolean(thread.preview?.trim()) || thread.id === this.threadId)
      .map(toConversationSummary);
  }

  async openConversation(conversationId: string) {
    await this.requireReady();
    const response = await this.peer!.request<ThreadResumeResponse>("thread/resume", {
      threadId: conversationId,
      cwd: this.courseDirectory,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      developerInstructions: DESIGN_GUIDE,
    });
    this.threadId = response.thread.id;
    this.conversationSnapshot = snapshot(response.thread);
    return this.conversationSnapshot;
  }

  async currentConversation() {
    if (!this.threadId) return null;
    try {
      return await this.readConversation(this.threadId);
    } catch (error) {
      // app-server cannot read a brand-new thread until its first user message
      // materializes the rollout. The thread/start response is enough until then.
      if (this.conversationSnapshot?.conversation.id === this.threadId) return this.conversationSnapshot;
      throw error;
    }
  }

  async ensureConversation() {
    await this.requireReady();
    if (this.threadId) return this.currentConversation();
    const conversations = await this.listConversations();
    return conversations[0] ? this.openConversation(conversations[0].id) : this.newConversation();
  }

  private async readConversation(conversationId: string) {
    const response = await this.peer!.request<ThreadReadResponse>("thread/read", {
      threadId: conversationId,
      includeTurns: true,
    });
    this.conversationSnapshot = snapshot(response.thread);
    return this.conversationSnapshot;
  }

  private async requireReady() {
    await this.connect();
    if (!this.peer || this.status.state !== "ready") {
      throw new Error(this.status.message ?? "Codex is unavailable.");
    }
  }

  async startTurn(
    message: string,
    selections: SelectionContext[],
    options: { coursePhase?: CoursePhase; activePage?: string; activeSection?: CourseSection } = {},
  ) {
    await this.requireReady();
    if (!this.threadId) await this.ensureConversation();

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
      const params: TurnInterruptParams = { threadId: this.threadId, turnId: this.activeTurn };
      await this.peer.request(
        "turn/interrupt",
        params,
        10_000,
      );
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

    // Codex distinguishes its display-safe reasoning summary from raw
    // reasoning text. Course Studio deliberately streams only the summary.
    if (method === "item/reasoning/summaryTextDelta") {
      const params = rawParams as ReasoningSummaryTextDeltaNotification;
      const turnId = params.turnId ?? this.activeTurn;
      if (!turnId || !params.itemId || typeof params.delta !== "string") return;
      const parts = this.reasoningSummaries.get(params.itemId) ?? [];
      const index = params.summaryIndex ?? 0;
      parts[index] = `${parts[index] ?? ""}${params.delta}`;
      this.reasoningSummaries.set(params.itemId, parts);
      this.emit("activity", {
        turnId,
        activity: {
          id: params.itemId,
          kind: "reasoning",
          label: "Thinking",
          detail: cleanDetail(parts.filter(Boolean).join("\n\n")),
        },
      });
      return;
    }

    if (method === "turn/plan/updated") {
      const params = rawParams as TurnPlanUpdatedNotification;
      const turnId = params.turnId ?? this.activeTurn;
      if (!turnId || !params.plan?.length) return;
      const active = params.plan.find((step) => step.status === "inProgress");
      const completed = params.plan.filter((step) => step.status === "completed").length;
      const done = completed === params.plan.length;
      this.emit("activity", {
        turnId,
        activity: {
          id: `plan-${turnId}`,
          kind: "plan",
          label: done ? "Plan complete" : `Planning · ${completed}/${params.plan.length}`,
          detail: active?.step ?? params.explanation ?? params.plan.at(-1)?.step,
          done,
        },
      });
      return;
    }

    if (method === "item/mcpToolCall/progress") {
      const params = rawParams as McpToolCallProgressNotification;
      const turnId = params.turnId ?? this.activeTurn;
      if (!turnId || !params.itemId || !params.message) return;
      const current = this.toolActivities.get(params.itemId) ?? {
        id: params.itemId,
        kind: "tool" as const,
        label: "Using a tool",
      };
      const activity = { ...current, detail: cleanDetail(params.message) };
      this.toolActivities.set(params.itemId, activity);
      this.emit("activity", { turnId, activity });
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
      const activity = this.activityForItem(id, item, done);
      if (activity) {
        if (activity.kind === "tool") this.toolActivities.set(id, activity);
        this.emit("activity", { turnId, activity });
      }
      if (done) {
        this.reasoningSummaries.delete(id);
        this.toolActivities.delete(id);
      }
      return;
    }

    if (method === "turn/completed") {
      const params = rawParams as TurnCompletedNotification;
      const turnId = params.turnId ?? params.turn?.id ?? this.activeTurn;
      if (!turnId) return;
      this.turnsWithDelta.delete(turnId);
      this.reasoningSummaries.clear();
      this.toolActivities.clear();
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

  private activityForItem(id: string, item: NonNullable<ItemNotification["item"]>, done: boolean): Activity | null {
    if (item.type === "reasoning") {
      const detail = item.summary?.filter(Boolean).join("\n\n")
        || this.reasoningSummaries.get(id)?.filter(Boolean).join("\n\n");
      return {
        id,
        kind: "reasoning",
        label: done ? "Thought through the request" : "Thinking",
        detail: detail ? cleanDetail(detail) : undefined,
        done,
      };
    }

    if (item.type === "plan") {
      return { id, kind: "plan", label: done ? "Plan ready" : "Planning", detail: item.text, done };
    }

    if (item.type === "fileChange") {
      const files = item.changes?.map((change) => this.courseRelative(change.path)) ?? [];
      return {
        id,
        kind: "edit",
        label: done ? "Updated the course" : "Editing the course",
        file: files[0],
        detail: files.length > 1 ? `${files.length} files` : undefined,
        done,
      };
    }

    if (item.type === "commandExecution") {
      return {
        id,
        kind: "command",
        label: done ? "Ran a command" : "Running a command",
        detail: item.command ? cleanDetail(item.command) : undefined,
        done,
      };
    }

    if (item.type === "webSearch") {
      return {
        id,
        kind: "search",
        label: done ? "Searched the web" : "Searching the web",
        detail: item.query ? cleanDetail(item.query) : undefined,
        done,
      };
    }

    if (item.type === "mcpToolCall" || item.type === "dynamicToolCall") {
      const name = item.tool ? humanizeToolName(item.tool) : "tool";
      return {
        id,
        kind: "tool",
        label: done ? `Used ${name}` : `Using ${name}`,
        detail: item.server ? `via ${humanizeToolName(item.server)}` : undefined,
        done,
      };
    }

    if (item.type === "collabAgentToolCall") {
      return {
        id,
        kind: "tool",
        label: done ? "Finished delegated work" : "Delegating work",
        detail: item.prompt ? cleanDetail(item.prompt) : undefined,
        done,
      };
    }

    if (item.type === "subAgentActivity") {
      return { id, kind: "tool", label: done ? "Sub-agent finished" : "Sub-agent working", done };
    }

    if (item.type === "imageView") {
      return { id, kind: "tool", label: done ? "Inspected an image" : "Inspecting an image", file: item.path, done };
    }

    if (item.type === "imageGeneration") {
      return { id, kind: "tool", label: done ? "Generated an image" : "Generating an image", done };
    }

    if (item.type === "sleep") {
      return { id, kind: "tool", label: done ? "Wait finished" : "Waiting", done };
    }

    if (item.type === "contextCompaction") {
      return { id, kind: "reasoning", label: done ? "Context organized" : "Organizing context", done };
    }

    return null;
  }

  close() {
    this.peer?.shutdown();
    this.process?.kill();
    this.peer = null;
    this.process = null;
    this.threadId = null;
    this.conversationSnapshot = null;
    this.connecting = null;
    this.activeTurn = null;
    this.turnsWithDelta.clear();
    this.reasoningSummaries.clear();
    this.toolActivities.clear();
  }
}

export function conversationListParams(courseDirectory: string): ThreadListParams {
  return {
    cwd: courseDirectory,
    // Do not filter by source kind. Codex currently persists threads created by
    // this app-server client with a `vscode` source even though their originator
    // is `course_studio`; filtering for `appServer` hides intact conversations.
    sortKey: "updated_at",
    sortDirection: "desc",
    limit: 100,
  };
}

type ConversationSnapshot = {
  conversation: ConversationSummary;
  items: TranscriptItem[];
};

function snapshot(thread: import("./types").PersistedThread): ConversationSnapshot {
  return {
    conversation: toConversationSummary(thread),
    items: transcriptFromThread(thread),
  };
}

function toConversationSummary(thread: import("./types").PersistedThread): ConversationSummary {
  const firstRequest = extractLearnerRequest(thread.preview ?? "");
  return {
    id: thread.id,
    title: thread.name?.trim() || truncate(firstRequest || "New conversation", 56),
    createdAt: new Date(thread.createdAt * 1000).toISOString(),
    updatedAt: new Date(thread.updatedAt * 1000).toISOString(),
  };
}

export function transcriptFromThread(thread: import("./types").PersistedThread): TranscriptItem[] {
  const transcript: TranscriptItem[] = [];
  for (const turn of thread.turns) {
    const user = turn.items.find((item) => item.type === "userMessage");
    const prompt = user?.content?.find((input): input is Extract<UserInput, { type: "text" }> => input.type === "text")?.text;
    if (prompt) {
      transcript.push({
        kind: "user",
        id: user?.id ?? `user-${turn.id}`,
        text: extractLearnerRequest(prompt),
        selections: extractSelections(prompt),
      });
    }

    const messages = turn.items
      .filter((item) => item.type === "agentMessage" && item.text)
      .map((item) => item.text!.trim())
      .filter(Boolean);
    const activities = turn.items.flatMap(historicalActivity).slice(-16);
    if (messages.length || activities.length || turn.status !== "completed") {
      transcript.push({
        kind: "agent",
        id: `agent-${turn.id}`,
        text: messages.join("\n\n"),
        activities,
        failed: turn.status !== "completed",
      });
    }
  }
  return transcript;
}

export function extractLearnerRequest(prompt: string) {
  const match = /^Learner request:\s*\n([\s\S]*?)\n\nCourse context:/m.exec(prompt);
  return (match?.[1] ?? prompt).trim();
}

function extractSelections(prompt: string) {
  const selections: Array<{ kind?: "text" | "block"; tag: string; text: string }> = [];
  const pattern = /(?:Selection kind: (text|block)\n)?Location: [^\n]*\n(?:Page: [^\n]*\n)?Element: <([^>]+)>\n(?:Visible text|Exact quoted text): ([^\n]*)/g;
  for (const match of prompt.matchAll(pattern)) {
    selections.push({
      kind: match[1] === "text" || match[1] === "block" ? match[1] : undefined,
      tag: match[2],
      text: match[3] === "(no text)" ? "" : match[3],
    });
  }
  return selections;
}

function historicalActivity(item: import("./types").PersistedThreadItem): Activity[] {
  const id = item.id ?? `history-${item.type}`;
  if (item.type === "reasoning" && item.summary?.length) {
    return [{ id, kind: "reasoning", label: "Thought through the request", detail: cleanDetail(item.summary.join("\n\n")), done: true }];
  }
  if (item.type === "plan") return [{ id, kind: "plan", label: "Plan ready", detail: item.text, done: true }];
  if (item.type === "fileChange") {
    const files = item.changes?.map((change) => basename(change.path)) ?? [];
    return [{ id, kind: "edit", label: "Updated the course", file: files[0], detail: files.length > 1 ? `${files.length} files` : undefined, done: true }];
  }
  if (item.type === "commandExecution") return [{ id, kind: "command", label: "Ran a command", detail: item.command, done: true }];
  if (item.type === "webSearch") return [{ id, kind: "search", label: "Searched the web", detail: item.query, done: true }];
  if (item.type === "mcpToolCall" || item.type === "dynamicToolCall") {
    return [{ id, kind: "tool", label: `Used ${humanizeToolName(item.tool ?? "tool")}`, detail: item.server ? `via ${humanizeToolName(item.server)}` : undefined, done: true }];
  }
  return [];
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1).trimEnd()}…` : value;
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function cleanDetail(value: string) {
  return value.trim().replace(/\n{3,}/g, "\n\n");
}

function humanizeToolName(value: string) {
  const words = value
    .replace(/^mcp__/, "")
    .replace(/__/g, " · ")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "tool";
}

/** Turn process-level startup failures into instructions a learner can act on. */
export function describeStartupError(error: unknown, binary = "codex") {
  const raw = describe(error);
  const code = error && typeof error === "object" && "code" in error
    ? String((error as NodeJS.ErrnoException).code)
    : "";
  const missingBinary = code === "ENOENT" || (/\bENOENT\b/.test(raw) && raw.includes(binary));

  if (missingBinary) {
    return [
      "Codex CLI was not found.",
      "Open Terminal and install it:",
      "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
      "Then sign in:",
      "codex login",
      "Finally, stop and restart Course Studio with `npm run dev`.",
      "If Codex is already installed, set CODEX_BIN to its full path before starting the studio.",
    ].join("\n");
  }

  return raw || "Could not start Codex app-server.";
}
