import type { Selection } from "../../shared/protocol";

export type SelectionContext = Selection;

export function buildCoursePrompt(message: string, selections: SelectionContext[]) {
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

  return `Learner request:
${request}

Course context:
${context}

Default to editing the course files so substantive answers live in the course, not only in chat. If the learner explicitly asks for a chat-only or meta answer, respect that request and leave the course unchanged. Preserve working interactions and the course's visual language. Use only plain HTML, CSS, and JavaScript; this course has no build step. Do not run git or create commits—the studio checkpoints the result. Finish with a brief learner-facing note describing what changed and where.`;
}

export function selectionInputs(selections: SelectionContext[]) {
  return selections
    .filter((selection) => selection.screenshot?.startsWith("data:image/"))
    .map((selection) => ({ type: "image" as const, url: selection.screenshot! }));
}
