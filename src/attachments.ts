import type { Attachment } from "./types";
import { uid } from "./ws";

/**
 * Screenshots the learner brings from outside the course: a confusing diagram, a
 * failing exercise, a photo of a textbook page. The composer accepts them from
 * the clipboard, a drop, or the file picker, and they travel with the next turn.
 */
export const MAX_ATTACHMENTS = 8;
/** Matches the server's cap, applied after any downscale. */
export const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
/** Long-edge ceiling. A retina screenshot stays readable well below it. */
export const MAX_ATTACHMENT_EDGE = 1600;

const SUPPORTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function isSupportedImage(file: { type: string; name?: string }) {
  if (SUPPORTED_TYPES.includes(file.type)) return true;
  // Some clipboard and drop sources hand over a blank type; trust the extension.
  return !file.type && /\.(png|jpe?g|webp|gif)$/i.test(file.name ?? "");
}

/** Pick the image files out of a clipboard or drop payload. */
export function imageFilesFrom(files: ArrayLike<File> | null | undefined): File[] {
  return Array.from(files ?? []).filter((file) => isSupportedImage(file));
}

/** Fit an image inside a square of `maxEdge`, keeping its aspect ratio. */
export function shrinkDimensions(width: number, height: number, maxEdge = MAX_ATTACHMENT_EDGE) {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0 || longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Roughly how many bytes a base64 data URL decodes to. */
export function dataUrlByteLength(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** A clipboard image arrives unnamed; give it something the agent can refer to. */
export function attachmentName(file: File) {
  if (file.name) return file.name.slice(0, 80);
  const extension = file.type === "image/jpeg" ? "jpg" : (file.type.split("/")[1] || "png");
  return `pasted-image-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
}

/**
 * Shrink an oversized screenshot in the browser so the turn stays small. Best
 * effort: anything the canvas cannot do leaves the original data URL alone.
 */
async function downscale(dataUrl: string): Promise<string> {
  if (typeof document === "undefined" || typeof Image === "undefined") return dataUrl;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not decode the image."));
      element.src = dataUrl;
    });
    const size = shrinkDimensions(image.naturalWidth, image.naturalHeight);
    if (size.width === image.naturalWidth && size.height === image.naturalHeight) return dataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;
    context.drawImage(image, 0, 0, size.width, size.height);
    const resized = canvas.toDataURL("image/png");
    return resized.length < dataUrl.length ? resized : dataUrl;
  } catch {
    return dataUrl;
  }
}

export type AttachmentResult = {
  attachments: Attachment[];
  /** Files the composer refused: wrong format, too large, or over the count. */
  rejected: number;
};

/**
 * Read dropped, pasted, or picked files into turn attachments, respecting the
 * room left by whatever is already attached.
 */
export async function readAttachments(files: ArrayLike<File>, alreadyAttached = 0): Promise<AttachmentResult> {
  const attachments: Attachment[] = [];
  let rejected = 0;

  for (const file of Array.from(files)) {
    if (!isSupportedImage(file)) {
      rejected++;
      continue;
    }
    if (alreadyAttached + attachments.length >= MAX_ATTACHMENTS) {
      rejected++;
      continue;
    }
    try {
      const dataUrl = await downscale(await readDataUrl(file));
      if (!dataUrl.startsWith("data:image/") || dataUrlByteLength(dataUrl) > MAX_ATTACHMENT_BYTES) {
        rejected++;
        continue;
      }
      attachments.push({ id: uid(), name: attachmentName(file), dataUrl });
    } catch {
      rejected++;
    }
  }

  return { attachments, rejected };
}
