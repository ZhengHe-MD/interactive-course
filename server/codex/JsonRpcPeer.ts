import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

type RpcId = number | string;
type RpcMessage = {
  id?: RpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export type ServerRequestHandler = (method: string, params: unknown) => Promise<unknown> | unknown;

export class JsonRpcPeer extends EventEmitter {
  private nextId = 1;
  private pending = new Map<RpcId, PendingRequest>();
  private closed = false;

  constructor(
    input: Readable,
    private output: Writable,
    private handleServerRequest: ServerRequestHandler,
  ) {
    super();
    const lines = createInterface({ input });
    lines.on("line", (line) => void this.receive(line));
    lines.on("close", () => this.shutdown(new Error("Codex app-server closed its output.")));
  }

  request<T>(method: string, params: unknown = {}, timeoutMs = 30_000): Promise<T> {
    if (this.closed) return Promise.reject(new Error("Codex app-server is not connected."));
    const id = this.nextId++;
    this.write({ id, method, params });
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (result: unknown) => void, reject, timeout });
    });
  }

  notify(method: string, params: unknown = {}) {
    if (!this.closed) this.write({ method, params });
  }

  private write(message: RpcMessage) {
    this.output.write(`${JSON.stringify(message)}\n`);
  }

  private async receive(line: string) {
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      this.emit("diagnostic", `Ignored invalid app-server output: ${line.slice(0, 240)}`);
      return;
    }

    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.id !== undefined && message.method) {
      try {
        const result = await this.handleServerRequest(message.method, message.params);
        this.write({ id: message.id, result });
      } catch (error) {
        this.write({
          id: message.id,
          error: { code: -32603, message: error instanceof Error ? error.message : "Client request failed" },
        });
      }
      return;
    }

    if (message.method) this.emit("notification", message.method, message.params);
  }

  shutdown(error = new Error("Codex app-server connection closed.")) {
    if (this.closed) return;
    this.closed = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
    this.emit("close", error);
  }
}
