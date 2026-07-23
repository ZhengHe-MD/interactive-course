import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { JsonRpcPeer } from "../server/codex/JsonRpcPeer";

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("JsonRpcPeer", () => {
  it("correlates responses and forwards notifications", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const peer = new JsonRpcPeer(input, output, vi.fn());
    const written: string[] = [];
    output.on("data", (chunk) => written.push(chunk.toString()));
    const notification = vi.fn();
    peer.on("notification", notification);

    const pending = peer.request<{ ok: true }>("thread/start", { cwd: "/course" });
    await tick();
    const request = JSON.parse(written.join("").trim());
    input.write(`${JSON.stringify({ id: request.id, result: { ok: true } })}\n`);
    input.write(`${JSON.stringify({ method: "turn/started", params: { id: "turn-1" } })}\n`);

    await expect(pending).resolves.toEqual({ ok: true });
    await tick();
    expect(notification).toHaveBeenCalledWith("turn/started", { id: "turn-1" });
  });

  it("answers requests initiated by app-server", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const peer = new JsonRpcPeer(input, output, async (method) => ({ decision: method.includes("fileChange") ? "accept" : "decline" }));
    const written: string[] = [];
    output.on("data", (chunk) => written.push(chunk.toString()));

    input.write(`${JSON.stringify({ id: 9, method: "item/fileChange/requestApproval", params: {} })}\n`);
    await tick();

    expect(JSON.parse(written.join("").trim())).toEqual({ id: 9, result: { decision: "accept" } });
    peer.shutdown();
  });
});
