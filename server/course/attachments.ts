import type { Attachment, Language } from "../../shared/protocol";

/**
 * Learner-supplied images arrive over the same WebSocket as the prompt, so the
 * studio decides here what it is willing to hand to Codex: how many, how large,
 * and in what formats. The browser applies the same limits before sending, but
 * the server never trusts that — a frame can come from anywhere.
 */
export const MAX_ATTACHMENTS = 8;
export const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;

export type DecodedImage = { extension: string; bytes: Buffer };

/** Decode a base64 image data URL, or `null` when it is not one we accept. */
export function parseImageDataUrl(value: string | undefined): DecodedImage | null {
  const match = IMAGE_DATA_URL.exec((value ?? "").replace(/\s+/g, ""));
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ATTACHMENT_BYTES) return null;
  return { extension: match[1] === "jpg" ? "jpeg" : match[1], bytes };
}

/** A file name that is safe to print in a prompt and to use on disk. */
export function safeAttachmentName(name: unknown, fallback: string) {
  const raw = typeof name === "string" ? name : "";
  const cleaned = raw
    .replace(/[\r\n\t]/g, " ")
    .replace(/[/\\]/g, "-")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

/**
 * Keep the attachments the studio can actually send, and report how many were
 * dropped so the learner is told rather than left wondering.
 */
export function sanitizeAttachments(raw: unknown): { attachments: Attachment[]; rejected: number } {
  if (!Array.isArray(raw)) return { attachments: [], rejected: 0 };

  const attachments: Attachment[] = [];
  let rejected = 0;
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== "object") {
      rejected++;
      continue;
    }
    const entry = candidate as Record<string, unknown>;
    const dataUrl = typeof entry.dataUrl === "string" ? entry.dataUrl.replace(/\s+/g, "") : "";
    if (!parseImageDataUrl(dataUrl)) {
      rejected++;
      continue;
    }
    if (attachments.length >= MAX_ATTACHMENTS) {
      rejected++;
      continue;
    }
    attachments.push({
      id: typeof entry.id === "string" && entry.id ? entry.id.slice(0, 120) : `attachment-${attachments.length + 1}`,
      name: safeAttachmentName(entry.name, `image-${attachments.length + 1}`),
      dataUrl,
    });
  }
  return { attachments, rejected };
}

/**
 * Learner-facing notices about images that did not make it. They travel on the
 * server's `system` channel, so they are written here in both first-class
 * languages rather than in the browser catalog (docs/language-policy.md).
 */
export function attachmentsDroppedNotice(count: number, language?: Language) {
  return language === "zh-CN"
    ? `有 ${count} 张图片无法发送：格式不受支持，或文件过大。`
    : `${count} attached image${count === 1 ? "" : "s"} could not be sent — unsupported format, or too large.`;
}

/** Codex accepted the words but refused the pictures. */
export function imagesRejectedNotice(attachmentCount: number, language?: Language) {
  if (attachmentCount > 0) {
    return language === "zh-CN"
      ? "Codex 拒绝了附带的图片，已只发送文字内容。"
      : "Sent your message without its images — Codex rejected them.";
  }
  return language === "zh-CN"
    ? "Codex 拒绝了这张截图，已只发送你选中的内容。"
    : "Sent your selection without its screenshot — Codex rejected the image.";
}
