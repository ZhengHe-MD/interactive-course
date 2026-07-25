import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { JsonRpcPeer } from "./JsonRpcPeer.ts";
import type {
  AgentMessageDelta,
  ErrorNotification,
  InitializeParams,
  ItemNotification,
  ThreadItem,
  ThreadStartParams,
  ThreadStartResponse,
  TurnCompletedNotification,
  TurnStartParams,
  UserInput,
} from "./types.ts";

export type { UserInput };

/** Live events for a single turn, mapped 1:1 onto studio WebSocket messages. */
export interface TurnEvents {
  onDelta(itemId: string, text: string): void;
  onMessage(itemId: string, text: string): void;
  onActivity(id: string, kind: "reasoning" | "edit" | "command" | "search", label: string): void;
  onActivityDone(id: string): void;
  onError(message: string): void;
}

export interface AgentStatus {
  ready: boolean;
  detail: string;
}

/**
 * The thin seam over Codex `app-server` (DESIGN.md decision 3). It owns the
 * child process and the JSON-RPC handshake, and exposes exactly what the studio
 * needs: start a per-course thread, run a turn with streamed events, interrupt.
 * Nothing above this class knows the wire protocol.
 */
export class CodexClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private peer: JsonRpcPeer | null = null;
  private status: AgentStatus = { ready: false, detail: "Not started" };
  private active: { events: TurnEvents; done: (status: string) => void } | null = null;

  constructor(private readonly codexPath = process.env.CODEX_BIN || "codex") {}

  getStatus(): AgentStatus {
    return this.status;
  }

  /** Spawn the app-server and complete the initialize handshake. Never throws. */
  async start(): Promise<AgentStatus> {
    try {
      const child = spawn(this.codexPath, ["app-server"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.child = child;

      const peer = new JsonRpcPeer(
        (line) => child.stdin.write(line),
        (method, params) => this.onNotification(method, params),
        (method) => this.onServerRequest(method),
      );
      this.peer = peer;

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => peer.receive(chunk));
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", () => {
        /* app-server logs to stderr; noisy and non-fatal, so we drop it */
      });
      child.on("exit", (code) => {
        this.status = { ready: false, detail: `Codex exited (code ${code ?? "?"})` };
        peer.fail("Codex app-server exited");
        this.active?.done("failed");
        this.active = null;
      });
      child.on("error", (err) => {
        this.status = { ready: false, detail: `Cannot start Codex: ${err.message}` };
      });

      const init: InitializeParams = {
        clientInfo: { name: "course-studio", title: "Course Studio", version: "0.1.0" },
        capabilities: null,
      };
      await peer.request("initialize", init);
      peer.notify("initialized");
      this.status = { ready: true, detail: "Connected to Codex" };
    } catch (err) {
      this.status = {
        ready: false,
        detail: `Cannot start Codex: ${(err as Error).message}`,
      };
    }
    return this.status;
  }

  /** Open a conversation rooted at the course directory. */
  async startThread(cwd: string, baseInstructions: string): Promise<string> {
    if (!this.peer) throw new Error("Codex is not running");
    const params: ThreadStartParams = {
      cwd,
      sandbox: "workspace-write",
      approvalPolicy: "never",
      baseInstructions,
    };
    const res = (await this.peer.request("thread/start", params)) as ThreadStartResponse;
    return res.thread.id;
  }

  /** Run one turn, streaming events, resolving when the turn completes. */
  async runTurn(
    threadId: string,
    input: UserInput[],
    events: TurnEvents,
  ): Promise<string> {
    if (!this.peer) throw new Error("Codex is not running");
    return new Promise<string>((resolve) => {
      this.active = { events, done: (status) => resolve(status) };
      const params: TurnStartParams = { threadId, input };
      this.peer!.request("turn/start", params).catch((err) => {
        events.onError(String((err as { message?: string })?.message ?? err));
        this.finishTurn("failed");
      });
    });
  }

  async interrupt(threadId: string): Promise<void> {
    try {
      await this.peer?.request("turn/interrupt", { threadId });
    } catch {
      /* best effort */
    }
  }

  dispose(): void {
    this.child?.kill();
    this.child = null;
    this.peer = null;
  }

  private finishTurn(status: string): void {
    const active = this.active;
    this.active = null;
    active?.done(status);
  }

  private onNotification(method: string, params: unknown): void {
    const events = this.active?.events;
    switch (method) {
      case "item/agentMessage/delta": {
        const p = params as AgentMessageDelta;
        events?.onDelta(p.itemId, p.delta);
        break;
      }
      case "item/started": {
        const item = (params as ItemNotification).item;
        this.reportActivity(item, events);
        break;
      }
      case "item/completed": {
        const item = (params as ItemNotification).item;
        if (item.type === "agentMessage" && "text" in item && item.id) {
          events?.onMessage(item.id, item.text);
        }
        if (item.id) events?.onActivityDone(item.id);
        break;
      }
      case "turn/completed": {
        const p = params as TurnCompletedNotification;
        this.finishTurn(p.turn.status || "completed");
        break;
      }
      case "error": {
        const p = params as ErrorNotification;
        events?.onError(p.error?.message ?? p.message ?? "Codex reported an error");
        break;
      }
      default:
        break;
    }
  }

  private reportActivity(item: ThreadItem, events?: TurnEvents): void {
    if (!events || !item.id) return;
    switch (item.type) {
      case "reasoning":
        events.onActivity(item.id, "reasoning", "Thinking");
        break;
      case "fileChange": {
        const change = "changes" in item ? item.changes[0] : undefined;
        const name = change ? basename(change.path) : "the lesson";
        events.onActivity(item.id, "edit", `Editing ${name}`);
        break;
      }
      case "commandExecution":
        events.onActivity(item.id, "command", "Running a command");
        break;
      case "webSearch":
        events.onActivity(item.id, "search", "Searching the web");
        break;
      default:
        break;
    }
  }

  // Auto-approve everything: the thread is sandboxed to the course dir and the
  // apply/undo story is git checkpoints, not per-patch prompts (decision 9).
  private onServerRequest(method: string): unknown {
    if (method.endsWith("requestApproval")) return { decision: "accept" };
    return {};
  }
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}
