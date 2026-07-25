// A minimal newline-delimited JSON-RPC peer. Codex `app-server` speaks JSONL
// over stdio: requests are `{id, method, params}`, responses `{id, result}` or
// `{id, error}`, and notifications omit `id`. Server-initiated requests (e.g.
// approval prompts) also carry an `id` *and* a `method`, and expect a reply.
//
// This class is transport-agnostic: give it a `write` sink and feed it raw
// bytes via `receive`. That keeps it unit-testable without spawning a process.

export interface JsonRpcError {
  code?: number;
  message: string;
  data?: unknown;
}

interface Pending {
  resolve: (result: unknown) => void;
  reject: (error: JsonRpcError) => void;
}

export type NotificationHandler = (method: string, params: unknown) => void;
export type ServerRequestHandler = (
  method: string,
  params: unknown,
) => unknown | Promise<unknown>;

export class JsonRpcPeer {
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number | string, Pending>();

  constructor(
    private readonly write: (line: string) => void,
    private readonly onNotification: NotificationHandler = () => {},
    private readonly onServerRequest: ServerRequestHandler = () => ({}),
  ) {}

  /** Send a request and await its response result. */
  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (r: unknown) => void, reject });
      this.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }

  /** Send a fire-and-forget notification. */
  notify(method: string, params?: unknown): void {
    this.write(JSON.stringify({ method, params }) + "\n");
  }

  /** Feed raw stdout bytes; complete JSON lines are dispatched. */
  receive(chunk: string): void {
    this.buffer += chunk;
    let index: number;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      if (line.trim()) this.dispatch(line);
    }
  }

  /** Reject every in-flight request — used when the process exits. */
  fail(message: string): void {
    for (const [, p] of this.pending) p.reject({ message });
    this.pending.clear();
  }

  private dispatch(line: string): void {
    let msg: {
      id?: number | string;
      method?: string;
      params?: unknown;
      result?: unknown;
      error?: JsonRpcError;
    };
    try {
      msg = JSON.parse(line);
    } catch {
      return; // ignore non-JSON log lines
    }

    // Response to one of our requests.
    if (msg.id != null && msg.method === undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(msg.error);
      else p.resolve(msg.result);
      return;
    }

    // Server-initiated request: run the handler and reply with its result.
    if (msg.id != null && msg.method) {
      Promise.resolve(this.onServerRequest(msg.method, msg.params))
        .then((result) => this.write(JSON.stringify({ id: msg.id, result }) + "\n"))
        .catch((err) =>
          this.write(
            JSON.stringify({ id: msg.id, error: { message: String(err) } }) + "\n",
          ),
        );
      return;
    }

    // Notification.
    if (msg.method) this.onNotification(msg.method, msg.params);
  }
}
