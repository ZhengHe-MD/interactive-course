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
<div class="studio-shell cs-export-shell">
  <!-- Slim Toolbar (52px) -->
  <header class="studio-topbar">
    <div class="topbar-left">
      <div class="studio-wordmark">
        <span class="brand-mark">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </span>
        <span>Course Studio</span>
      </div>
      <div class="course-breadcrumb">
        <span class="crumb-sep">›</span>
        <span class="crumb-title">${escapeHtml(title)}</span>
      </div>
    </div>
    <div class="topbar-right">
      <div class="pager-nav">
        <button id="cs-previous" class="toolbar-pill-btn" type="button" aria-label="${escapeAttribute(labels.previous)}" title="${escapeAttribute(labels.previous)}">←</button>
        <span id="cs-pager-indicator" class="pager-text"></span>
        <button id="cs-next" class="toolbar-pill-btn" type="button" aria-label="${escapeAttribute(labels.next)}" title="${escapeAttribute(labels.next)}">→</button>
      </div>
      <button id="cs-companion-toggle" class="toolbar-pill-btn companion-btn" type="button">
        <span>💬</span>
        <span class="companion-label">${escapeHtml(labels.companionToggle)}</span>
      </button>
    </div>
  </header>

  <!-- 3-Column Studio Body (Sidebar | Canvas | Docked Chat) -->
  <div id="cs-studio-body" class="studio-body">
    <!-- Course Outline (Left Sidebar) -->
    <aside class="course-nav" aria-label="${escapeAttribute(labels.contents)}">
      <div class="course-nav-header">
        <div class="nav-kicker">${escapeHtml(labels.contents)}</div>
      </div>
      <div class="course-identity">
        <span class="course-status-dot"></span>
        <h1>${escapeHtml(title)}</h1>
      </div>
      <nav id="cs-page-list"></nav>
    </aside>

    <!-- Center Workspace Canvas -->
    <main class="workspace">
      <div class="preview-stage">
        <iframe id="cs-course-frame" title="${escapeAttribute(title)}"></iframe>
      </div>
    </main>

    <!-- Right Co-Design Chat Panel (Docked, Collapsible) -->
    <aside id="cs-companion-drawer" class="chat-shell" aria-label="${escapeAttribute(labels.companionTitle)}" hidden>
      <div class="chat-header">
        <div class="chat-header-identity">
          <span class="chat-avatar">💬</span>
          <strong>${escapeHtml(labels.companionTitle)}</strong>
        </div>
        <button id="cs-companion-close" class="chat-collapse-btn" type="button" aria-label="${escapeAttribute(labels.companionClose)}">✕</button>
      </div>
      <div id="cs-companion-content" class="chat-log"></div>
    </aside>
  </div>
</div>

