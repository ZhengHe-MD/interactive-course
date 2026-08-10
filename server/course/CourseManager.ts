import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import chokidar, { type FSWatcher } from "chokidar";
import type { Checkpoint, CourseOutline, CoursePage, CoursePhase, CourseSection } from "../../shared/protocol";

const execFileAsync = promisify(execFile);

type ChangeListener = (path: string) => void;

/** What the studio shows before the course has been born. */
export const EMPTY_OUTLINE: CourseOutline = {
  phase: "empty",
  hasContent: false,
  title: "What will you learn?",
  topic: "New course",
  pages: [],
  sections: [],
  upNext: [],
};

/**
 * Optional, agent-written metadata. Nothing requires it, so every field is
 * treated as untrusted: the outline falls back to what the HTML itself says.
 */
type Manifest = {
  title?: unknown;
  topic?: unknown;
  upNext?: unknown;
};

/**
 * Owns one course's files and its git-backed timeline (DESIGN.md decisions 4 and
 * 9). Checkpoints are path-scoped commits in the course library repository, and revert is
 * forward-only — it restores the previous tree and commits that, so undo is
 * itself undoable and no history is ever rewritten.
 */
export class CourseManager {
  private watcher: FSWatcher | null = null;
  private listeners = new Set<ChangeListener>();

  constructor(
    readonly libraryRoot: string,
    readonly courseId: string,
  ) {}

  get courseDirectory() {
    return join(this.libraryRoot, this.courseId);
  }

  private get checkpointPrefix() {
    return `course(${this.courseId}):`;
  }

  private get legacyCheckpointPrefix() {
    return `course(courses/${this.courseId}):`;
  }

