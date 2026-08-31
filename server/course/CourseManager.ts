import { execFile } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import chokidar, { type FSWatcher } from "chokidar";
import type { Checkpoint, CourseOutline, CoursePage, CoursePhase, CourseSection, Language } from "../../shared/protocol";

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

/** Long enough for a real course name, short enough to stay a name. */
export const MAX_COURSE_TITLE_LENGTH = 120;

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
    for (const path of ["syllabus.html", "syllabus.zh-CN.html", "index.html", "index.zh-CN.html"]) {
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
    const hasLesson = htmlFiles.some((file) => {
      const { kind } = parseFileIdentity(file.path, file.html);
      return kind === "lesson";
    });
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

    const parsedFiles = htmlFiles.map(({ path, html: pageHtml }) => {
      const { basePath, lang, kind } = parseFileIdentity(path, pageHtml);
      const page = deriveMeta(pageHtml);
      return {
        path,
        basePath,
        lang,
        kind,
        title: clean(metaContent(pageHtml, "course-page-title")) || (kind === "syllabus" ? "Syllabus" : page.title),
        sections: page.sections,
      };
    });

    const translationsByBasePath: Record<string, Record<string, string>> = {};
    const langSet = new Set<Language>();

    for (const item of parsedFiles) {
      if (!translationsByBasePath[item.basePath]) {
        translationsByBasePath[item.basePath] = {};
      }
      translationsByBasePath[item.basePath][item.lang] = item.path;
      langSet.add(item.lang);
    }

    const pages: CoursePage[] = parsedFiles
      .map((item) => ({
        path: item.path,
        basePath: item.basePath,
        lang: item.lang,
        kind: item.kind,
        title: item.title,
        translations: translationsByBasePath[item.basePath],
        sections: item.sections,
      }))
      .sort((left, right) => {
        const leftIsSyllabus = left.kind === "syllabus" || left.basePath === "syllabus.html" || left.basePath === "index.html";
        const rightIsSyllabus = right.kind === "syllabus" || right.basePath === "syllabus.html" || right.basePath === "index.html";
        if (leftIsSyllabus && !rightIsSyllabus) return -1;
        if (!leftIsSyllabus && rightIsSyllabus) return 1;
        if (left.basePath !== right.basePath) {
          return (left.basePath || left.path).localeCompare(right.basePath || right.path, undefined, { numeric: true });
        }
        if (left.lang === "en" && right.lang !== "en") return -1;
        if (left.lang !== "en" && right.lang === "en") return 1;
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
      availableLanguages: Array.from(langSet).sort(),
      pages,
      sections: derived.sections,
      upNext: strings(manifest.upNext),
    };
  }

  /**
   * Rename the course. The learner's title is stored as the `course.json`
   * override rather than written into the pages, so it survives every later
   * rewrite of the HTML by the agent, and the rest of the manifest is left
   * exactly as the agent wrote it.
   */
  async setTitle(title: unknown): Promise<string> {
    const next = clean(typeof title === "string" ? title : "").slice(0, MAX_COURSE_TITLE_LENGTH).trim();
    if (!next) throw new Error("A course title cannot be empty.");
    const manifest = await this.readManifest();
    await writeFile(
      join(this.courseDirectory, "course.json"),
      `${JSON.stringify({ ...manifest, title: next }, null, 2)}\n`,
      "utf8",
    );
    return next;
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

/** Parse language, base lesson path, and kind from a course file. */
export function parseFileIdentity(filename: string, html: string): {
  basePath: string;
  lang: Language;
  kind: "syllabus" | "lesson";
} {
  const langMatch = filename.match(/\.([a-zA-Z]{2}(?:-[a-zA-Z]{2,4})?)\.html$/i);
  let lang: Language = "en";
  let basePath = filename;

  if (langMatch) {
    const raw = langMatch[1].toLowerCase();
    lang = raw === "zh-cn" || raw === "zh" ? "zh-CN" : "en";
    basePath = filename.replace(/\.[a-zA-Z]{2}(?:-[a-zA-Z]{2,4})?\.html$/i, ".html");
  } else {
    const htmlLang = /<html\b[^>]*\blang=["']([^"']+)["']/i.exec(html)?.[1]?.toLowerCase();
    if (htmlLang && (htmlLang.startsWith("zh") || htmlLang === "zh-cn")) {
      lang = "zh-CN";
    } else {
      lang = "en";
    }
  }

  const isSyllabus = basePath === "syllabus.html" || basePath === "index.html";
  const declaredKind = metaContent(html, "course-studio-page");
  const kind = declaredKind === "syllabus" || (isSyllabus && declaredKind !== "lesson") ? "syllabus" : "lesson";

  return { basePath, lang, kind };
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
