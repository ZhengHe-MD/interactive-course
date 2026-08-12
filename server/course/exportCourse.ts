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
  <meta name="date" content="${tilMetadata(date)}">
  <meta name="summary" content="${tilMetadata(summary)}">
  <meta name="course-studio-export" content="1">
  <title>${tilMetadata(title)}</title>
  <style>${exportShellCss}</style>
</head>
<body>
<!-- til:body -->
<div class="cs-export-shell">
  <div class="cs-export-container">
    <header class="cs-export-header">
      <div class="cs-export-header-text">
        <h1 class="cs-export-title">${escapeHtml(title)}</h1>
      </div>
      <div class="cs-export-actions">
        <button id="cs-companion-toggle" class="cs-companion-toggle" type="button" aria-expanded="false" aria-controls="cs-companion-drawer">
          <span class="cs-companion-toggle-icon">💬</span>
          <span>${escapeHtml(labels.companionToggle)}</span>
        </button>
      </div>
    </header>

    <div class="cs-export-layout" id="cs-export-layout">
      <nav class="cs-export-nav" id="cs-export-nav" aria-label="${escapeAttribute(labels.contents)}">
        <strong class="cs-export-nav-heading">${escapeHtml(labels.contents)}</strong>
        <div id="cs-page-list" class="cs-page-list"></div>
      </nav>

      <main class="cs-export-reader" id="cs-export-reader">
        <div class="cs-frame-card">
          <iframe id="cs-course-frame" data-frame="course" title="${escapeAttribute(title)}"></iframe>
        </div>
        <div class="cs-export-pager">
          <button id="cs-previous" class="cs-btn-prev" type="button">← ${escapeHtml(labels.previous)}</button>
          <button id="cs-next" class="cs-btn-next" type="button">${escapeHtml(labels.next)} →</button>
        </div>
      </main>

      <aside id="cs-companion-drawer" class="cs-companion-drawer" aria-label="${escapeAttribute(labels.companionTitle)}" hidden>
        <div class="cs-companion-header">
          <strong>${escapeHtml(labels.companionTitle)}</strong>
          <button id="cs-companion-close" class="cs-companion-close" type="button" aria-label="${escapeAttribute(labels.companionClose)}">✕</button>
        </div>
        <div id="cs-companion-content" class="cs-companion-content"></div>
      </aside>
    </div>
  </div>
