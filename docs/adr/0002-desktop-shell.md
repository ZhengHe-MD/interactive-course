# 0002: Electron Desktop Shell as a Second Client

## Context and Decision

DESIGN.md decision 2 chose a local web app on `localhost` with no desktop shell, on the reasoning that a browser gives identical capability at zero packaging cost, and that the studio could be "wrapped in Tauri later if ever". The deferred desktop shell sat in the open branches list.

Dogfounding surfaced the cost that decision deferred: every session begins with a terminal and `npm start`, and the studio has to be manually restarted after every reboot. The friction is in launching, not in the browser.

We decided to:

1. **Add an Electron shell as an additional client, not a replacement.** The web client is unchanged and remains fully supported. The shell hosts the same Express + WebSocket server in the Electron main process and points a `BrowserWindow` at it.
2. **Attach to an already-running server instead of starting a second one.** On launch the shell probes `GET /api/health` on the studio port. If a server answers, the window attaches to it; otherwise the shell starts one in-process. A browser tab and the desktop window are then peer clients of a single server and a single course library, which keeps checkpoints and the Codex session coherent.
3. **Reject Pake and other URL-wrapper tools.** They wrap a URL in a system WebView and ship no Node runtime, so they cannot host the server, spawn `codex`, or reach the course library. They solve the window, which was never the missing piece.
4. **Choose Electron over Tauri.** Electron's main process is Node, so the server moves in with one seam (`COURSE_STUDIO_EMBEDDED`) and subprocess work keeps functioning unchanged. Tauri would still have to ship a Node runtime as a sidecar to run the same server, so most of the size advantage disappears while Rust becomes a build requirement for anyone building from source.
5. **Ship no prebuilt binaries.** The app is built from source and ad-hoc signed. See `docs/desktop-app.md` for the code-signing reasoning.

## Considered Options

- **Option 1: Pake or another WebView wrapper**: Rejected. Ships no Node runtime; the window is not the hard part.
- **Option 2: Tauri v2 with a Node sidecar**: Rejected for now. Matches the original DESIGN.md lean and produces a smaller shell, but still ships a Node runtime, adds sidecar process-lifecycle wiring, and requires a Rust toolchain to build. Reconsider if bundle size becomes a real constraint.
- **Option 3: A `launchd` agent plus Safari's "Add to Dock"**: Rejected as the primary answer. It is genuinely cheap and needs no new dependencies, but it produces no distributable `.app`, so it does not let anyone else build the desktop client from source. It remains a reasonable fallback for a single machine.
- **Option 4: Electron with the server as a separate child process**: Rejected as unnecessary. In-process hosting is simpler, and a fatal server error is reported through a startup dialog rather than a silent blank window.

## Consequences

- The studio gains a build step and a packaging toolchain (`esbuild`, `electron-builder`), but courses still have none — DESIGN.md decision 4 is untouched.
- `server/index.ts` only auto-starts when `COURSE_STUDIO_EMBEDDED` is unset, so `npm start` and `npm run dev` behave exactly as before.
- A GUI-launched app inherits a minimal `PATH` that excludes every usual `codex` install location. The shell resolves the login shell's `PATH` at startup and pins `CODEX_BIN` to an absolute path.
- Course pages are agent-generated HTML. The shell confines navigation to the studio origin and sends outbound links to the real browser, so a course page can never navigate the shell itself.
- DESIGN.md decision 2 is amended and the "Desktop shell (Tauri)" open branch is resolved.
