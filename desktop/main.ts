// Electron shell for Course Studio.
//
// The studio is a local web app: an Express + WebSocket server that spawns the
// Codex CLI, shells out to git, and owns the course library on disk. This shell
// hosts that same server in-process so the app is a double-click instead of a
// terminal, and points a window at it. The browser client is unchanged and
// stays a peer: if a server is already listening, the window attaches to it
// rather than starting a second one.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { BrowserWindow, Menu, app, dialog, session, shell } from "electron";
import { isExternalLink, isStudioUrl } from "./navigation";

const DEFAULT_PORT = Number(process.env.COURSE_STUDIO_PORT ?? 4310);
const APP_NAME = "Course Studio";

type WindowState = { width: number; height: number; x?: number; y?: number; maximized?: boolean };

const DEFAULT_WINDOW: WindowState = { width: 1440, height: 900 };

/**
 * A GUI-launched app inherits a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`),
 * which is missing every place `codex` is normally installed. Ask the user's
 * login shell what PATH it really uses, then fall back to the usual suspects.
 */
async function resolveUserPath() {
  const marker = "__COURSE_STUDIO_PATH__";
  const loginShell = process.env.SHELL;
  if (loginShell && process.platform !== "win32") {
    try {
      const stdout = await new Promise<string>((resolvePath, reject) => {
        const child = execFile(
          loginShell,
          ["-ilc", `printf '%s%s' '${marker}' "$PATH"`],
          { timeout: 5_000, env: { ...process.env, TERM: "dumb" } },
          (error, out) => (error ? reject(error) : resolvePath(out)),
        );
        child.stdin?.end();
      });
      const start = stdout.lastIndexOf(marker);
      const found = start === -1 ? "" : stdout.slice(start + marker.length).trim();
      if (found) process.env.PATH = found;
    } catch {
      // An unusual shell or a slow profile is not worth failing over; the
      // static fallback below still covers the common install locations.
    }
  }

  const home = homedir();
  const fallbacks = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(home, ".local/bin"),
    join(home, ".bun/bin"),
    join(home, ".cargo/bin"),
    join(home, ".volta/bin"),
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];
  const entries = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const candidate of fallbacks) {
    if (!entries.includes(candidate) && existsSync(candidate)) entries.push(candidate);
  }
  process.env.PATH = entries.join(delimiter);
}

/**
 * Pin the agent to an absolute path via the seam CodexClient already exposes,
 * so a spawn cannot miss it even if the environment shifts underneath us.
 */
async function resolveCodexBinary() {
  if (process.env.CODEX_BIN) return;
  try {
    const found = await new Promise<string>((resolveBin, reject) => {
      execFile("/usr/bin/env", ["sh", "-c", "command -v codex"], { timeout: 5_000 }, (error, out) =>
        error ? reject(error) : resolveBin(out.trim()),
      );
    });
    if (found) process.env.CODEX_BIN = found;
  } catch {
    // Leave CODEX_BIN unset: the studio surfaces "Codex is unavailable" in the
    // UI, which is a better place to report this than a startup dialog.
  }
}

async function serverAlreadyRunning(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

/**
 * esbuild rewrites a literal `import()` when it emits CommonJS, which would
 * turn this into a `require()` of an ES module. Building the import through
 * `Function` keeps it a real dynamic import at runtime.
 */
const importModule = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<{ startServer(): Promise<{ port: number }>; shutdown(): Promise<void> }>;

let stopServer: (() => Promise<void>) | null = null;

async function startEmbeddedServer(port: number) {
  process.env.COURSE_STUDIO_EMBEDDED = "1";
  process.env.COURSE_STUDIO_PORT = String(port);
  // .mjs because the packaged app is CommonJS; the server bundle is ESM.
  const entry = join(app.getAppPath(), "server", "index.mjs");
  const module = await importModule(`file://${entry}`);
  const { port: listening } = await module.startServer();
  stopServer = () => module.shutdown();
  return listening;
}

function windowStatePath() {
  return join(app.getPath("userData"), "window-state.json");
}

async function readWindowState(): Promise<WindowState> {
  try {
    const saved = JSON.parse(await readFile(windowStatePath(), "utf8")) as WindowState;
    if (typeof saved.width === "number" && typeof saved.height === "number") {
      return { ...DEFAULT_WINDOW, ...saved };
    }
  } catch {
    // First launch, or a state file we can no longer read.
  }
  return DEFAULT_WINDOW;
}

async function writeWindowState(window: BrowserWindow) {
  try {
    const bounds = window.getNormalBounds();
    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(
      windowStatePath(),
      JSON.stringify({ ...bounds, maximized: window.isMaximized() }, null, 2),
    );
  } catch {
    // Losing window geometry is not worth interrupting a quit.
  }
}

/** Confines the shell to the studio origin and sends every other link outward. */
function keepNavigationInside(window: BrowserWindow, origin: string) {
  const openExternally = (url: string) => {
    if (isExternalLink(url)) void shell.openExternal(url);
  };

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isStudioUrl(url, origin)) return;
    event.preventDefault();
    openExternally(url);
  });

  window.webContents.on("will-frame-navigate", (event) => {
    if (isStudioUrl(event.url, origin)) return;
    event.preventDefault();
    openExternally(event.url);
  });
}

/** Course exports and packages arrive as downloads; give them a real save dialog. */
function handleDownloads() {
  session.defaultSession.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({
      title: "Save course export",
      defaultPath: join(app.getPath("downloads"), item.getFilename()),
    });
    item.once("done", (_done, state) => {
      if (state === "completed") shell.showItemInFolder(item.getSavePath());
    });
  });
}

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      { role: "windowMenu" },
      {
        role: "help",
        submenu: [
          {
            label: "Course Library in Finder",
            click: () => {
              void shell.openPath(process.env.COURSE_STUDIO_LIBRARY || join(homedir(), ".courses"));
            },
          },
        ],
      },
    ]),
  );
}

async function createWindow(url: string) {
  const state = await readWindowState();
  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 640,
    title: APP_NAME,
    backgroundColor: "#f5ead8",
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  if (state.maximized) window.maximize();
  keepNavigationInside(window, new URL(url).origin);
  window.once("ready-to-show", () => window.show());
  window.on("close", () => void writeWindowState(window));
  await window.loadURL(url);
  return window;
}

async function main() {
  app.setName(APP_NAME);
  await app.whenReady();

  const override = process.env.COURSE_STUDIO_DESKTOP_URL;
  let url = override ?? `http://127.0.0.1:${DEFAULT_PORT}`;

  if (!override) {
    await resolveUserPath();
    await resolveCodexBinary();
    try {
      const port = (await serverAlreadyRunning(DEFAULT_PORT))
        ? DEFAULT_PORT
        : await startEmbeddedServer(DEFAULT_PORT);
      url = `http://127.0.0.1:${port}`;
    } catch (error) {
      dialog.showErrorBox(
        "Course Studio could not start",
        error instanceof Error ? error.message : String(error),
      );
      app.quit();
      return;
    }
  }

  buildMenu();
  handleDownloads();
  await createWindow(url);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow(url);
  });
}

app.on("window-all-closed", () => app.quit());

app.on("before-quit", () => {
  const stop = stopServer;
  stopServer = null;
  void stop?.();
});

void main();
