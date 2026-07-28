import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function resolveCourseLibraryRoot(
  studioRepositoryRoot: string,
  environment: Record<string, string | undefined> = process.env,
  userHome = homedir(),
) {
  const libraryRoot = canonicalPath(environment.COURSE_STUDIO_LIBRARY || join(userHome, ".courses"));
  const studioRoot = canonicalPath(studioRepositoryRoot);
  if (contains(studioRoot, libraryRoot) || contains(libraryRoot, studioRoot)) {
    throw new Error("COURSE_STUDIO_LIBRARY must be outside the Course Studio repository.");
  }
  return libraryRoot;
}

function contains(parent: string, candidate: string) {
  const path = relative(parent, candidate);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

/** Resolves symlinks through the nearest ancestor when the final path does not exist yet. */
function canonicalPath(path: string) {
  let existing = resolve(path);
  const missing: string[] = [];
  while (true) {
    try {
      return resolve(realpathSync(existing), ...missing.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(existing);
      if (parent === existing) throw error;
      missing.push(basename(existing));
      existing = parent;
    }
  }
}

/** Creates an independent checkpoint repository for learner-owned material. */
export async function ensureCourseLibrary(libraryRoot: string) {
  await mkdir(libraryRoot, { recursive: true });
  try {
    await access(join(libraryRoot, ".git"));
  } catch {
    await execFileAsync("git", ["init", "-q", "--initial-branch=main"], { cwd: libraryRoot });
  }
}
