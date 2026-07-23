import type { Selection } from "../../shared/protocol";
import type { CoursePhase } from "./CourseManager";

export type SelectionContext = Selection;

export function buildCoursePrompt(
  message: string,
  selections: SelectionContext[],
  options: { coursePhase?: CoursePhase } = {},
) {
  const request = message.trim() || "Explain the selected part differently.";
  const context = selections.length
    ? selections
        .map(
          (selection, index) => `Selection ${index + 1}
Location: ${selection.location}
Element: <${selection.tag}>
Visible text: ${selection.text || "(no text)"}
Rendered HTML:
${selection.outerHTML}`,
        )
        .join("\n\n---\n\n")
    : "No element was selected. Infer the best place in the course for this request.";

  const coursePhase = options.coursePhase ?? "learning";
  const courseState = coursePhase === "empty"
    ? `Course state — interview:
This course directory has no index.html yet. You are conducting course birth from a blank page. If the learner has only named a topic, do not create files yet: ask a compact set of questions about their goal, desired depth, current background, and time budget. Keep that interview response in chat. Once the conversation contains enough direction, create only a syllabus as index.html from scratch. Mark it with <meta name="course-studio-phase" content="syllabus">. Do not create lesson files or full lesson content yet. Do not copy a sample course or use a starter template.`
    : coursePhase === "syllabus"
      ? `Course state — syllabus:
The interview produced a syllabus, but lesson generation has not begun. Refine the syllabus in place from learner feedback. Do not create lesson files until the learner explicitly approves the syllabus and asks to begin. Then create only the first lesson they need now, change the phase meta tag to content="learning", and leave later lessons as syllabus entries to generate lazily.`
      : `Course state — learning:
The learner is working through an existing course. Improve the current material in place. Generate a new lesson only when the learner reaches or explicitly requests it; create only that next lesson, never the remaining course in advance.`;

  return `Learner request:
${request}

Course context:
${context}

${courseState}

Default to editing the course files so substantive answers live in the course, not only in chat. If the learner explicitly asks for a chat-only or meta answer, respect that request and leave the course unchanged. Preserve working interactions and the course's visual language. Use only plain HTML, CSS, and JavaScript; this course has no build step. Do not run git or create commits—the studio checkpoints the result. Finish with a brief learner-facing note describing what changed and where.`;
}

export function selectionInputs(selections: SelectionContext[]) {
  return selections
    .filter((selection) => selection.screenshot?.startsWith("data:image/"))
    .map((selection) => ({ type: "image" as const, url: selection.screenshot! }));
}
