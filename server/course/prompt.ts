import type { Selection } from "../../shared/protocol.ts";

/**
 * Build the text of a Codex turn from the learner's message and an optional
 * element selection. The screenshot (when present) is attached separately as an
 * image input; here we compose the words. Kept pure so it is easy to test.
 */
export function buildTurnText(message: string, selection?: Selection | null): string {
  const trimmed = message.trim();
  if (!selection) return trimmed;

  const parts: string[] = [];
  if (trimmed) parts.push(trimmed);

  parts.push(
    [
      "",
      "--- Selected element (the part of the lesson I'm pointing at) ---",
      `Location: ${selection.locationHint}`,
      "HTML snippet:",
      "```html",
      selection.snippet.trim(),
      "```",
      selection.screenshot
        ? "A screenshot of this element (as it currently renders) is attached."
        : "",
      "Edit this region of the course to address my message above.",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return parts.join("\n");
}

/** A short, human-readable checkpoint label derived from the learner's message. */
export function checkpointLabel(message: string, selection?: Selection | null): string {
  const base = message.trim().replace(/\s+/g, " ");
  const label = base || (selection ? `Edit ${selection.tag}` : "Update");
  return label.length > 48 ? label.slice(0, 47).trimEnd() + "…" : label;
}
