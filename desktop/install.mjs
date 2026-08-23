// Copies the packaged app into /Applications.
//
// Nothing here needs elevated permissions or an Apple account: an app you built
// locally carries no quarantine attribute, so macOS launches it directly.

import { access, cp, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = join(root, ".desktop/release");
const appName = "Course Studio.app";

const candidates = [];
for (const entry of await readdir(releaseDir, { withFileTypes: true }).catch(() => [])) {
  if (!entry.isDirectory() || !entry.name.startsWith("mac")) continue;
  const candidate = join(releaseDir, entry.name, appName);
  if (await access(candidate).then(() => true, () => false)) candidates.push(candidate);
}

if (candidates.length === 0) {
  console.error(`No packaged app found under ${releaseDir}. Run: npm run desktop:pack`);
  process.exit(1);
}

const target = join("/Applications", appName);
await rm(target, { recursive: true, force: true });
await cp(candidates[0], target, { recursive: true, verbatimSymlinks: true });
console.log(`Installed ${target}`);
