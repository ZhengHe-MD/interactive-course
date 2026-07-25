import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import type { Checkpoint, CourseState, LessonSection } from "../../shared/protocol.ts";

const exec = promisify(execFile);

interface Manifest {
  title?: string;
  lessonTag?: string;
  lessonMeta?: string;
  entry?: string;
  sections?: LessonSection[];
  upNext?: string[];
}

/**
 * Owns a single course's files and its git-backed timeline (DESIGN.md
 * decisions 4 & 9). A course starts life *empty* — no lesson yet — and is born
 * when the agent writes its first files in response to what the learner wants
 * to study (decision 10). Metadata is read from an optional `course.json`, and
 * otherwise derived from the lesson HTML itself, so no schema is imposed on the
 * agent. Every successful turn is one commit; revert is a one-step reset.
 */
export class CourseManager {
  readonly dir: string;
  private manifest: Manifest | null = null;

  constructor(
    private readonly templateDir: string | null,
    workspaceRoot: string,
    readonly id: string,
  ) {
    this.dir = path.join(workspaceRoot, id);
  }

  /** Create the workspace (seeding from a template if one exists) and its repo. */
  async init(): Promise<void> {
    if (!(await pathExists(this.dir))) {
      await fs.mkdir(this.dir, { recursive: true });
      if (this.templateDir && (await pathExists(this.templateDir))) {
        await fs.cp(this.templateDir, this.dir, { recursive: true });
      }
    }
    if (!(await pathExists(path.join(this.dir, ".git")))) {
      await this.git(["init", "-q"]);
      await this.git(["add", "-A"]);
      const { stdout } = await this.git(["status", "--porcelain"]);
      const born = stdout.trim().length > 0;
      await this.commitAllowingIdentity(
        born
          ? ["commit", "-q", "-m", "Course created"]
          : ["commit", "-q", "--allow-empty", "-m", "New course"],
      );
    }
    await this.loadManifest();
  }

  private async loadManifest(): Promise<void> {
    try {
      const raw = await fs.readFile(path.join(this.dir, "course.json"), "utf8");
      this.manifest = JSON.parse(raw) as Manifest;
    } catch {
      this.manifest = null; // no manifest — we'll derive from the HTML
    }
  }

  entryFile(): string {
    return this.manifest?.entry ?? "index.html";
  }

  private async readEntryHtml(): Promise<string | null> {
    try {
      return await fs.readFile(path.join(this.dir, this.entryFile()), "utf8");
    } catch {
      return null;
    }
  }

  /** The full studio-facing snapshot: metadata, TOC, and the timeline. The
   *  manifest is agent-written, so treat every field defensively. */
  async getState(): Promise<CourseState> {
    const m = this.manifest;
    const html = await this.readEntryHtml();
    const derived = html ? deriveMeta(html) : null;
    return {
      id: this.id,
      title: str(m?.title) || derived?.title || "New course",
      lessonTag: str(m?.lessonTag),
      lessonMeta: str(m?.lessonMeta),
      sections: validSections(m?.sections) ?? derived?.sections ?? [],
      upNext: toStringArray(m?.upNext),
      checkpoints: await this.listCheckpoints(),
      hasContent: html !== null,
    };
  }

  async listCheckpoints(): Promise<Checkpoint[]> {
    const { stdout } = await this.git(["log", "--reverse", "--format=%H%x1f%s"]);
    const lines = stdout.split("\n").filter(Boolean);
    return lines.map((line, i) => {
      const [sha, label] = line.split("\x1f");
      return { sha, label: label ?? "Checkpoint", seed: i === 0 };
    });
  }

  /** Commit any pending changes as one checkpoint. Returns false if none. */
  async checkpoint(label: string): Promise<boolean> {
    await this.git(["add", "-A"]);
    const { stdout } = await this.git(["status", "--porcelain"]);
    if (!stdout.trim()) return false;
    await this.commitAllowingIdentity(["commit", "-q", "-m", label]);
    await this.loadManifest(); // the agent may have written/changed course.json
    return true;
  }

  /** Step back one checkpoint. Returns false if only the seed remains. */
  async revert(): Promise<boolean> {
    const checkpoints = await this.listCheckpoints();
    if (checkpoints.length <= 1) return false;
    await this.git(["reset", "--hard", "-q", "HEAD~1"]);
    await this.loadManifest();
    return true;
  }

  private git(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return exec("git", args, { cwd: this.dir, maxBuffer: 1024 * 1024 * 16 });
  }

  // Commit even on machines without a configured git identity (fresh CI, etc.).
  private commitAllowingIdentity(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return exec("git", args, {
      cwd: this.dir,
      maxBuffer: 1024 * 1024 * 16,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || "Course Studio",
        GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || "studio@localhost",
        GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || "Course Studio",
        GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || "studio@localhost",
      },
    });
  }
}

/** Derive a title and a table of contents straight from the lesson HTML. */
export function deriveMeta(html: string): { title: string; sections: LessonSection[] } {
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const firstH1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const title = clean(titleTag) || clean(firstH1) || "Untitled lesson";

  const sections: LessonSection[] = [];
  const heading = /<(h1|h2)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = heading.exec(html))) {
    const id = /\bid\s*=\s*["']([^"']+)["']/i.exec(match[2])?.[1];
    const label = clean(match[3]);
    if (id && label) sections.push({ id, label });
  }
  return { title, sections };
}

function clean(s: string | undefined): string {
  return (s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// The agent may write upNext as a string, an array, or omit it — normalize all.
function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function validSections(v: unknown): LessonSection[] | null {
  if (!Array.isArray(v)) return null;
  const ok = v.filter(
    (s): s is LessonSection =>
      !!s && typeof s.id === "string" && typeof s.label === "string",
  );
  return ok.length ? ok : null;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
