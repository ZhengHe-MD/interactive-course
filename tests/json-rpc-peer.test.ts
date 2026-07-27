import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { JsonRpcPeer } from "../server/codex/JsonRpcPeer";

const tick = () => new Promise((resolve) => setImmediate(resolve));

function makePeer(handleServerRequest = vi.fn()) {
  const input = new PassThrough();
  const output = new PassThrough();
  const peer = new JsonRpcPeer(input, output, handleServerRequest);
  const written: string[] = [];
  output.on("data", (chunk) => written.push(chunk.toString()));
  const frames = () => written.join("").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return { peer, input, frames };
}

describe("JsonRpcPeer", () => {
  it("correlates responses and forwards notifications", async () => {
    const { peer, input, frames } = makePeer();
    const notification = vi.fn();
    peer.on("notification", notification);

    const pending = peer.request<{ ok: true }>("thread/start", { cwd: "/course" });
    await tick();
    input.write(`${JSON.stringify({ id: frames()[0].id, result: { ok: true } })}\n`);
    input.write(`${JSON.stringify({ method: "turn/started", params: { id: "turn-1" } })}\n`);

    await expect(pending).resolves.toEqual({ ok: true });
    await tick();
    expect(notification).toHaveBeenCalledWith("turn/started", { id: "turn-1" });
  });

  it("rejects when app-server answers with an error", async () => {
    const { peer, input, frames } = makePeer();
    const pending = peer.request("turn/start");
    await tick();
    input.write(`${JSON.stringify({ id: frames()[0].id, error: { code: -32602, message: "bad input" } })}\n`);
    await expect(pending).rejects.toThrow("bad input");
  });

  it("answers requests initiated by app-server", async () => {
    const { peer, input, frames } = makePeer(
      vi.fn(async (method: string) => ({ decision: method.includes("fileChange") ? "accept" : "decline" })),
    );

    input.write(`${JSON.stringify({ id: 9, method: "item/fileChange/requestApproval", params: {} })}\n`);
    await tick();

    expect(frames()).toEqual([{ id: 9, result: { decision: "accept" } }]);
    peer.shutdown();
  });

  it("reports a failing request handler back to app-server instead of hanging it", async () => {
    const { peer, input, frames } = makePeer(
      vi.fn(() => {
        throw new Error("unsupported");
      }),
    );

    input.write(`${JSON.stringify({ id: 4, method: "something/unknown", params: {} })}\n`);
    await tick();

    expect(frames()[0]).toMatchObject({ id: 4, error: { message: "unsupported" } });
    peer.shutdown();
  });

  it("ignores non-JSON log noise on stdout", async () => {
    const { peer, input } = makePeer();
    const notification = vi.fn();
    const diagnostic = vi.fn();
    peer.on("notification", notification);
    peer.on("diagnostic", diagnostic);

    input.write("thread 'main' panicked at src/main.rs\n");
    await tick();

    expect(notification).not.toHaveBeenCalled();
    expect(diagnostic).toHaveBeenCalled();
  });

  it("fails pending requests when the app-server goes away", async () => {
    const { peer } = makePeer();
    const pending = peer.request("turn/start");
    peer.shutdown(new Error("Codex app-server stopped."));
    await expect(pending).rejects.toThrow("Codex app-server stopped.");
  });

  it("times out a request that is never answered", async () => {
    vi.useFakeTimers();
    try {
      const { peer } = makePeer();
      const pending = peer.request("initialize", {}, 50);
      const settled = expect(pending).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(60);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });
});
