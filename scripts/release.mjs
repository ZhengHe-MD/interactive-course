// Cuts a release: bumps the version, tags it, pushes it.
//
// The tag is the trigger. `.github/workflows/release.yml` watches `v*`, and
// publishing is entirely its job — everything here is guard rails around
// `npm version` plus one push, so a release cannot be cut from a stale branch,
// a dirty tree, or a red test run.
//
//   npm run release -- patch          2.3.4 -> 2.3.5
//   npm run release -- minor          2.3.4 -> 2.4.0
//   npm run release -- major          2.3.4 -> 3.0.0
//   npm run release -- 1.0.0          an exact version
//   npm run release -- patch --dry-run

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const options = { cwd: root, encoding: "utf8" };

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipChecks = args.includes("--skip-checks");
const bump = args.find((arg) => !arg.startsWith("--"));

/** Captures stdout; used for the questions we ask git before deciding anything. */
const git = (...argv) => execFileSync("git", argv, options).trim();
/** Streams to the terminal; used for the steps that change something. */
const run = (command, argv) => execFileSync(command, argv, { ...options, stdio: "inherit" });

function fail(message, hint) {
  console.error(`\n${message}`);
  if (hint) console.error(hint);
  process.exit(1);
}

if (!bump || !/^(patch|minor|major|\d+\.\d+\.\d+)$/.test(bump)) {
  fail(
    "Usage: npm run release -- <patch|minor|major|x.y.z> [--dry-run] [--skip-checks]",
    "Releases are cut from a version tag; this picks the version and pushes the tag.",
  );
}

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch !== "main") {
  fail(`Releases are cut from main, and you are on ${branch}.`, "Merge first, then release from main.");
}

if (git("status", "--porcelain")) {
  fail("The working tree has uncommitted changes.", "Commit or stash them so the tag points at something reproducible.");
}

git("fetch", "origin", "main", "--tags");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
  fail("main and origin/main have diverged.", "Pull or push so the tag matches what CI will build.");
}

// CI runs these too, but finding out here costs a minute instead of a tag that
// has to be deleted and re-cut.
if (!skipChecks && !dryRun) {
  run("npm", ["run", "typecheck"]);
  run("npm", ["test"]);
}

const current = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;

if (dryRun) {
  console.log(`\nWould release ${current} -> ${bump} from main:`);
  console.log(`  npm version ${bump} -m "release: v%s"`);
  console.log("  git push --follow-tags origin main");
  process.exit(0);
}

// npm version writes package.json and package-lock.json, commits both, and
// creates the vX.Y.Z tag.
run("npm", ["version", bump, "-m", "release: v%s"]);
const released = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;

run("git", ["push", "--follow-tags", "origin", "main"]);

// git@github.com:owner/repo.git and https://github.com/owner/repo.git both
// reduce to owner/repo.
const slug = git("remote", "get-url", "origin").replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");
console.log(`\nReleased v${released}. The desktop build starts now:`);
console.log(`  https://github.com/${slug}/actions/workflows/release.yml`);
console.log(`  https://github.com/${slug}/releases/tag/v${released}`);
