import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import chokidar, { type FSWatcher } from "chokidar";
import type { Checkpoint } from "../../shared/protocol";

const execFileAsync = promisify(execFile);

type ChangeListener = (path: string) => void;

export type CoursePhase = "empty" | "syllabus" | "learning";

export class CourseManager {
  private watcher: FSWatcher | null = null;
  private listeners = new Set<ChangeListener>();

  constructor(
    readonly repositoryRoot: string,
    readonly courseRelativePath: string,
  ) {}

  get courseDirectory() {
    return `${this.repositoryRoot}/${this.courseRelativePath}`;
  }

  private get checkpointPrefix() {
    return `course(${this.courseRelativePath}):`;
  }

  private async git(args: string[]) {
    const { stdout } = await execFileAsync("git", args, {
      cwd: this.repositoryRoot,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trim();
  }

  async isDirty() {
    return Boolean(await this.git(["status", "--porcelain", "--", this.courseRelativePath]));
  }

  async getCoursePhase(): Promise<CoursePhase> {
    try {
      const html = await readFile(join(this.courseDirectory, "index.html"), "utf8");
      const phaseTag = html.match(/<meta\b[^>]*\bname=["']course-studio-phase["'][^>]*>/i)?.[0];
      const phase = phaseTag?.match(/\bcontent=["'](syllabus|learning)["']/i)?.[1]?.toLowerCase();
      return phase === "syllabus" ? "syllabus" : "learning";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "empty";
      throw error;
    }
  }

  async createCheckpoint(label: string, options: { allowEmpty?: boolean } = {}): Promise<Checkpoint | null> {
    const dirty = await this.isDirty();
    if (!dirty && !options.allowEmpty) return null;

    if (dirty) await this.git(["add", "-A", "--", this.courseRelativePath]);
    const commitArgs = [
      "-c",
      "user.name=Course Studio",
      "-c",
      "user.email=course-studio@localhost",
      "commit",
      "-m",
      `${this.checkpointPrefix} ${label}`,
      ...(options.allowEmpty ? ["--allow-empty"] : []),
      "--",
      this.courseRelativePath,
    ];
    await this.git(commitArgs);

    return (await this.listCheckpoints(1))[0] ?? null;
  }

  async listCheckpoints(limit = 12): Promise<Checkpoint[]> {
    const [courseHistory, namedCheckpoints, history] = await Promise.all([
      this.git(["log", "--format=%H", "--", this.courseRelativePath]),
      this.git(["log", "--format=%H", "--fixed-strings", `--grep=${this.checkpointPrefix}`]),
      this.git(["rev-list", "--topo-order", "HEAD"]),
    ]);
    const candidates = new Set([...courseHistory.split("\n"), ...namedCheckpoints.split("\n")].filter(Boolean));
    const ids = history.split("\n").filter((id) => candidates.has(id)).slice(0, limit);
    const output = await Promise.all(ids.map((id) => this.git(["show", "-s", "--format=%H%x00%s%x00%cI", id])));

    return output.map((line) => {
      const [id, rawLabel, createdAt] = line.split("\0");
      return {
        id,
        label: rawLabel.startsWith(this.checkpointPrefix)
          ? rawLabel.slice(this.checkpointPrefix.length).trim()
          : rawLabel,
        createdAt,
      };
    });
  }

  async revertLast(): Promise<Checkpoint | null> {
    const checkpoints = await this.listCheckpoints(2);
    const latest = checkpoints[0];
    const target = checkpoints[1];
    if (!latest || !target) return null;

    await this.git(["clean", "-fd", "--", this.courseRelativePath]);
    await this.git(["restore", `--source=${target.id}`, "--worktree", "--", this.courseRelativePath]);
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
