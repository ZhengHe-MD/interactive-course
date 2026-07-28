import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CoursePhase, CourseSection, Language, Selection } from "../../shared/protocol";
import type { UserInput } from "../codex/types";

export type SelectionContext = Selection;

export function buildCoursePrompt(
  message: string,
  selections: SelectionContext[],
  options: { coursePhase?: CoursePhase; activePage?: string; activeSection?: CourseSection; language?: Language } = {},
) {
  const request = message.trim() || "Explain the selected part differently.";
  const selectionContext = selections.length
    ? selections
        .map(
          (selection, index) => `Selection ${index + 1}
Selection kind: ${selection.kind ?? "block"}
Location: ${selection.location}
Page: ${selection.page ?? options.activePage ?? "syllabus.html"}
Element: <${selection.tag}>
${selection.kind === "text" ? "Exact quoted text" : "Visible text"}: ${selection.text || "(no text)"}
Rendered HTML:
${selection.outerHTML}`,
        )
        .join("\n\n---\n\n")
    : "No element was selected. Infer the best place in the course for this request.";
  const activePage = options.activePage ?? selections[0]?.page ?? "syllabus.html";
  const readingContext = options.activeSection
    ? `Page: ${activePage}\nNearest section: ${options.activeSection.label}\nSection location: ${options.activeSection.id ? `#${options.activeSection.id}` : `h2 index ${options.activeSection.index}`}`
    : `Page: ${activePage}\nNearest section: (no section identified)`;

  const coursePhase = options.coursePhase ?? "learning";
  const language = options.language ?? "en";
  const languageName = language === "zh-CN" ? "Simplified Chinese" : "English";
  const languageInstruction = `Language preference:
The learner selected ${languageName} (${language}) for this turn. Reply in ${languageName}. Write newly created course content in ${languageName} and set new pages to <html lang="${language}">. Preserve learner-authored text, quotations, code, filenames, commands, API names, and proper nouns when translating them would reduce accuracy. Do not translate or rewrite existing course material merely because the Studio language changed; preserve an existing page's established language unless the learner explicitly asks to translate it. If the learner explicitly requests a different output language, follow that request.`;
  const courseState = coursePhase === "empty"
    ? `Course state — interview:
This course directory has no syllabus.html or legacy index.html yet. You are conducting course birth from a blank page. If the learner has only named a topic, do not create files yet: ask a compact set of questions about their goal, desired depth, current background, and time budget. Keep that interview response in chat. Once the conversation contains enough direction, create only a syllabus as syllabus.html from scratch. Mark it with <meta name="course-studio-phase" content="syllabus"> and <meta name="course-studio-page" content="syllabus">. Do not create session files or full lesson content yet. Do not copy a sample course or use a starter template.`
    : coursePhase === "syllabus"
      ? `Course state — syllabus:
The interview produced a syllabus in syllabus.html (or index.html in a legacy course), but lesson generation has not begun. Refine that syllabus file in place from learner feedback. Do not create session files until the learner explicitly approves the syllabus and asks to begin. Then preserve the syllabus file permanently: change only its course-studio-phase meta tag to content="learning" and do not remove or replace its syllabus content. Create only the first lesson as session1.html beside it, marked with <meta name="course-studio-page" content="lesson"> and a concise concept title such as <meta name="course-page-title" content="Becoming human through practice">. Leave later lessons as syllabus entries or course.json upNext items to generate lazily.`
      : `Course state — learning:
The learner is working through a multi-page course. syllabus.html (or index.html in a legacy course) is the permanent syllabus and must never be repurposed or overwritten with lesson content. Each generated session lives in its own sibling file named session1.html, session2.html, and so on, marked with course-studio-page="lesson" and a short course-page-title. The learner is currently viewing ${options.activePage ?? "syllabus.html"}; use that page when their request refers to what they are reading. Improve existing material in its own file. Generate a new session only when the learner reaches or explicitly requests it; create only that next session, never the remaining course in advance, and never replace an earlier session.`;

  return `Learner request:
${request}

Course context:
Reading position when the learner sent this request:
${readingContext}

Attached selection context:
${selectionContext}

${languageInstruction}

${courseState}

Treat every selection as reference context, not as authorization to edit. Decide the response from the learner's explicit request:
- If they ask a question, request an explanation, ask "why", or ask you to elaborate, answer fully in chat and do not modify course files.
- Edit the course only when they explicitly ask to change, add, remove, rewrite, update, fix, create, or apply something to the course.
- If their intent is ambiguous, answer in chat and offer to apply the answer to the course; do not make a speculative edit.

When editing, preserve working interactions and the course's visual language. Use only plain HTML, CSS, and JavaScript; this course has no build step. Do not run git or create commits—the studio checkpoints actual file changes. If you edited, finish with a brief learner-facing note describing what changed and where. If you did not edit, give the learner the useful answer directly without claiming the course changed.`;
}

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/;

export type SelectionImages = {
  inputs: UserInput[];
  /** Removes the temp files. Safe to call more than once. */
  cleanup: () => Promise<void>;
};

/**
 * Turn selection screenshots into turn inputs. `app-server` takes images as
 * paths on disk, so each data URL is written to a short-lived temp file that the
 * caller disposes of once the turn has been accepted.
 */
export async function writeSelectionImages(selections: SelectionContext[]): Promise<SelectionImages> {
  const shots = selections
    .map((selection) => IMAGE_DATA_URL.exec(selection.screenshot ?? ""))
    .filter((match): match is RegExpExecArray => Boolean(match));

  if (shots.length === 0) return { inputs: [], cleanup: async () => {} };

  const directory = await mkdtemp(join(tmpdir(), "course-studio-"));
  const inputs: UserInput[] = [];
  for (const [index, shot] of shots.entries()) {
    const extension = shot[1] === "jpg" ? "jpeg" : shot[1];
    const path = join(directory, `selection-${index + 1}.${extension}`);
    await writeFile(path, Buffer.from(shot[2], "base64"));
    inputs.push({ type: "localImage", path });
  }

  return {
    inputs,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
