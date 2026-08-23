import { pinyin } from "pinyin-pro";
import type { AgentConfig } from "../../shared/protocol";

export interface SlugCodexClient {
  translateTopicToSlug?(
    topic: string,
    options?: { agent?: AgentConfig; timeoutMs?: number },
  ): Promise<string | null>;
}

export function isCourseId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

export function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54)
    .replace(/-+$/g, "");
}

export function hasNonAscii(value: string): boolean {
  return /[^\u0000-\u007F]/.test(value);
}

export function pinyinSlug(value: string, maxWords = 8): string {
  try {
    const py = pinyin(value, { toneType: "none", nonZh: "consecutive" });
    const words = py
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const candidate = words.slice(0, maxWords).join("-");
    return slug(candidate);
  } catch {
    return "";
  }
}

export async function generateCourseSlug(
  topic: string,
  options: {
    codex?: SlugCodexClient | null;
    agent?: AgentConfig;
    timeoutMs?: number;
  } = {},
): Promise<string> {
  const asciiSlug = slug(topic);
  if (!hasNonAscii(topic) && asciiSlug.length >= 2) {
    return asciiSlug;
  }

  // Tier 1: Try LLM semantic translation via Codex if available
  if (options.codex?.translateTopicToSlug) {
    try {
      const translated = await options.codex.translateTopicToSlug(topic, {
        agent: options.agent,
        timeoutMs: options.timeoutMs,
      });
      if (translated && isCourseId(translated)) {
        return translated;
      }
    } catch {
      // Fallback to pinyin below
    }
  }

  // Tier 2: Pinyin transliteration fallback
  const pinyinResult = pinyinSlug(topic);
  if (pinyinResult && isCourseId(pinyinResult)) {
    return pinyinResult;
  }

  // Tier 3: Base fallback
  return asciiSlug || "course";
}
