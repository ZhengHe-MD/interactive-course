import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import type { CourseOutline, Language } from "../../shared/protocol";
import { readStoredConversations } from "./conversations";

type ExportPage = { path: string; title: string; html: string };
type AssetBase = { kind: "file" | "url"; value: string };

const HTTP_URL = /^https?:\/\//i;
const SKIP_URL = /^(?:data:|blob:|mailto:|tel:|javascript:|#)/i;

const copy = {
  en: {
    eyebrow: "A course co-designed through learning",
    contents: "Course contents",
    previous: "Previous",
    next: "Next",
    standalone: "Standalone course export",
    companionTitle: "Co-Design Notes & Q&A",
    companionToggle: "Co-Design Notes",
    companionClose: "Close",
    companionEmpty: "No co-design conversations recorded for this course.",
    reasoningTitle: "Design Rationale",
    learnerPrompt: "Learner",
    agentResponse: "AI Mentor",
    sessionFallback: "Session",
  },
  "zh-CN": {
    eyebrow: "一门在学习过程中共同设计的课程",
    contents: "课程内容",
    previous: "上一页",
    next: "下一页",
    standalone: "独立课程导出",
    companionTitle: "共同设计对话与问答",
    companionToggle: "共同设计对话",
    companionClose: "关闭",
    companionEmpty: "此课程暂无共同设计对话记录。",
    reasoningTitle: "设计思路与考量",
    learnerPrompt: "学习者",
    agentResponse: "AI 导师",
    sessionFallback: "会话",
  },
} as const;

export async function buildStandaloneCourse(options: {
  courseDirectory: string;
  outline: CourseOutline;
  language: Language;
  exportedAt?: Date;
}) {
  const { courseDirectory, outline, language } = options;
  const labels = copy[language];
  const [pages, storedConversations] = await Promise.all([
    Promise.all(outline.pages.map(async (page) => ({
      path: page.path,
      title: page.title,
      html: await inlinePageAssets(
        await readFile(join(courseDirectory, page.path), "utf8"),
        courseDirectory,
        dirname(join(courseDirectory, page.path)),
      ),
    }))),
    readStoredConversations(courseDirectory),
  ]);
  if (!pages.length) throw new Error("This course has no HTML pages to export.");

  const exportedAt = options.exportedAt ?? new Date();
  const date = exportedAt.toISOString().slice(0, 10);
  const title = outline.title || pages[0].title;
  const summary = outline.topic || `${labels.standalone}: ${title}`;
  const data = scriptJson({ pages, conversations: storedConversations.conversations, labels });

  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="date" content="${sanitizeMeta(date)}">
  <meta name="summary" content="${sanitizeMeta(summary)}">
  <meta name="description" content="${sanitizeMeta(summary)}">
  <meta name="course-studio-export" content="1">
  <title>${sanitizeMeta(title)}</title>
  <style>${exportShellCss}</style>
</head>
<body>
<div class="cs-export-shell cs-app">
  <header class="cs-topbar">
    <div class="cs-topbar-brand">
      <span class="cs-brand-badge">COURSE</span>
      <span class="cs-brand-name">${escapeHtml(title)}</span>
      <span class="cs-crumb-sep">/</span>
      <span id="cs-page-title" class="cs-current-crumb"></span>
    </div>
    <div class="cs-topbar-actions">
      <div class="cs-pager-group">
        <button id="cs-previous" class="cs-btn-icon" type="button" aria-label="${escapeAttribute(labels.previous)}" title="${escapeAttribute(labels.previous)}">←</button>
        <span id="cs-pager-status" class="cs-pager-status"></span>
        <button id="cs-next" class="cs-btn-icon" type="button" aria-label="${escapeAttribute(labels.next)}" title="${escapeAttribute(labels.next)}">→</button>
      </div>
      <button id="cs-companion-toggle" class="cs-companion-btn" type="button">
        <span>💬</span>
        <span class="cs-btn-label">${escapeHtml(labels.companionToggle)}</span>
      </button>
    </div>
  </header>

  <div class="cs-workspace">
    <aside class="cs-sidebar" aria-label="${escapeAttribute(labels.contents)}">
      <div class="cs-sidebar-head">
        <span class="cs-eyebrow">${escapeHtml(labels.eyebrow)}</span>
        <h1 class="cs-sidebar-title">${escapeHtml(title)}</h1>
        <p class="cs-sidebar-desc">${escapeHtml(summary)}</p>
      </div>
      <div class="cs-sidebar-nav">
        <span class="cs-nav-header">${escapeHtml(labels.contents)}</span>
        <div id="cs-page-list" class="cs-page-list"></div>
      </div>
    </aside>

    <main class="cs-reader">
      <iframe id="cs-course-frame" title="${escapeAttribute(title)}"></iframe>
      <div class="cs-bottom-pager">
        <button id="cs-prev-bottom" class="cs-pager-btn" type="button">← ${escapeHtml(labels.previous)}</button>
        <button id="cs-next-bottom" class="cs-pager-btn primary" type="button">${escapeHtml(labels.next)} →</button>
      </div>
    </main>
  </div>
</div>

<aside id="cs-companion-drawer" class="cs-companion-drawer" aria-label="${escapeAttribute(labels.companionTitle)}" hidden>
  <div class="cs-companion-header">
    <strong>${escapeHtml(labels.companionTitle)}</strong>
    <button id="cs-companion-close" class="cs-close-btn" type="button" aria-label="${escapeAttribute(labels.companionClose)}">✕</button>
  </div>
  <div id="cs-companion-content" class="cs-companion-content"></div>
</aside>
<div id="cs-companion-backdrop" class="cs-companion-backdrop" hidden></div>
<script>
(() => {
  const data = ${data};
  const frame = document.getElementById("cs-course-frame");
  const pageList = document.getElementById("cs-page-list");
  const pageTitle = document.getElementById("cs-page-title");
  const pagerStatus = document.getElementById("cs-pager-status");
  const previous = document.getElementById("cs-previous");
  const next = document.getElementById("cs-next");
  const prevBottom = document.getElementById("cs-prev-bottom");
  const nextBottom = document.getElementById("cs-next-bottom");
  const companionToggle = document.getElementById("cs-companion-toggle");
  const companionDrawer = document.getElementById("cs-companion-drawer");
  const companionClose = document.getElementById("cs-companion-close");
  const companionBackdrop = document.getElementById("cs-companion-backdrop");
  const companionContent = document.getElementById("cs-companion-content");
  let activeIndex = Math.max(0, data.pages.findIndex((page) => location.hash.slice(1) === encodeURIComponent(page.path)));
  let observer;

  function renderNavigation() {
    pageList.replaceChildren(...data.pages.map((page, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cs-nav-item" + (index === activeIndex ? " active" : "");
      
      const num = document.createElement("span");
      num.className = "cs-nav-num";
      num.textContent = String(index + 1).padStart(2, "0");
      
      const titleSpan = document.createElement("span");
      titleSpan.className = "cs-nav-label";
      titleSpan.textContent = page.title;

      button.appendChild(num);
      button.appendChild(titleSpan);
      button.addEventListener("click", () => showPage(index));
      return button;
    }));
  }

  function renderCompanion() {
    if (!data.conversations || !data.conversations.length) {
      if (companionToggle) companionToggle.style.opacity = "0.6";
      companionContent.innerHTML = '<p class="cs-companion-empty">' + escapeHtml(data.labels.companionEmpty) + '</p>';
      return;
    }
    companionContent.innerHTML = "";
    data.conversations.forEach((conv) => {
      const sessionDiv = document.createElement("div");
      sessionDiv.className = "cs-companion-session";
      const title = document.createElement("h3");
      title.className = "cs-companion-session-title";
      title.textContent = conv.title || data.labels.sessionFallback;
      sessionDiv.appendChild(title);

      conv.turns.forEach((turn) => {
        const turnDiv = document.createElement("div");
        turnDiv.className = "cs-companion-turn";

        if (turn.prompt) {
          const userBlock = document.createElement("div");
          userBlock.className = "cs-turn-block cs-turn-user";
          userBlock.innerHTML = '<span class="cs-turn-author">' + escapeHtml(data.labels.learnerPrompt) + '</span><div class="cs-turn-text">' + escapeHtml(turn.prompt) + '</div>';
          turnDiv.appendChild(userBlock);
        }

        if (turn.reasoning && turn.reasoning.length) {
          const details = document.createElement("details");
          details.className = "cs-turn-reasoning";
          const summary = document.createElement("summary");
          summary.textContent = "💡 " + data.labels.reasoningTitle + " (" + turn.reasoning.length + ")";
          details.appendChild(summary);
          const list = document.createElement("ul");
          turn.reasoning.forEach((item) => {
            const li = document.createElement("li");
            li.textContent = item;
            list.appendChild(li);
          });
          details.appendChild(list);
          turnDiv.appendChild(details);
        }

        if (turn.response) {
          const agentBlock = document.createElement("div");
          agentBlock.className = "cs-turn-block cs-turn-agent";
          agentBlock.innerHTML = '<span class="cs-turn-author">' + escapeHtml(data.labels.agentResponse) + '</span><div class="cs-turn-text">' + escapeHtml(turn.response) + '</div>';
          turnDiv.appendChild(agentBlock);
        }

        sessionDiv.appendChild(turnDiv);
      });
      companionContent.appendChild(sessionDiv);
    });
  }

  function setCompanionOpen(open) {
    if (open) {
      companionDrawer.removeAttribute("hidden");
      companionBackdrop.removeAttribute("hidden");
      companionToggle?.classList.add("active");
      document.body.style.overflow = "hidden";
    } else {
      companionDrawer.setAttribute("hidden", "");
      companionBackdrop.setAttribute("hidden", "");
      companionToggle?.classList.remove("active");
      document.body.style.overflow = "";
    }
  }

  companionToggle?.addEventListener("click", () => {
    const isHidden = companionDrawer.hasAttribute("hidden");
    setCompanionOpen(isHidden);
  });
  companionClose?.addEventListener("click", () => setCompanionOpen(false));
  companionBackdrop?.addEventListener("click", () => setCompanionOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !companionDrawer.hasAttribute("hidden")) {
      setCompanionOpen(false);
    }
  });

  function wireCourseLinks(doc) {
    doc.addEventListener("click", (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link) return;
      const raw = link.getAttribute("href") || "";
      const path = raw.split("#")[0].replace(/^\\.\\//, "");
      const index = data.pages.findIndex((page) => page.path === path);
      if (index < 0) return;
      event.preventDefault();
      showPage(index, raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : undefined);
    });
  }

  function resizeFrame() {
    const doc = frame.contentDocument;
    if (!doc) return;
    frame.style.height = Math.max(600, doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0) + "px";
  }

  function showPage(index, sectionId) {
    activeIndex = Math.max(0, Math.min(data.pages.length - 1, index));
    const page = data.pages[activeIndex];
    pageTitle.textContent = page.title;
    pagerStatus.textContent = (activeIndex + 1) + " / " + data.pages.length;
    
    const isFirst = activeIndex === 0;
    const isLast = activeIndex === data.pages.length - 1;
    previous.disabled = isFirst;
    next.disabled = isLast;
    prevBottom.disabled = isFirst;
    nextBottom.disabled = isLast;
    
    location.hash = encodeURIComponent(page.path);
    renderNavigation();
    observer?.disconnect();
    frame.onload = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      wireCourseLinks(doc);
      if (sectionId) doc.getElementById(sectionId)?.scrollIntoView();
      observer = new ResizeObserver(resizeFrame);
      observer.observe(doc.documentElement);
      resizeFrame();
    };
    frame.srcdoc = page.html;
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function escapeHtml(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  renderCompanion();
  previous.addEventListener("click", () => showPage(activeIndex - 1));
  next.addEventListener("click", () => showPage(activeIndex + 1));
  prevBottom?.addEventListener("click", () => showPage(activeIndex - 1));
  nextBottom?.addEventListener("click", () => showPage(activeIndex + 1));
  
  window.addEventListener("hashchange", () => {
    const index = data.pages.findIndex((page) => location.hash.slice(1) === encodeURIComponent(page.path));
    if (index >= 0 && index !== activeIndex) showPage(index);
  });
  showPage(activeIndex);
})();
</script>
</body>
</html>`;
}

export function exportFilename(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 72);
  return `${slug || "course"}.html`;
}

async function inlinePageAssets(html: string, courseDirectory: string, pageDirectory: string) {
  const base: AssetBase = { kind: "file", value: pageDirectory };
  let output = html.replace(/<base\b[^>]*>/gi, "");

  output = await replaceAsync(output, /<link\b[^>]*>/gi, async (tag) => {
    if (!/\brel\s*=\s*["'][^"']*stylesheet/i.test(tag)) return tag;
    const href = attribute(tag, "href");
    if (!href) return tag;
    const asset = await readAsset(href, base, courseDirectory);
    if (!asset) return tag;
    const css = await inlineCssAssets(asset.bytes.toString("utf8"), asset.base, courseDirectory);
    return `<style data-exported-from="${escapeAttribute(href)}">${css}</style>`;
  });

  output = await replaceAsync(output, /<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/gi, async (tag) => {
    const src = attribute(tag, "src");
    if (!src) return tag;
    const asset = await readAsset(src, base, courseDirectory);
    if (!asset) return tag;
    return `<script data-exported-from="${escapeAttribute(src)}">${asset.bytes.toString("utf8").replace(/<\/script/gi, "<\\/script")}</script>`;
  });

  output = await replaceAsync(output, /<(?:img|source|video|audio)\b[^>]*>/gi, async (tag) => {
    let next = tag;
    for (const name of ["src", "poster"]) {
      const value = attribute(next, name);
      if (!value) continue;
      const asset = await readAsset(value, base, courseDirectory);
      if (asset) next = replaceAttribute(next, name, dataUrl(asset.bytes, asset.mime));
    }
    return next;
  });

  output = await replaceAsync(output, /<style\b[^>]*>([\s\S]*?)<\/style>/gi, async (tag, css) => (
    tag.replace(css, await inlineCssAssets(css, base, courseDirectory))
  ));
  output = await replaceAsync(output, /\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi, async (attributeText, quote, css) => (
    `style=${quote}${await inlineCssAssets(css, base, courseDirectory)}${quote}`
  ));
  return output;
}

async function inlineCssAssets(css: string, base: AssetBase, courseDirectory: string, depth = 0): Promise<string> {
  return replaceAsync(css, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async (_match, _quote, url) => {
    const asset = await readAsset(url.trim(), base, courseDirectory);
    if (!asset) return _match;
    const bytes: Buffer = asset.mime === "text/css" && depth < 4
      ? Buffer.from(await inlineCssAssets(asset.bytes.toString("utf8"), asset.base, courseDirectory, depth + 1))
      : asset.bytes;
    return `url("${dataUrl(bytes, asset.mime)}")`;
  });
}

async function readAsset(raw: string, base: AssetBase, courseDirectory: string) {
  if (!raw || SKIP_URL.test(raw)) return null;
  try {
    if (HTTP_URL.test(raw) || base.kind === "url") {
      const url = HTTP_URL.test(raw) ? raw : new URL(raw, base.value).href;
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      return {
        bytes,
        mime: response.headers.get("content-type")?.split(";")[0] || mimeType(new URL(url).pathname),
        base: { kind: "url", value: new URL(".", url).href } as AssetBase,
      };
    }

    const clean = decodeURIComponent(raw.split(/[?#]/)[0]);
    const path = clean.startsWith("/") ? resolve(courseDirectory, `.${clean}`) : resolve(base.value, clean);
    const root = resolve(courseDirectory);
    if (path !== root && !path.startsWith(`${root}${sep}`)) {
      throw new Error("asset is outside the course directory");
    }
    return {
      bytes: await readFile(path),
      mime: mimeType(path),
      base: { kind: "file", value: dirname(path) } as AssetBase,
    };
  } catch (error) {
    throw new Error(`Could not embed course asset "${raw}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

function mimeType(path: string) {
  return ({
    ".css": "text/css",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
  } as Record<string, string>)[extname(path).toLowerCase()] || "application/octet-stream";
}

function dataUrl(bytes: Buffer, mime: string) {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function replaceAsync(value: string, pattern: RegExp, replacer: (...args: string[]) => Promise<string>) {
  const matches = [...value.matchAll(pattern)];
  const replacements = await Promise.all(matches.map((match) => replacer(...(match as unknown as string[]))));
  let index = 0;
  return value.replace(pattern, () => replacements[index++]);
}

function attribute(tag: string, name: string) {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag)?.[1];
}

function replaceAttribute(tag: string, name: string, value: string) {
  return tag.replace(new RegExp(`(\\b${name}\\s*=\\s*)["'][^"']+["']`, "i"), `$1"${value}"`);
}

function scriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function sanitizeMeta(value: string) {
  return value.replace(/[<>]/g, "").replace(/"/g, "'").replace(/[\r\n]+/g, " ");
}

const exportShellCss = `
:root {
  color-scheme: light dark;
  --cs-bg: #fbf9f5;
  --cs-sidebar-bg: #f4ede2;
  --cs-surface: #ffffff;
  --cs-surface-2: #ece3d4;
  --cs-ink: #211e1b;
  --cs-muted: #6e675f;
  --cs-faint: #9c9488;
  --cs-line: #dfd6c7;
  --cs-accent: #9a3412;
  --cs-accent-soft: #faebe3;
  --cs-shadow: 0 4px 20px rgba(45, 35, 25, 0.07);
}

@media (prefers-color-scheme: dark) {
  :root {
    --cs-bg: #141210;
    --cs-sidebar-bg: #1a1715;
    --cs-surface: #221f1c;
    --cs-surface-2: #2d2925;
    --cs-ink: #f5f4f2;
    --cs-muted: #a69f96;
    --cs-faint: #736c64;
    --cs-line: #332d28;
    --cs-accent: #ea580c;
    --cs-accent-soft: #381e13;
    --cs-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  }
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--cs-bg);
  color: var(--cs-ink);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
button { font: inherit; }

[hidden], .cs-companion-drawer[hidden], .cs-companion-backdrop[hidden] {
  display: none !important;
}

.cs-app { min-height: 100vh; display: flex; flex-direction: column; }

/* ---------- Top bar ---------- */
.cs-topbar {
  position: sticky; top: 0; z-index: 40;
  height: 56px; padding: 0 clamp(16px, 3vw, 32px);
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  background: color-mix(in srgb, var(--cs-bg) 88%, transparent);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--cs-line);
}
.cs-topbar-brand {
  display: flex; align-items: center; gap: 8px; font-size: 13px; min-width: 0;
}
.cs-brand-badge {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px; font-weight: 700; letter-spacing: 1px;
  color: var(--cs-accent); background: var(--cs-accent-soft);
  padding: 2px 7px; border-radius: 4px; flex-shrink: 0;
}
.cs-brand-name {
  font-weight: 600; color: var(--cs-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cs-crumb-sep { color: var(--cs-faint); font-weight: 300; }
.cs-current-crumb {
  color: var(--cs-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cs-topbar-actions {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
}
.cs-pager-group {
  display: flex; align-items: center; gap: 4px;
  background: var(--cs-surface); border: 1px solid var(--cs-line);
  border-radius: 20px; padding: 2px 8px; font-size: 12px;
}
.cs-pager-status {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--cs-muted); padding: 0 4px;
}
.cs-btn-icon {
  background: transparent; border: none; color: var(--cs-ink);
  cursor: pointer; padding: 4px 6px; border-radius: 4px; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
}
.cs-btn-icon:hover:not(:disabled) { background: var(--cs-surface-2); }
.cs-btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }

.cs-companion-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 20px;
  border: 1px solid var(--cs-line); background: var(--cs-surface);
  color: var(--cs-ink); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.15s ease;
}
.cs-companion-btn:hover, .cs-companion-btn.active {
  background: var(--cs-accent); color: #fff; border-color: var(--cs-accent);
}

/* ---------- Main layout ---------- */
.cs-workspace {
  display: grid; grid-template-columns: 280px minmax(0, 1fr);
  flex: 1; min-height: calc(100vh - 56px);
}

/* ---------- Sidebar (Table of Contents) ---------- */
.cs-sidebar {
  position: sticky; top: 56px; height: calc(100vh - 56px);
  overflow-y: auto; background: var(--cs-sidebar-bg);
  border-right: 1px solid var(--cs-line);
  padding: 28px 18px; display: flex; flex-direction: column; gap: 24px;
}
.cs-sidebar-head { display: flex; flex-direction: column; gap: 6px; }
.cs-eyebrow {
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  color: var(--cs-accent); text-transform: uppercase;
}
.cs-sidebar-title {
  margin: 0; font-size: 20px; font-weight: 700; line-height: 1.25;
  font-family: Georgia, "Noto Serif SC", serif; color: var(--cs-ink);
}
.cs-sidebar-desc { margin: 0; color: var(--cs-muted); font-size: 13px; line-height: 1.5; }

.cs-nav-section { display: flex; flex-direction: column; gap: 8px; }
.cs-nav-header {
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  color: var(--cs-faint); text-transform: uppercase; padding: 0 8px;
}
.cs-page-list { display: flex; flex-direction: column; gap: 4px; }
.cs-nav-item {
  display: flex; align-items: baseline; gap: 10px; width: 100%;
  padding: 8px 10px; border-radius: 8px; border: 1px solid transparent;
  background: transparent; color: var(--cs-muted); text-align: left;
  cursor: pointer; font-size: 13.5px; transition: all 0.15s ease;
}
.cs-nav-num {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; color: var(--cs-faint);
}
.cs-nav-label { flex: 1; }
.cs-nav-item:hover { background: var(--cs-surface-2); color: var(--cs-ink); }
.cs-nav-item.active {
  background: var(--cs-surface); color: var(--cs-ink);
  font-weight: 600; border-color: var(--cs-line);
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.cs-nav-item.active .cs-nav-num { color: var(--cs-accent); font-weight: 700; }

/* ---------- Reader Canvas ---------- */
.cs-reader {
  min-width: 0; padding: 0; display: flex; flex-direction: column;
}
.cs-reader iframe {
  display: block; width: 100%; min-height: 600px;
  border: none; background: transparent;
}
.cs-bottom-pager {
  display: flex; justify-content: space-between; align-items: center;
  max-width: 88ch; margin: 40px auto 80px; padding: 24px 20px 0;
  width: 100%; border-top: 1px solid var(--cs-line);
}
.cs-pager-btn {
  padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 500;
  border: 1px solid var(--cs-line); background: var(--cs-surface);
  color: var(--cs-ink); cursor: pointer; transition: all 0.15s ease;
}
.cs-pager-btn.primary {
  background: var(--cs-accent); color: #fff; border-color: var(--cs-accent);
}
.cs-pager-btn:hover:not(:disabled) { transform: translateY(-1px); }
.cs-pager-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ---------- Companion Drawer (Slide-over) ---------- */
.cs-companion-drawer {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: min(480px, 92vw); height: 100vh; z-index: 100;
  background: var(--cs-surface); border-left: 1px solid var(--cs-line);
  box-shadow: -10px 0 40px rgba(0, 0, 0, 0.16);
  display: flex; flex-direction: column;
  animation: cs-slide-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
.cs-companion-header {
  height: 56px; padding: 0 20px; display: flex; align-items: center;
  justify-content: space-between; border-bottom: 1px solid var(--cs-line);
  background: var(--cs-surface); flex-shrink: 0;
}
.cs-companion-header strong { font-size: 14px; }
.cs-close-btn {
  border: none; background: transparent; color: var(--cs-muted);
  font-size: 18px; cursor: pointer; padding: 6px 10px; border-radius: 6px;
}
.cs-close-btn:hover { background: var(--cs-surface-2); color: var(--cs-ink); }
.cs-companion-content {
  flex: 1; overflow-y: auto; padding: 24px 20px;
  display: flex; flex-direction: column; gap: 24px;
}
.cs-companion-empty { color: var(--cs-muted); font-size: 14px; text-align: center; margin-top: 40px; }
.cs-companion-session { display: flex; flex-direction: column; gap: 14px; }
.cs-companion-session-title {
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--cs-muted); margin: 0; padding-bottom: 6px; border-bottom: 1px dashed var(--cs-line);
}
.cs-companion-turn { display: flex; flex-direction: column; gap: 10px; }
.cs-turn-block { padding: 12px 14px; border-radius: 10px; font-size: 13.5px; line-height: 1.6; }
.cs-turn-user { background: var(--cs-surface-2); color: var(--cs-ink); }
.cs-turn-agent { background: var(--cs-bg); color: var(--cs-ink); border: 1px solid var(--cs-line); }
.cs-turn-author {
  display: block; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--cs-accent); margin-bottom: 4px;
}
.cs-turn-text { white-space: pre-wrap; }
.cs-turn-reasoning {
  font-size: 12px; color: var(--cs-muted); background: var(--cs-accent-soft);
  border: 1px solid color-mix(in srgb, var(--cs-accent) 25%, transparent);
  border-radius: 8px; padding: 6px 10px;
}
.cs-turn-reasoning summary { cursor: pointer; font-weight: 600; color: var(--cs-accent); }
.cs-turn-reasoning ul { margin: 6px 0 0; padding-left: 18px; }

.cs-companion-backdrop {
  position: fixed; inset: 0; z-index: 90;
  background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(3px);
}
@keyframes cs-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }

@media (max-width: 820px) {
  .cs-workspace { grid-template-columns: 1fr; }
  .cs-sidebar {
    position: static; height: auto; border-right: none;
    border-bottom: 1px solid var(--cs-line); padding: 20px 16px;
  }
  .cs-sidebar-head { margin-bottom: 14px; }
  .cs-page-list { flex-direction: row; overflow-x: auto; padding-bottom: 4px; }
  .cs-nav-item { white-space: nowrap; flex-shrink: 0; width: auto; }
}
`;
