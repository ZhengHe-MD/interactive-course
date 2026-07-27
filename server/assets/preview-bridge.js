(() => {
  const SOURCE = "course-studio-preview";
  const selections = new Map();
  let inspect = false;
  let altInspect = false;
  let hovered = null;
  let scrollQueued = false;

  const overlay = document.createElement("div");
  overlay.setAttribute("data-course-studio-ui", "true");
  overlay.style.cssText = "position:fixed;display:none;pointer-events:none;z-index:2147483646;border:2px solid #c67139;background:rgba(198,113,57,.09);border-radius:5px;box-shadow:0 0 0 1px rgba(255,255,255,.85) inset;transition:all 55ms linear";
  const label = document.createElement("div");
  label.setAttribute("data-course-studio-ui", "true");
  label.style.cssText = "position:fixed;display:none;pointer-events:none;z-index:2147483647;padding:3px 7px;border-radius:5px;background:#201e1d;color:#fff;font:11px/1.3 ui-monospace,SFMono-Regular,monospace;box-shadow:0 2px 7px rgba(0,0,0,.2)";
  document.documentElement.append(overlay, label);

  function post(type, payload = {}) {
    window.parent.postMessage({ source: SOURCE, type, ...payload }, window.location.origin);
  }

  function active() {
    return !document.body.hasAttribute("data-course-studio-empty") && (inspect || altInspect);
  }

  function validTarget(target) {
    if (!(target instanceof Element)) return null;
    if (target.closest("[data-course-studio-ui]")) return null;
    if (target === document.documentElement || target === document.body) return null;
    return target;
  }

  function cssPath(element) {
    const parts = [];
    let node = element;
    while (node && node !== document.body && parts.length < 8) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        part += `#${CSS.escape(node.id)}`;
        parts.unshift(part);
        break;
      }
      const usefulClasses = [...node.classList].filter((name) => !name.startsWith("is-")).slice(0, 2);
      if (usefulClasses.length) part += usefulClasses.map((name) => `.${CSS.escape(name)}`).join("");
      if (node.parentElement) {
        const siblings = [...node.parentElement.children].filter((sibling) => sibling.tagName === node.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function drawHover(element) {
    hovered = element;
    const rect = element.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    label.textContent = `<${element.tagName.toLowerCase()}> ${Math.round(rect.width)}×${Math.round(rect.height)}`;
    label.style.display = "block";
    label.style.left = `${Math.max(6, rect.left)}px`;
    label.style.top = `${Math.max(6, rect.top - 25)}px`;
  }

  function clearHover() {
    hovered = null;
    overlay.style.display = "none";
    label.style.display = "none";
  }

  async function thumbnail(element) {
    if (typeof window.html2canvas !== "function") return undefined;
    const previousOverlay = overlay.style.display;
    const previousLabel = label.style.display;
    overlay.style.display = "none";
    label.style.display = "none";
    try {
      const elementBackground = getComputedStyle(element).backgroundColor;
      const bodyBackground = getComputedStyle(document.body).backgroundColor;
      const backgroundColor = elementBackground === "rgba(0, 0, 0, 0)"
        ? (bodyBackground === "rgba(0, 0, 0, 0)" ? "#ffffff" : bodyBackground)
        : elementBackground;
      const canvas = await window.html2canvas(element, {
        backgroundColor,
        logging: false,
        scale: Math.min(window.devicePixelRatio || 1, 1.25),
        useCORS: true,
      });
      const maxWidth = 360;
      const maxHeight = 220;
      const scale = Math.min(1, maxWidth / canvas.width, maxHeight / canvas.height);
      const output = document.createElement("canvas");
      output.width = Math.max(1, Math.round(canvas.width * scale));
      output.height = Math.max(1, Math.round(canvas.height * scale));
      const context = output.getContext("2d");
      if (!context) return undefined;
      context.drawImage(canvas, 0, 0, output.width, output.height);
      context.fillStyle = "rgba(198, 113, 57, 0.10)";
      context.fillRect(0, 0, output.width, output.height);
      context.strokeStyle = "#c67139";
      context.lineWidth = Math.max(2, Math.min(output.width, output.height) * 0.025);
      context.strokeRect(context.lineWidth / 2, context.lineWidth / 2, output.width - context.lineWidth, output.height - context.lineWidth);
      return output.toDataURL("image/png");
    } catch {
      return undefined;
    } finally {
      overlay.style.display = previousOverlay;
      label.style.display = previousLabel;
    }
  }

  async function select(element, existingId) {
    const id = existingId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    selections.set(id, element);
    const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    const screenshot = await thumbnail(element);
    post("selection", {
      selection: {
        id,
        tag: element.tagName.toLowerCase(),
        text: text.slice(0, 180) || `(${element.tagName.toLowerCase()} element)`,
        outerHTML: element.outerHTML.slice(0, 12_000),
        location: cssPath(element),
        screenshot,
        canExpand: Boolean(element.parentElement && element.parentElement !== document.body),
      },
    });
  }

  document.addEventListener("mousemove", (event) => {
    if (!active()) return clearHover();
    const target = validTarget(event.target);
    if (target && target !== hovered) drawHover(target);
  }, true);

  document.addEventListener("mouseleave", clearHover, true);
  document.addEventListener("click", (event) => {
    if (!active()) return;
    const target = validTarget(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    inspect = false;
    altInspect = false;
    clearHover();
    void select(target);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Alt") {
      altInspect = true;
      document.documentElement.style.cursor = "crosshair";
    }
    if (event.key === "Escape") {
      inspect = false;
      altInspect = false;
      clearHover();
      document.documentElement.style.cursor = "";
      post("inspect.cancelled");
    }
  }, true);
  document.addEventListener("keyup", (event) => {
    if (event.key === "Alt") {
      altInspect = false;
      if (!inspect) document.documentElement.style.cursor = "";
      clearHover();
    }
  }, true);

  window.addEventListener("scroll", () => {
    clearHover();
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      post("scroll", { top: window.scrollY });
    });
  }, { passive: true });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || event.data?.source !== "course-studio") return;
    if (event.data.type === "inspect") {
      inspect = Boolean(event.data.active);
      document.documentElement.style.cursor = inspect ? "crosshair" : "";
      if (!inspect) clearHover();
    }
    if (event.data.type === "selection.expand") {
      const element = selections.get(event.data.id);
      const parent = element?.parentElement;
      if (parent && parent !== document.body) void select(parent, event.data.id);
    }
    if (event.data.type === "scroll.restore" && Number.isFinite(event.data.top)) {
      window.scrollTo({ top: event.data.top, behavior: "instant" });
    }
    if (event.data.type === "scroll.toSection") {
      // The studio derives its table of contents from the course HTML on the
      // server. Prefer the heading's own id; fall back to its position.
      const target = (event.data.id && document.getElementById(event.data.id))
        || (Number.isInteger(event.data.index) ? document.querySelectorAll("h2")[event.data.index] : null);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  document.querySelector("[data-course-studio-start]")?.addEventListener("click", () => post("empty.start"));

  post("ready", { title: document.title, top: window.scrollY });
})();
