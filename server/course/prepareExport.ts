import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { AgentConfig, Language } from "../../shared/protocol";
import { CodexClient } from "../codex/CodexClient";
import { CourseManager } from "./CourseManager";

export type PreparedExport = {
  courseDirectory: string;
  outline: Awaited<ReturnType<CourseManager["getOutline"]>>;
  cleanup: () => Promise<void>;
};

export function buildExportPreparationPrompt(instruction: string) {
  return `Prepare this temporary copy of a completed course for its final standalone export.

Export instruction from the learner:
${instruction.trim()}

This is an export-only working copy. You must edit the course files in this directory to realize the learner's instruction; do not merely describe what you would change in chat.

Requirements:
- Treat the instruction as applying to the finished course as a whole unless it clearly names a narrower scope. Inspect every HTML page and any supporting local assets that matter.
- Preserve the course's working interactions and visual coherence unless the instruction explicitly asks to change them.
- The exported artifact contains course material only. Do not add chat transcripts, learner questions, agent answers, selection markers, or commentary about the export process.
- Keep the course as plain HTML, CSS, and JavaScript with no build step and no external runtime requirement.
- You may edit existing pages, add a new summary or front-matter page, and update course.json when that best fulfills the instruction.
- Do not create the final bundled HTML yourself. Edit the course source files only; Course Studio will bundle them after you finish.
- Do not run git or create commits.

Finish only after the files themselves contain the requested export version.`;
}

export async function prepareCourseForExport(options: {
  sourceDirectory: string;
  instruction: string;
  agent?: AgentConfig;
  language?: Language;
}): Promise<PreparedExport> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "course-studio-export-"));
  const stagedDirectory = join(temporaryRoot, "course");
  const cleanup = async () => rm(temporaryRoot, { recursive: true, force: true });

  try {
    await cp(options.sourceDirectory, stagedDirectory, { recursive: true });
    const client = new CodexClient(stagedDirectory);
    try {
      const status = await client.connect();
      if (status.state !== "ready") throw new Error(status.message ?? "Codex is unavailable.");
      await client.newConversation({ ephemeral: true });

      const completion = new Promise<{ status: string; error?: string }>((resolve) => {
        client.once("turnCompleted", resolve);
      });
      const manager = new CourseManager(temporaryRoot, basename(stagedDirectory));
      const initialOutline = await manager.getOutline();
      await client.startTurn(buildExportPreparationPrompt(options.instruction), [], {
        coursePhase: initialOutline.phase,
        activePage: initialOutline.pages[0]?.path ?? "syllabus.html",
        agent: options.agent,
        language: options.language,
      });
      const result = await completion;
      if (result.status !== "completed") throw new Error(result.error ?? "The export preparation did not complete.");

      const outline = await manager.getOutline();
      if (!outline.hasContent) throw new Error("The export preparation removed all course content.");
      return { courseDirectory: stagedDirectory, outline, cleanup };
    } finally {
      client.removeAllListeners();
      client.close();
    }
  } catch (error) {
    await cleanup();
    throw error;
  }
}
