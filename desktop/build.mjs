// Stages a self-contained Electron app under .desktop/app.
//
// The layout mirrors the source tree on purpose: the server resolves its own
// assets, the built client, and the course library relative to its file
// location, so keeping `server/` next to `dist/` means zero packaging-specific
// paths in server code.

import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stage = join(root, ".desktop/app");
const resources = join(root, ".desktop/resources");

const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
// The dev shell points at the Vite server, so it needs the Electron entry only.
const shellOnly = process.argv.includes("--shell-only");

async function bundle(entry, outfile, format) {
  await build({
    entryPoints: [join(root, entry)],
    outfile: join(stage, outfile),
    bundle: true,
    platform: "node",
    format,
    target: "node22",
    sourcemap: true,
    // Electron supplies its own runtime; everything else is bundled so the
    // packaged app carries no node_modules resolution at startup.
    external: ["electron"],
    // Express's dependency chain reaches for Node builtins through a runtime
    // `require`, which does not exist in an ES module. esbuild's own shim
    // defers to a real `require` when one is in scope, so provide one.
    banner:
      format === "esm"
        ? {
            js: [
              'import { createRequire as __createRequire } from "node:module";',
              "const require = __createRequire(import.meta.url);",
            ].join("\n"),
          }
        : undefined,
    logLevel: "info",
  });
}

/** Builds a macOS .icns from the vector brand mark. */
async function buildIcon() {
  if (process.platform !== "darwin") return;
  const source = join(root, "public/brand/app-icon.svg");
  const work = await mkdtemp(join(tmpdir(), "course-studio-icon-"));
  const iconset = join(work, "icon.iconset");
  await mkdir(iconset, { recursive: true });

  const sizes = [16, 32, 64, 128, 256, 512, 1024];
  await Promise.all(
    sizes.map((size) =>
      run("sips", ["-s", "format", "png", "-Z", String(size), source, "--out", join(iconset, `${size}.png`)]),
    ),
  );
  // iconutil wants the Apple naming convention, where each @2x is the next size up.
  const names = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];
  await Promise.all(names.map(([size, name]) => cp(join(iconset, `${size}.png`), join(iconset, name))));
  await Promise.all(sizes.map((size) => rm(join(iconset, `${size}.png`))));

  await mkdir(resources, { recursive: true });
  await run("iconutil", ["-c", "icns", iconset, "-o", join(resources, "icon.icns")]);
  await rm(work, { recursive: true, force: true });
}

await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });

// CommonJS for the Electron entry (the best-supported main-process format);
// ESM for the server, which relies on import.meta.url to find its own assets.
await bundle("desktop/main.ts", "desktop/main.js", "cjs");

if (!shellOnly) {
  await bundle("server/index.ts", "server/index.mjs", "esm");

  await cp(join(root, "dist"), join(stage, "dist"), { recursive: true });
  await cp(join(root, "server/assets"), join(stage, "server/assets"), { recursive: true });

  // The server serves html2canvas to the preview iframe straight out of
  // node_modules; keep that one file at the path it expects.
  const html2canvas = join(stage, "node_modules/html2canvas");
  await mkdir(join(html2canvas, "dist"), { recursive: true });
  await cp(
    join(root, "node_modules/html2canvas/dist/html2canvas.min.js"),
    join(html2canvas, "dist/html2canvas.min.js"),
  );
  await writeFile(
    html2canvas + "/package.json",
    `${JSON.stringify({ name: "html2canvas", version: pkg.dependencies.html2canvas, main: "dist/html2canvas.min.js" }, null, 2)}\n`,
  );
}

await writeFile(
  join(stage, "package.json"),
  `${JSON.stringify(
    {
      name: "course-studio",
      productName: "Course Studio",
      version: pkg.version,
      description: "Co-design personalized interactive HTML courses with a coding agent.",
      main: "desktop/main.js",
      type: "commonjs",
      dependencies: { html2canvas: pkg.dependencies.html2canvas },
      // electron-builder reads the runtime version it should package from here.
      devDependencies: { electron: pkg.devDependencies.electron },
    },
    null,
    2,
  )}\n`,
);

if (!shellOnly) await buildIcon();

console.log(`Staged ${shellOnly ? "desktop shell" : "desktop app"} in ${stage}`);