  private async git(args: string[]) {
    const { stdout } = await execFileAsync("git", args, {
      cwd: this.libraryRoot,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trim();
  }

  async isDirty() {
    return Boolean(await this.git(["status", "--porcelain", "--", this.courseId]));
  }

  /** The course's entry page, or null when the course has not been born yet. */
  private async readEntry(): Promise<string | null> {
    for (const path of ["syllabus.html", "index.html"]) {
      try {
        return await readFile(join(this.courseDirectory, path), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return null;
  }

  private async readManifest(): Promise<Manifest> {
    try {
      const raw = await readFile(join(this.courseDirectory, "course.json"), "utf8");
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Manifest) : {};
    } catch {
      return {};
    }
  }

  async getCoursePhase(): Promise<CoursePhase> {
    const [html, htmlFiles] = await Promise.all([this.readEntry(), this.readHtmlFiles()]);
    if (html === null) return "empty";
    const hasLesson = htmlFiles.some((file) => file.path !== "syllabus.html" && file.path !== "index.html");
    if (hasLesson) return "learning";
    return readPhase(html);
  }

  /**
   * Everything the studio chrome renders around the preview. Derived from the
   * course HTML so the agent never has to maintain a separate index, with an
   * optional `course.json` allowed to override the title and name lessons that
   * do not exist yet.
   */
  async getOutline(): Promise<CourseOutline> {
    const [html, manifest, htmlFiles] = await Promise.all([this.readEntry(), this.readManifest(), this.readHtmlFiles()]);
    if (html === null) return EMPTY_OUTLINE;

    const pages = htmlFiles
      .map(({ path, html: pageHtml }): CoursePage => {
        const page = deriveMeta(pageHtml);
        const declaredKind = metaContent(pageHtml, "course-studio-page");
        const kind = declaredKind === "lesson" || (path !== "index.html" && path !== "syllabus.html") ? "lesson" : "syllabus";
        return {
          path,
          kind,
          title: clean(metaContent(pageHtml, "course-page-title")) || (kind === "syllabus" ? "Syllabus" : page.title),
          sections: page.sections,
        };
      })
      .sort((left, right) => {
        if (left.path === "syllabus.html") return -1;
        if (right.path === "syllabus.html") return 1;
        if (left.path === "index.html") return -1;
        if (right.path === "index.html") return 1;
        return left.path.localeCompare(right.path, undefined, { numeric: true });
      });

    const rawPhase = readPhase(html);
    const hasLesson = pages.some((page) => page.kind === "lesson");
    const phase: CoursePhase = hasLesson || rawPhase === "learning" ? "learning" : rawPhase;
    const derived = deriveMeta(html);

    return {
      phase,
      hasContent: true,
      title: text(manifest.title) || derived.title,
      topic: text(manifest.topic) || derived.topic || (phase === "syllabus" ? "Proposed syllabus" : "Your course"),
      pages,
      sections: derived.sections,
      upNext: strings(manifest.upNext),
    };
  }

  private async readHtmlFiles() {
    try {
      const entries = await readdir(this.courseDirectory, { withFileTypes: true });
      const names = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
        .map((entry) => entry.name);
      return Promise.all(names.map(async (path) => ({ path, html: await readFile(join(this.courseDirectory, path), "utf8") })));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async createCheckpoint(label: string, options: { allowEmpty?: boolean } = {}): Promise<Checkpoint | null> {
    const dirty = await this.isDirty();
    if (!dirty && !options.allowEmpty) return null;

    if (dirty) await this.git(["add", "-A", "--", this.courseId]);
    const commitArgs = [
      "-c",
      "user.name=Course Studio",
      "-c",
      "user.email=course-studio@localhost",
      "commit",
      "-m",
      `${this.checkpointPrefix} ${label}`,
      ...(options.allowEmpty ? ["--allow-empty"] : []),
      // Before the interview produces syllabus.html, Git has no path matching the
      // course directory. `--only` creates a genuinely empty checkpoint and,
      // unlike an unscoped commit, cannot consume unrelated staged changes.
      ...(!dirty && options.allowEmpty ? ["--only"] : ["--", this.courseId]),
    ];
    await this.git(commitArgs);

    return (await this.listCheckpoints(1))[0] ?? null;
  }

  async listCheckpoints(limit = 12): Promise<Checkpoint[]> {
    try {
      await this.git(["rev-parse", "--verify", "HEAD"]);
    } catch {
      return [];
    }
    const [courseHistory, namedCheckpoints, legacyNamedCheckpoints, history] = await Promise.all([
      this.git(["log", "--format=%H", "--", this.courseId]),
      this.git(["log", "--format=%H", "--fixed-strings", `--grep=${this.checkpointPrefix}`]),
      this.git(["log", "--format=%H", "--fixed-strings", `--grep=${this.legacyCheckpointPrefix}`]),
      this.git(["rev-list", "--topo-order", "HEAD"]),
    ]);
    const candidates = new Set([
      ...courseHistory.split("\n"),
      ...namedCheckpoints.split("\n"),
      ...legacyNamedCheckpoints.split("\n"),
    ].filter(Boolean));
    const ids = history.split("\n").filter((id) => candidates.has(id)).slice(0, limit);
    const output = await Promise.all(ids.map((id) => this.git(["show", "-s", "--format=%H%x00%s%x00%cI", id])));

    return output.map((line) => {
      const [id, rawLabel, createdAt] = line.split("\0");
      return {
        id,
        label: [this.checkpointPrefix, this.legacyCheckpointPrefix].reduce(
          (label, prefix) => label.startsWith(prefix) ? label.slice(prefix.length).trim() : label,
          rawLabel,
        ),
        createdAt,
      };
    });
  }

  async revertLast(): Promise<Checkpoint | null> {
    const checkpoints = await this.listCheckpoints(2);
    const latest = checkpoints[0];
    const target = checkpoints[1];
    if (!latest || !target) return null;

    await this.git(["clean", "-fd", "--", this.courseId]);
    await this.git(["restore", `--source=${target.id}`, "--worktree", "--", this.courseId]);
    return this.createCheckpoint(`Reverted “${latest.label}”`, { allowEmpty: true });
  }

  watch() {
    if (this.watcher) return;
    this.watcher = chokidar.watch(this.courseDirectory, {
      ignoreInitial: true,
      ignored: /(^|[/\\])\../,
    });
    this.watcher.on("all", (_event, path) => {
      for (const listener of this.listeners) listener(path);
    });
  }

  onChange(listener: ChangeListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close() {
    await this.watcher?.close();
    this.watcher = null;
  }
}

/** Course phase, stored in the course itself so it survives a studio restart. */
export function readPhase(html: string): CoursePhase {
  const phaseTag = html.match(/<meta\b[^>]*\bname=["']course-studio-phase["'][^>]*>/i)?.[0];
  const phase = phaseTag?.match(/\bcontent=["'](syllabus|learning)["']/i)?.[1]?.toLowerCase();
  return phase === "syllabus" ? "syllabus" : "learning";
}

/**
 * Read a title, a topic, and a table of contents straight out of the course
 * page. Headings keep their `id` when they have one so the studio can scroll to
 * them precisely; the index is carried too, so id-less headings still navigate.
 */
export function deriveMeta(html: string): { title: string; topic: string; sections: CourseSection[] } {
  const metaTitle = metaContent(html, "course-title");
  const firstH1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const title = clean(metaTitle) || clean(firstH1) || clean(titleTag) || "Untitled course";

  const sections: CourseSection[] = [];
  const heading = /<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi;
  let match: RegExpExecArray | null;
  while ((match = heading.exec(html))) {
    const label = clean(match[2]);
    if (!label) continue;
    const id = /\bid\s*=\s*["']([^"']+)["']/i.exec(match[1])?.[1];
    sections.push({ id, index: sections.length, label });
  }

  return { title, topic: clean(metaContent(html, "course-topic")), sections };
}

function metaContent(html: string, name: string) {
  const tag = html.match(new RegExp(`<meta\\b[^>]*\\bname=["']${name}["'][^>]*>`, "i"))?.[0];
  return tag?.match(/\bcontent=["']([^"']*)["']/i)?.[1];
}

function clean(value: string | undefined) {
  return (value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

// The agent may write upNext as a string, an array, or not at all — normalize.
function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}