</div>
<div id="cs-companion-backdrop" class="cs-companion-backdrop" hidden></div>
<!-- /til:body -->
<script>
(() => {
  const data = ${data};
  const layout = document.getElementById("cs-export-layout");
  const nav = document.getElementById("cs-export-nav");
  const frame = document.getElementById("cs-course-frame");
  const pageList = document.getElementById("cs-page-list");
  const previous = document.getElementById("cs-previous");
  const next = document.getElementById("cs-next");
  const companionToggle = document.getElementById("cs-companion-toggle");
  const companionDrawer = document.getElementById("cs-companion-drawer");
  const companionClose = document.getElementById("cs-companion-close");
  const companionBackdrop = document.getElementById("cs-companion-backdrop");
  const companionContent = document.getElementById("cs-companion-content");

  let activeIndex = Math.max(0, data.pages.findIndex((page) => location.hash.slice(1).split("#")[0] === encodeURIComponent(page.path)));
  let drawerOpen = false;
  let observer;

  function updateLayout() {
    const w = window.innerWidth;
    const pad = 2 * Math.min(56, Math.max(20, w * 0.04));
    const gap = Math.min(40, Math.max(20, w * 0.024));
    const avail = Math.min(1700, w) - pad;
    const R = 880, NAV = 272, RAIL = 60;
    const panel = Math.max(280, Math.min(400, Math.round(avail * 0.26)));
    const FLOOR = 460;

    let navMode = "full"; // 'full' | 'rail' | 'none'
    if (avail < 520 + 280 + gap) {
      navMode = "full";
    } else {
      if (avail - NAV - panel - 2 * gap < FLOOR) navMode = "rail";
      if (avail - RAIL - panel - 2 * gap < FLOOR) navMode = "none";
    }

    if (nav) {
      if (navMode === "none") {
        nav.style.display = "none";
      } else if (navMode === "rail") {
        nav.style.display = "flex";
        nav.classList.add("is-rail");
      } else {
        nav.style.display = "flex";
        nav.classList.remove("is-rail");
      }
    }

    if (layout) {
      if (w <= 1024) {
        layout.style.gridTemplateColumns = "";
      } else {
        const navWidth = navMode === "full" ? NAV : (navMode === "rail" ? RAIL : 0);
        const chrome = navWidth ? navWidth + 2 * gap : gap;
        const readerWidth = Math.max(460, Math.min(R, Math.round(avail - chrome - panel)));
        const navCol = navWidth ? (navWidth + "px ") : "";
        layout.style.gridTemplateColumns = drawerOpen
          ? (navCol + "minmax(0, " + readerWidth + "px) " + panel + "px")
          : (navCol + "minmax(0, " + readerWidth + "px)");
      }
    }
  }

  function renderNavigation() {
    pageList.replaceChildren(...data.pages.map((page, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cs-nav-item" + (index === activeIndex ? " active" : "");
      button.title = page.title;

      const numBadge = document.createElement("span");
      numBadge.className = "cs-nav-num";
      numBadge.textContent = String(index + 1).padStart(2, "0");

      const labelSpan = document.createElement("span");
      labelSpan.className = "cs-nav-label";
      labelSpan.textContent = page.title;

      button.appendChild(numBadge);
      button.appendChild(labelSpan);
      button.addEventListener("click", () => showPage(index));
      return button;
    }));
  }

  function renderCompanion() {
    if (!data.conversations || !data.conversations.length) {
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

      (conv.turns || []).forEach((turn) => {
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
    drawerOpen = open;
    if (open) {
      companionDrawer.removeAttribute("hidden");
      companionToggle.classList.add("active");
      companionToggle.setAttribute("aria-expanded", "true");
      if (window.innerWidth <= 1024) {
        companionBackdrop.removeAttribute("hidden");
      }
    } else {
      companionDrawer.setAttribute("hidden", "");
      companionToggle.classList.remove("active");
      companionToggle.setAttribute("aria-expanded", "false");
      companionBackdrop.setAttribute("hidden", "");
    }
    updateLayout();
  }

  companionToggle?.addEventListener("click", () => {
    setCompanionOpen(!drawerOpen);
  });
  companionClose?.addEventListener("click", () => setCompanionOpen(false));
  companionBackdrop?.addEventListener("click", () => setCompanionOpen(false));

  function wireCourseLinks(doc) {
    doc.addEventListener("click", (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link) return;
      const raw = link.getAttribute("href") || "";
      if (raw.startsWith("#")) {
        const target = doc.getElementById(raw.slice(1));
        if (target) {
          event.preventDefault();
          target.scrollIntoView({ behavior: "smooth" });
        }
        return;
      }
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
    try {
      const h = Math.max(560, doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0);
      if (String(h) + "px" !== frame.style.height) {
        requestAnimationFrame(() => { frame.style.height = h + "px"; });
      }
    } catch (err) {
      console.warn("frame resize error:", err);
    }
  }

  function showPage(index, sectionId) {
    activeIndex = Math.max(0, Math.min(data.pages.length - 1, index));
    const page = data.pages[activeIndex];
    if (!page) return;

    previous.disabled = activeIndex === 0;
    next.disabled = activeIndex === data.pages.length - 1;
    location.hash = encodeURIComponent(page.path);
    renderNavigation();

    observer?.disconnect();
    frame.onload = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      wireCourseLinks(doc);
      if (sectionId) {
        const target = doc.getElementById(sectionId);
        if (target) {
          window.scrollTo({
            top: frame.getBoundingClientRect().top + window.scrollY + target.offsetTop,
            behavior: "instant"
          });
        }
      }
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

  window.addEventListener("resize", updateLayout);
  renderCompanion();
  previous.addEventListener("click", () => showPage(activeIndex - 1));
  next.addEventListener("click", () => showPage(activeIndex + 1));
  window.addEventListener("hashchange", () => {
    const rawHash = decodeURIComponent(location.hash.slice(1));
    const pagePath = rawHash.split("#")[0];
    const index = data.pages.findIndex((page) => page.path === pagePath);
    if (index >= 0 && index !== activeIndex) {
      const section = rawHash.includes("#") ? rawHash.slice(rawHash.indexOf("#") + 1) : undefined;
      showPage(index, section);
    }
  });

  updateLayout();
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

function tilMetadata(value: string) {
  return value.replace(/[<>]/g, "").replace(/"/g, "'").replace(/[\r\n]+/g, " ");
}

const exportShellCss = `
@import url("https://fonts.googleapis.com/css2?family=Caprasimo&family=Figtree:ital,wght@0,400;0,600;0,700;1,400&display=swap");

:root {
  color-scheme: light;
  --color-bg: #f5ead8;
  --color-surface: #ebddc5;
  --color-text: #201e1d;
  --color-accent: #c67139;
  --color-accent-2: #7a8a5e;
  --color-divider: color-mix(in srgb, #201e1d 16%, transparent);

  --color-neutral-100: #f9f4ed;
  --color-neutral-200: #eee7db;
  --color-neutral-300: #dcd3c4;
  --color-neutral-400: #c0b6a5;
  --color-neutral-500: #a19786;
  --color-neutral-600: #82796a;
  --color-neutral-700: #645c50;
  --color-neutral-800: #474238;
  --color-neutral-900: #2e2b25;

  --color-accent-100: #fff2eb;
  --color-accent-200: #ffe1d0;
  --color-accent-300: #ffc6a5;
  --color-accent-400: #f6a06b;
  --color-accent-500: #d67f48;
  --color-accent-600: #b2622d;
  --color-accent-700: #8c491a;
  --color-accent-800: #643312;
  --color-accent-900: #402310;

  --color-accent-2-100: #f0fae1;
  --color-accent-2-200: #e1eecc;
  --color-accent-2-300: #ccdbb2;
  --color-accent-2-400: #aebf92;
  --color-accent-2-500: #8fa073;
  --color-accent-2-600: #728157;
  --color-accent-2-700: #56633f;
  --color-accent-2-800: #3d472b;
  --color-accent-2-900: #272e1b;

  --font-heading: "Caprasimo", Georgia, serif;
  --font-heading-weight: 400;
  --font-body: "Figtree", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

  --space-1: 4.4px;
  --space-2: 8.8px;
  --space-3: 13.2px;
  --space-4: 17.6px;
  --space-6: 26.4px;
  --space-8: 35.2px;

  --radius-sm: 8px;
  --radius-md: 16px;
  --radius-lg: 28px;

  --shadow-sm: 0 1px 2px color-mix(in srgb, var(--color-text) 8%, transparent);
  --shadow-md: 0 4px 12px color-mix(in srgb, var(--color-text) 8%, transparent), 0 1px 2px color-mix(in srgb, var(--color-text) 5%, transparent);
  --shadow-lg: 0 16px 36px color-mix(in srgb, var(--color-text) 12%, transparent), 0 2px 6px color-mix(in srgb, var(--color-text) 6%, transparent);
}

*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.55;
  font-weight: 400;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
button { font: inherit; }
:focus { outline: none; }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }

.cs-export-shell {
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
}
.cs-export-container {
  max-width: 1700px;
  margin: 0 auto;
  padding: 0 clamp(20px, 4vw, 56px);
}

/* Header */
.cs-export-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 40px;
  padding: clamp(36px, 5vw, 64px) 0 clamp(28px, 3vw, 40px);
  border-bottom: 1px solid var(--color-divider);
}
.cs-export-header-text { min-width: 0; }
.cs-export-title {
  max-width: 20ch;
  margin: 0;
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: clamp(38px, 6vw, 76px);
  line-height: 1.02;
  letter-spacing: -0.01em;
  text-wrap: pretty;
}
.cs-export-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}
.cs-companion-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 999px;
  border: 1px solid var(--color-accent-300);
  background: var(--color-accent-100);
  color: var(--color-accent-800);
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background .15s ease, color .15s ease, border-color .15s ease, transform .1s ease;
}
.cs-companion-toggle:hover {
  background: var(--color-accent-200);
  border-color: var(--color-accent-400);
}
.cs-companion-toggle.active {
  background: var(--color-accent);
  color: #fff;
  border-color: var(--color-accent);
}
.cs-companion-toggle-icon { font-size: 15px; }

/* Main layout */
.cs-export-layout {
  display: grid;
  gap: clamp(20px, 2.4vw, 40px);
  align-items: start;
  justify-content: start;
  padding: clamp(24px, 3.4vw, 40px) 0 80px;
}

/* Nav */
.cs-export-nav {
  position: sticky;
  top: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 22px 18px;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}
.cs-export-nav.is-rail {
  padding: 18px 12px;
}
.cs-export-nav.is-rail .cs-export-nav-heading,
.cs-export-nav.is-rail .cs-nav-label {
  display: none;
}
.cs-export-nav-heading {
  padding: 0 10px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-neutral-700);
}
.cs-page-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cs-nav-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-neutral-800);
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.cs-export-nav.is-rail .cs-nav-item {
  grid-template-columns: 28px;
  padding: 8px;
  justify-content: center;
}
.cs-nav-item:hover {
  background: var(--color-accent-200);
}
.cs-nav-item.active {
  background: var(--color-accent-100);
  color: var(--color-accent-800);
  font-weight: 700;
}
.cs-nav-num {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--color-neutral-200);
  color: var(--color-neutral-700);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  transition: background .15s ease, color .15s ease;
}
.cs-nav-item.active .cs-nav-num {
  background: var(--color-accent);
  color: #fff;
}
.cs-nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Reader */
.cs-export-reader {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.cs-frame-card {
  border-radius: var(--radius-lg);
  background: #fff;
  box-shadow: var(--shadow-md);
  overflow: hidden;
  border: 1px solid var(--color-divider);
}
.cs-frame-card iframe {
  display: block;
  width: 100%;
  min-height: 560px;
  border: 0;
  background: #fff;
}
.cs-export-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 6px 0;
}
.cs-btn-prev, .cs-btn-next {
  font-family: var(--font-body);
  font-size: 14.5px;
  font-weight: 700;
  line-height: 1;
  border-radius: 999px;
  cursor: pointer;
  transition: all .15s ease;
}
.cs-btn-prev {
  padding: 13px 24px;
  border: 1px solid var(--color-neutral-300);
  background: transparent;
  color: var(--color-text);
}
.cs-btn-prev:hover:not(:disabled) {
  background: var(--color-accent-100);
}
.cs-btn-next {
  padding: 13px 26px;
  border: 1px solid var(--color-accent);
  background: var(--color-accent);
  color: #fff;
}
.cs-btn-next:hover:not(:disabled) {
  background: var(--color-accent-600);
  border-color: var(--color-accent-600);
}
.cs-btn-prev:disabled, .cs-btn-next:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Companion Drawer / Aside */
.cs-companion-drawer {
  position: sticky;
  top: 24px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-height: calc(100vh - 48px);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  animation: cs-fade-in .18s ease-out;
}
.cs-companion-drawer[hidden] {
  display: none !important;
}
.cs-companion-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-divider);
}
.cs-companion-header strong {
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 17px;
  line-height: 1.2;
}
.cs-companion-close {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border: 0;
  border-radius: 999px;
  background: var(--color-neutral-200);
  color: var(--color-neutral-800);
  font-size: 14px;
  cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.cs-companion-close:hover {
  background: var(--color-accent-200);
  color: var(--color-accent-900);
}
.cs-companion-content {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.cs-companion-empty {
  margin: 40px 0 0;
  text-align: center;
  color: var(--color-neutral-700);
  font-size: 14px;
}
.cs-companion-session {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cs-companion-session-title {
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--color-neutral-300);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-neutral-700);
}
.cs-companion-turn {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 8px;
}
.cs-turn-block {
  padding: 13px 15px;
  border-radius: var(--radius-md);
  font-size: 14px;
  line-height: 1.6;
}
.cs-turn-user {
  background: var(--color-accent-2-100);
  border: 1px solid var(--color-accent-2-300);
  color: var(--color-text);
}
.cs-turn-agent {
  background: #fffdf8;
  border: 1px solid var(--color-divider);
  color: var(--color-text);
}
.cs-turn-author {
  display: block;
  margin-bottom: 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.cs-turn-user .cs-turn-author {
  color: var(--color-accent-2-800);
}
.cs-turn-agent .cs-turn-author {
  color: var(--color-accent-700);
}
.cs-turn-text {
  white-space: pre-wrap;
  word-break: break-word;
}
.cs-turn-reasoning {
  border: 1px solid var(--color-accent-200);
  border-radius: var(--radius-md);
  background: var(--color-accent-100);
  padding: 8px 12px;
  font-size: 12.5px;
  color: var(--color-neutral-800);
}
.cs-turn-reasoning summary {
  cursor: pointer;
  font-weight: 700;
  color: var(--color-accent-800);
  list-style: none;
}
.cs-turn-reasoning summary::-webkit-details-marker {
  display: none;
}
.cs-turn-reasoning ul {
  margin: 8px 0 4px;
  padding-left: 18px;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cs-companion-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(46, 43, 37, 0.4);
  z-index: 800;
  backdrop-filter: blur(2px);
}
.cs-companion-backdrop[hidden] {
  display: none !important;
}

@keyframes cs-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 1024px) {
  .cs-export-header {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .cs-export-actions {
    margin-top: 8px;
  }
  .cs-export-layout {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .cs-export-nav {
    position: static;
    max-height: none;
    overflow-y: visible;
  }
  .cs-export-nav .cs-page-list {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .cs-export-nav .cs-nav-item {
    min-width: 180px;
  }
  .cs-companion-drawer {
    position: fixed;
    top: 20px;
    right: 20px;
    bottom: 20px;
    width: min(440px, calc(100vw - 40px));
    max-height: none;
    z-index: 900;
    box-shadow: var(--shadow-lg);
  }
}

@media print {
  .cs-export-nav, .cs-export-pager, .cs-companion-toggle, .cs-companion-drawer, .cs-companion-backdrop {
    display: none !important;
  }
  .cs-export-layout {
    display: block;
  }
  .cs-frame-card {
    border: 0;
    box-shadow: none;
  }
}
`;
