import { describe, it, expect, vi } from "vitest";
import { JsonRpcPeer } from "../server/codex/JsonRpcPeer.ts";

function makePeer(
  onNotification = vi.fn(),
  onServerRequest = vi.fn(async () => ({ decision: "accept" })),
) {
  const written: string[] = [];
  const peer = new JsonRpcPeer((line) => written.push(line), onNotification, onServerRequest);
  return { peer, written, onNotification, onServerRequest };
}

describe("JsonRpcPeer", () => {
  it("matches a response to its request by id", async () => {
    const { peer, written } = makePeer();
    const p = peer.request("initialize", { a: 1 });
    const sent = JSON.parse(written[0]);
    expect(sent.method).toBe("initialize");
    expect(sent.id).toBe(1);
    peer.receive(JSON.stringify({ id: 1, result: { ok: true } }) + "\n");
    await expect(p).resolves.toEqual({ ok: true });
  });

  it("rejects on an error response", async () => {
    const { peer, written } = makePeer();
    const p = peer.request("thread/start");
    const id = JSON.parse(written[0]).id;
    peer.receive(JSON.stringify({ id, error: { message: "nope" } }) + "\n");
    await expect(p).rejects.toMatchObject({ message: "nope" });
  });

  it("dispatches notifications (no id) to the handler", () => {
    const { peer, onNotification } = makePeer();
    peer.receive(JSON.stringify({ method: "item/agentMessage/delta", params: { delta: "hi" } }) + "\n");
    expect(onNotification).toHaveBeenCalledWith("item/agentMessage/delta", { delta: "hi" });
  });

  it("answers server-initiated requests with the handler result", async () => {
    const { peer, written, onServerRequest } = makePeer();
    peer.receive(
      JSON.stringify({ id: 7, method: "item/fileChange/requestApproval", params: {} }) + "\n",
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(onServerRequest).toHaveBeenCalled();
    const reply = JSON.parse(written[written.length - 1]);
    expect(reply.id).toBe(7);
    expect(reply.result).toEqual({ decision: "accept" });
  });

  it("reassembles messages split across chunk boundaries", async () => {
    const { peer } = makePeer();
    const p = peer.request("ping");
    const line = JSON.stringify({ id: 1, result: 42 }) + "\n";
    peer.receive(line.slice(0, 5));
    peer.receive(line.slice(5));
    await expect(p).resolves.toBe(42);
  });

  it("ignores non-JSON log noise", () => {
    const { peer, onNotification } = makePeer();
    expect(() => peer.receive("thread 'main' panicked\n")).not.toThrow();
    expect(onNotification).not.toHaveBeenCalled();
  });

  it("fails all pending requests when the process dies", async () => {
    const { peer } = makePeer();
    const p = peer.request("whatever");
    peer.fail("exited");
    await expect(p).rejects.toMatchObject({ message: "exited" });
  });
});