<script>
(() => {
  const data = ${data};
  const studioBody = document.getElementById("cs-studio-body");
  const frame = document.getElementById("cs-course-frame");
  const pageList = document.getElementById("cs-page-list");
  const pagerIndicator = document.getElementById("cs-pager-indicator");
  const previous = document.getElementById("cs-previous");
  const next = document.getElementById("cs-next");
  const companionToggle = document.getElementById("cs-companion-toggle");
  const companionDrawer = document.getElementById("cs-companion-drawer");
  const companionClose = document.getElementById("cs-companion-close");
  const companionContent = document.getElementById("cs-companion-content");
  let activeIndex = Math.max(0, data.pages.findIndex((page) => location.hash.slice(1) === encodeURIComponent(page.path)));
  let observer;

  function renderNavigation() {
    pageList.replaceChildren(...data.pages.map((page, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "course-page-link" + (index === activeIndex ? " active" : "");
      
      const iconSpan = document.createElement("span");
      iconSpan.className = "page-icon";
      iconSpan.textContent = index === 0 ? "📋" : "📖";

      const textWrap = document.createElement("span");
      textWrap.className = "page-info";

      const kicker = document.createElement("small");
      kicker.textContent = index === 0 ? "大纲 Syllabus" : ("第 " + index + " 讲 Session " + index);

      const titleSpan = document.createElement("strong");
      titleSpan.textContent = page.title;

      textWrap.appendChild(kicker);
      textWrap.appendChild(titleSpan);

      button.appendChild(iconSpan);
      button.appendChild(textWrap);
      button.addEventListener("click", () => showPage(index));
      return button;
    }));
  }

  function renderCompanion() {
    if (!data.conversations || !data.conversations.length) {
      if (companionToggle) companionToggle.style.opacity = "0.6";
      companionContent.innerHTML = '<p class="chat-empty">' + escapeHtml(data.labels.companionEmpty) + '</p>';
      return;
    }
    companionContent.innerHTML = "";
    data.conversations.forEach((conv) => {
      const sessionDiv = document.createElement("div");
      sessionDiv.className = "chat-session";
      const title = document.createElement("h3");
      title.className = "chat-session-title";
      title.textContent = conv.title || data.labels.sessionFallback;
      sessionDiv.appendChild(title);

      conv.turns.forEach((turn) => {
        const turnDiv = document.createElement("div");
        turnDiv.className = "chat-turn";

        if (turn.prompt) {
          const userBlock = document.createElement("div");
          userBlock.className = "chat-turn-user";
          userBlock.innerHTML = '<span class="chat-author">' + escapeHtml(data.labels.learnerPrompt) + '</span><div class="chat-text">' + escapeHtml(turn.prompt) + '</div>';
          turnDiv.appendChild(userBlock);
        }

        if (turn.reasoning && turn.reasoning.length) {
          const details = document.createElement("details");
          details.className = "chat-turn-reasoning";
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
          agentBlock.className = "chat-turn-agent";
          agentBlock.innerHTML = '<span class="chat-author">' + escapeHtml(data.labels.agentResponse) + '</span><div class="chat-text">' + escapeHtml(turn.response) + '</div>';
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
      studioBody.classList.add("chat-open");
      companionToggle?.classList.add("active");
    } else {
      companionDrawer.setAttribute("hidden", "");
      studioBody.classList.remove("chat-open");
      companionToggle?.classList.remove("active");
    }
  }

  companionToggle?.addEventListener("click", () => {
    const isOpen = studioBody.classList.contains("chat-open");
    setCompanionOpen(!isOpen);
  });
  companionClose?.addEventListener("click", () => setCompanionOpen(false));

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

  function showPage(index, sectionId) {
    activeIndex = Math.max(0, Math.min(data.pages.length - 1, index));
    const page = data.pages[activeIndex];
    pagerIndicator.textContent = (activeIndex + 1) + " / " + data.pages.length;
    
    previous.disabled = activeIndex === 0;
    next.disabled = activeIndex === data.pages.length - 1;
    
    location.hash = encodeURIComponent(page.path);
    renderNavigation();
    frame.onload = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      wireCourseLinks(doc);
      if (sectionId) {
        doc.getElementById(sectionId)?.scrollIntoView();
      } else {
        frame.contentWindow?.scrollTo({ top: 0, behavior: "instant" });
      }
    };
    frame.srcdoc = page.html;
  }

  function escapeHtml(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  renderCompanion();
  previous.addEventListener("click", () => showPage(activeIndex - 1));
  next.addEventListener("click", () => showPage(activeIndex + 1));
  
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
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #201e1d;
  background: #f5ead8;
  --bg: #f5ead8;
  --surface: #ebddc5;
  --text: #201e1d;
  --accent: #c67139;
  --accent-dark: #8c491a;
  --sage: #7a8a5e;
  --sage-soft: #f0fae1;
  --paper: #f9f4ed;
  --paper-2: #eee7db;
  --muted: #82796a;
  --line: color-mix(in srgb, #201e1d 16%, transparent);
  --heading: Georgia, "Noto Serif SC", serif;
  --shadow-lg: 0 12px 32px color-mix(in srgb, #2e2b25 18%, transparent);
}

@media (prefers-color-scheme: dark) {
  :root {
    color: #f5f5f4;
    background: #141210;
    --bg: #141210;
    --surface: #1e1b18;
    --text: #f5f5f4;
    --accent: #ea580c;
    --accent-dark: #f97316;
    --sage: #84cc16;
    --sage-soft: #1e2912;
    --paper: #1c1917;
    --paper-2: #292524;
    --muted: #a8a29e;
    --line: color-mix(in srgb, #f5f5f4 15%, transparent);
    --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.4);
  }
}

* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  width: 100%; height: 100%;
  overflow: hidden;
  background: var(--bg); color: var(--text);
}
button { font: inherit; cursor: pointer; }

[hidden], #cs-companion-drawer[hidden] {
  display: none !important;
}

.studio-shell {
  width: 100%; height: 100vh;
  display: flex; flex-direction: column;
  overflow: hidden;
}

/* ---------- Slim Topbar (52px) ---------- */
.studio-topbar {
  height: 52px; flex-shrink: 0;
  padding: 0 20px;
  display: flex; align-items: center; justify-content: space-between;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.topbar-left {
  display: flex; align-items: center; gap: 12px; font-size: 13px; min-width: 0;
}
.studio-wordmark {
  display: flex; align-items: center; gap: 8px;
  font-weight: 700; font-size: 14px; color: var(--text);
  white-space: nowrap;
}
.brand-mark {
  display: grid; place-items: center;
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--accent); color: #fff;
}
.course-breadcrumb {
  display: flex; align-items: center; gap: 6px;
  color: var(--muted); font-size: 13px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.crumb-sep { opacity: 0.5; }
.crumb-title { font-weight: 600; color: var(--text); }

.topbar-right {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
}
.pager-nav {
  display: flex; align-items: center; gap: 4px;
  background: var(--paper); border: 1px solid var(--line);
  border-radius: 999px; padding: 2px 8px;
}
.pager-text {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px; color: var(--muted); padding: 0 4px;
}
.toolbar-pill-btn {
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--text);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px; font-weight: 600;
  display: inline-flex; align-items: center; gap: 6px;
  transition: all 0.15s ease;
}
.toolbar-pill-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 12%, var(--paper));
  border-color: var(--accent);
}
.toolbar-pill-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.companion-btn.active {
  background: var(--accent); color: #fff; border-color: var(--accent);
}

/* ---------- 3-Column Studio Body ---------- */
.studio-body {
  flex: 1; min-height: 0;
  height: calc(100vh - 52px);
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 0;
  overflow: hidden;
  transition: grid-template-columns 0.22s ease;
}
.studio-body.chat-open {
  grid-template-columns: 240px minmax(0, 1fr) 380px;
}

/* ---------- Outline (Left Sidebar) ---------- */
.course-nav {
  background: var(--bg);
  border-right: 1px solid var(--line);
  padding: 20px 14px;
  overflow-y: auto;
  height: 100%;
}
.course-nav-header {
  display: flex; align-items: center;
  min-height: 24px; margin-bottom: 4px;
}
.nav-kicker {
  padding: 0 8px; font-size: 10px;
  font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--muted);
}
.course-identity {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px 16px; margin-bottom: 8px;
  border-bottom: 1px solid var(--line);
}
.course-status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--sage); flex-shrink: 0;
}
.course-identity h1 {
  margin: 0; font-size: 14px; font-weight: 700;
  color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.course-nav nav {
  display: flex; flex-direction: column; gap: 4px;
}
.course-page-link {
  display: flex; align-items: flex-start; gap: 10px;
  width: 100%; padding: 8px 10px;
  border: 0; border-radius: 10px;
  background: transparent; color: var(--text);
  text-align: left; transition: all 0.15s ease;
}
.course-page-link:hover {
  background: color-mix(in srgb, var(--text) 6%, transparent);
}
.course-page-link.active {
  background: #fff2eb;
  color: #643312;
  font-weight: 700;
}
@media (prefers-color-scheme: dark) {
  .course-page-link.active {
    background: #381e13;
    color: #fdba74;
  }
}
.page-icon { font-size: 14px; line-height: 1.2; flex-shrink: 0; margin-top: 1px; }
.page-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.page-info small {
  font-size: 9.5px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--muted);
}
.course-page-link.active .page-info small { color: var(--accent-dark); }
.page-info strong {
  font-size: 12.5px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ---------- Center Workspace Canvas ---------- */
.workspace {
  background: var(--bg);
  min-width: 0; min-height: 0;
  height: 100%;
  overflow: hidden;
  padding: 18px 24px 24px;
  display: flex;
  flex-direction: column;
}
.preview-stage {
  width: 100%; height: 100%;
  min-height: 0;
  display: flex;
  justify-content: center;
}
.preview-stage iframe {
  display: block;
  width: min(1280px, 96%);
  height: 100%;
  border: 0;
  border-radius: 24px;
  background: var(--paper);
  box-shadow: var(--shadow-lg);
}

/* ---------- Right Chat / Companion Panel (Docked) ---------- */
.chat-shell {
  background: var(--surface);
  border-left: 1px solid var(--line);
  display: flex; flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.chat-header {
  height: 48px; padding: 0 16px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.chat-header-identity {
  display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600;
}
.chat-avatar { font-size: 15px; }
.chat-collapse-btn {
  border: 0; background: transparent; color: var(--muted);
  font-size: 15px; padding: 4px 8px; border-radius: 4px;
}
.chat-collapse-btn:hover { background: var(--line); color: var(--text); }

.chat-log {
  flex: 1; overflow-y: auto; padding: 18px 16px;
  display: flex; flex-direction: column; gap: 16px;
}
.chat-empty { color: var(--muted); font-size: 13px; text-align: center; margin-top: 32px; }
.chat-session { display: flex; flex-direction: column; gap: 10px; }
.chat-session-title {
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--muted); margin: 0 0 6px;
  padding-bottom: 4px; border-bottom: 1px dashed var(--line);
}
.chat-turn { display: flex; flex-direction: column; gap: 8px; }
.chat-turn-user, .chat-turn-agent {
  padding: 10px 12px; border-radius: 10px; font-size: 13px; line-height: 1.5;
}
.chat-turn-user { background: var(--paper-2); color: var(--text); }
.chat-turn-agent { background: var(--paper); color: var(--text); border: 1px solid var(--line); }
.chat-author {
  display: block; font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--accent); margin-bottom: 3px;
}
.chat-text { white-space: pre-wrap; }
.chat-turn-reasoning {
  font-size: 11.5px; color: var(--muted);
  background: var(--paper-2); border: 1px solid var(--line);
  border-radius: 6px; padding: 5px 8px;
}
.chat-turn-reasoning summary { cursor: pointer; font-weight: 600; color: var(--accent); }
.chat-turn-reasoning ul { margin: 4px 0 0; padding-left: 16px; }

@media (max-width: 900px) {
  html, body { overflow: auto; }
  .studio-shell { height: auto; overflow: visible; }
  .studio-body { grid-template-columns: 1fr; height: auto; overflow: visible; }
  .course-nav { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  .workspace { padding: 16px 12px; height: auto; overflow: visible; }
  .preview-stage { height: 80vh; }
  .preview-stage iframe { border-radius: 12px; height: 100%; }
  .studio-body.chat-open { grid-template-columns: 1fr; }
  .chat-shell { position: fixed; inset: 0; z-index: 50; width: 100%; height: 100vh; }
}
`;
