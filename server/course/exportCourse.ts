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
<div class="cs-export-shell">
  <header class="cs-export-header">
    <div>
      <p class="cs-export-eyebrow">${escapeHtml(labels.eyebrow)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="cs-export-topic">${escapeHtml(summary)}</p>
    </div>
    <div class="cs-export-actions">
      <button id="cs-companion-toggle" class="cs-companion-toggle" type="button">
        💬 ${escapeHtml(labels.companionToggle)}
      </button>
    </div>
  </header>
  <div class="cs-export-layout">
    <nav class="cs-export-nav" aria-label="${escapeAttribute(labels.contents)}">
      <strong>${escapeHtml(labels.contents)}</strong>
      <div id="cs-page-list"></div>
    </nav>
    <main class="cs-export-reader">
      <div class="cs-export-pagebar">
        <span id="cs-page-title"></span>
      </div>
      <iframe id="cs-course-frame" title="${escapeAttribute(title)}"></iframe>
      <div class="cs-export-pager">
        <button id="cs-previous" type="button">← ${escapeHtml(labels.previous)}</button>
        <button id="cs-next" type="button">${escapeHtml(labels.next)} →</button>
      </div>
    </main>
  </div>
</div>

<aside id="cs-companion-drawer" class="cs-companion-drawer" aria-label="${escapeAttribute(labels.companionTitle)}" hidden>
  <div class="cs-companion-header">
    <strong>${escapeHtml(labels.companionTitle)}</strong>
    <button id="cs-companion-close" class="cs-companion-close" type="button" aria-label="${escapeAttribute(labels.companionClose)}">✕</button>
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
  const previous = document.getElementById("cs-previous");
  const next = document.getElementById("cs-next");
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
      button.className = index === activeIndex ? "active" : "";
      button.textContent = page.title;
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
      companionToggle.classList.add("active");
    } else {
      companionDrawer.setAttribute("hidden", "");
      companionBackdrop.setAttribute("hidden", "");
      companionToggle.classList.remove("active");
    }
  }

  companionToggle?.addEventListener("click", () => {
    const isHidden = companionDrawer.hasAttribute("hidden");
    setCompanionOpen(isHidden);
  });
  companionClose?.addEventListener("click", () => setCompanionOpen(false));
  companionBackdrop?.addEventListener("click", () => setCompanionOpen(false));

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
    frame.style.height = Math.max(520, doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0) + "px";
  }

  function showPage(index, sectionId) {
    activeIndex = Math.max(0, Math.min(data.pages.length - 1, index));
    const page = data.pages[activeIndex];
    pageTitle.textContent = page.title;
    previous.disabled = activeIndex === 0;
    next.disabled = activeIndex === data.pages.length - 1;
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
:root{color-scheme:light dark;--paper:#f5f0e7;--ink:#292521;--muted:#716b64;--line:#d8cfc1;--accent:#a65331;--panel:#fffdf8;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink)}button{font:inherit}.cs-export-shell{min-height:100vh}.cs-export-header{display:flex;align-items:end;justify-content:space-between;gap:32px;padding:42px clamp(22px,5vw,72px) 30px;border-bottom:1px solid var(--line);background:rgba(255,253,248,.72)}.cs-export-eyebrow{margin:0 0 10px;color:var(--accent);font-size:12px;font-weight:750;letter-spacing:.12em;text-transform:uppercase}.cs-export-header h1{max-width:18ch;margin:0;font-family:Georgia,"Noto Serif SC",serif;font-size:clamp(30px,5vw,60px);font-weight:500;line-height:1.02}.cs-export-topic{max-width:65ch;margin:14px 0 0;color:var(--muted);line-height:1.55}.cs-export-actions{display:flex;gap:10px;align-items:center}.cs-companion-toggle{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px solid var(--line);border-radius:20px;background:var(--panel);color:var(--ink);font-size:13px;font-weight:600;cursor:pointer;transition:all .15s ease}.cs-companion-toggle:hover,.cs-companion-toggle.active{background:var(--accent);color:#fff;border-color:var(--accent)}.cs-export-layout{display:grid;grid-template-columns:250px minmax(0,1fr);max-width:1500px;margin:0 auto}.cs-export-nav{position:sticky;top:0;align-self:start;height:100vh;padding:30px 18px;border-right:1px solid var(--line);overflow:auto}.cs-export-nav>strong{display:block;padding:0 10px 14px;font-size:12px;letter-spacing:.08em;text-transform:uppercase}.cs-export-nav button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;padding:10px;border:0;border-radius:8px;background:transparent;color:var(--muted);text-align:left;cursor:pointer}.cs-export-nav button:hover,.cs-export-nav button.active{background:var(--panel);color:var(--ink)}.cs-export-reader{min-width:0;padding:24px clamp(14px,3vw,42px) 60px}.cs-export-pagebar{display:flex;justify-content:space-between;gap:20px;padding:0 2px 16px;color:var(--muted);font-size:13px}.cs-export-pagebar span:first-child{color:var(--ink);font-weight:700}.cs-export-reader iframe{display:block;width:100%;min-height:520px;border:1px solid var(--line);border-radius:12px;background:white;box-shadow:0 10px 32px rgba(53,45,34,.08)}.cs-export-pager{display:flex;justify-content:space-between;padding-top:18px}.cs-export-pager button{padding:9px 14px;border:1px solid var(--line);border-radius:8px;background:var(--panel);cursor:pointer}.cs-export-pager button:disabled{opacity:.35;cursor:default}
.cs-companion-drawer{position:fixed;top:0;right:0;width:min(440px,90vw);height:100vh;background:#fff;border-left:1px solid var(--line);box-shadow:-8px 0 32px rgba(0,0,0,.12);z-index:900;display:flex;flex-direction:column;animation:cs-slide-in .2s ease-out}.cs-companion-header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--line);background:var(--panel)}.cs-companion-close{border:0;background:transparent;font-size:18px;cursor:pointer;color:var(--muted);padding:4px 8px;border-radius:4px}.cs-companion-close:hover{background:rgba(0,0,0,.05);color:var(--ink)}.cs-companion-content{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:24px}.cs-companion-empty{color:var(--muted);font-size:14px;text-align:center;margin-top:40px}.cs-companion-session-title{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 12px;padding-bottom:6px;border-bottom:1px dashed var(--line)}.cs-companion-turn{display:flex;flex-direction:column;gap:10px;margin-bottom:18px}.cs-turn-block{padding:12px 14px;border-radius:10px;font-size:14px;line-height:1.55}.cs-turn-user{background:#f0eae1;color:var(--ink);border:1px solid #e2d7c7}.cs-turn-agent{background:#fffdf8;color:var(--ink);border:1px solid var(--line)}.cs-turn-author{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-bottom:4px}.cs-turn-text{white-space:pre-wrap}.cs-turn-reasoning{margin:2px 0;font-size:12px;color:var(--muted);background:rgba(166,83,49,.06);border:1px solid rgba(166,83,49,.2);border-radius:8px;padding:6px 10px}.cs-turn-reasoning summary{cursor:pointer;font-weight:600;color:var(--accent)}.cs-turn-reasoning ul{margin:6px 0 0;padding-left:18px;line-height:1.4}.cs-companion-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:800;backdrop-filter:blur(2px)}@keyframes cs-slide-in{from{transform:translateX(100%)}to{transform:translateX(0)}}
@media(max-width:760px){.cs-export-header{display:block}.cs-export-actions{margin-top:16px}.cs-export-layout{display:block}.cs-export-nav{position:static;width:auto;height:auto;border-right:0;border-bottom:1px solid var(--line)}.cs-export-nav #cs-page-list{display:flex;overflow:auto}.cs-export-nav button{min-width:180px}.cs-export-reader{padding-inline:10px}.cs-export-pagebar{padding-inline:6px}}
@media print{.cs-export-nav,.cs-export-pager,.cs-companion-toggle,.cs-companion-drawer,.cs-companion-backdrop{display:none}.cs-export-layout{display:block}.cs-export-reader{padding:0}.cs-export-reader iframe{border:0;box-shadow:none}.cs-export-header{padding:20px}}
@media (prefers-color-scheme: dark){
  :root{--paper:#1c1917;--ink:#f5f5f4;--muted:#a8a29e;--line:#44403c;--accent:#f97316;--panel:#292524}
  .cs-export-header{background:rgba(41,37,36,.85)}
  .cs-companion-drawer{background:#292524;color:#f5f5f4}
  .cs-companion-header{background:#1c1917}
  .cs-turn-user{background:#1c1917;color:#f5f5f4;border-color:#44403c}
  .cs-turn-agent{background:#292524;color:#f5f5f4;border-color:#44403c}
  .cs-export-reader iframe{background:#1c1917;border-color:#44403c}
}
`;
