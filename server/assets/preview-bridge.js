(() => {
  const SOURCE = "course-studio-preview";
  const selections = new Map();
  const selectionOverlays = new Map();
  let inspect = false;
  let altInspect = false;
  let multiple = false;
  let hovered = null;
  let scrollQueued = false;
  let suppressBlockClick = false;

  const overlay = document.createElement("div");
  overlay.setAttribute("data-course-studio-ui", "true");
  overlay.style.cssText = "position:fixed;display:none;pointer-events:none;z-index:2147483646;border:2px solid #c67139;background:rgba(198,113,57,.09);border-radius:5px;box-shadow:0 0 0 1px rgba(255,255,255,.85) inset;transition:all 55ms linear";
  const label = document.createElement("div");
  label.setAttribute("data-course-studio-ui", "true");
  label.style.cssText = "position:fixed;display:none;pointer-events:none;z-index:2147483647;padding:3px 7px;border-radius:5px;background:#201e1d;color:#fff;font:11px/1.3 ui-monospace,SFMono-Regular,monospace;box-shadow:0 2px 7px rgba(0,0,0,.2)";
  document.documentElement.append(overlay, label);

  function createSelectionOverlay(id, element) {
    removeSelectionOverlay(id);
    const box = document.createElement("div");
    box.setAttribute("data-course-studio-ui", "true");
    box.setAttribute("data-selection-id", id);
    box.style.cssText = "position:fixed;pointer-events:none;z-index:2147483644;border:2px solid #c67139;background:rgba(198,113,57,.12);border-radius:5px;box-shadow:0 0 0 1px rgba(255,255,255,.9) inset;transition:all 55ms linear";

    const tagBadge = document.createElement("div");
    tagBadge.setAttribute("data-course-studio-ui", "true");
    tagBadge.setAttribute("data-selection-id", id);
    tagBadge.style.cssText = "position:fixed;pointer-events:none;z-index:2147483645;padding:2px 6px;border-radius:4px;background:#c67139;color:#fff;font:bold 10px/1.3 ui-monospace,SFMono-Regular,monospace;box-shadow:0 2px 5px rgba(0,0,0,.25)";
    tagBadge.textContent = `<${element.tagName.toLowerCase()}>`;

    document.documentElement.append(box, tagBadge);
    selectionOverlays.set(id, { box, tagBadge, element });
    updateOverlayPosition(id);
  }

  function updateOverlayPosition(id) {
    const entry = selectionOverlays.get(id);
    if (!entry || !entry.element || !entry.element.isConnected) return;
    const rect = entry.element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      entry.box.style.display = "none";
      entry.tagBadge.style.display = "none";
      return;
    }
    entry.box.style.display = "block";
    entry.box.style.left = `${rect.left}px`;
    entry.box.style.top = `${rect.top}px`;
    entry.box.style.width = `${rect.width}px`;
    entry.box.style.height = `${rect.height}px`;

    entry.tagBadge.style.display = "block";
    entry.tagBadge.style.left = `${Math.max(6, rect.left)}px`;
    entry.tagBadge.style.top = `${Math.max(6, rect.top - 20)}px`;
  }

  function updateAllSelectionOverlays() {
    for (const id of selectionOverlays.keys()) {
      updateOverlayPosition(id);
    }
  }

  function removeSelectionOverlay(id) {
    const entry = selectionOverlays.get(id);
    if (entry) {
      entry.box.remove();
      entry.tagBadge.remove();
      selectionOverlays.delete(id);
    }
  }

  function clearAllSelectionOverlays() {
    for (const entry of selectionOverlays.values()) {
      entry.box.remove();
      entry.tagBadge.remove();
    }
    selectionOverlays.clear();
  }

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

  function readingSection() {
    const headings = [...document.querySelectorAll("h2")].filter((heading) => (
      (heading.innerText || heading.textContent || "").trim()
    ));
    if (headings.length === 0) return undefined;

    // A line one-third down the viewport approximates where reading is
    // happening better than the raw scroll offset. Keep the latest section
    // above that line; when the first section is entering view, anchor to it.
    const readingLine = Math.min(window.innerHeight * 0.33, 280);
    let current;
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top > readingLine) break;
      current = heading;
    }
    current ??= headings.find((heading) => heading.getBoundingClientRect().top < window.innerHeight);
    if (!current) return undefined;

    const label = (current.innerText || current.textContent || "").replace(/\s+/g, " ").trim();
    if (!label) return undefined;
    return {
      id: current.id || undefined,
      index: headings.indexOf(current),
      label: label.slice(0, 240),
    };
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
    const uiElements = document.querySelectorAll("[data-course-studio-ui]");
    const previousDisplays = [...uiElements].map((el) => el.style.display);
    uiElements.forEach((el) => { el.style.display = "none"; });
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
      uiElements.forEach((el, index) => { el.style.display = previousDisplays[index]; });
    }
  }

  function selectionId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  }

  async function selectBlock(element, existingId) {
    const id = existingId || selectionId();
    selections.set(id, { element, kind: "block" });
    if (!existingId && !multiple) {
      clearAllSelectionOverlays();
    }
    createSelectionOverlay(id, element);
    const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    const screenshot = await thumbnail(element);
    post("selection", {
      selection: {
        id,
        kind: "block",
        tag: element.tagName.toLowerCase(),
        text: text.slice(0, 4_000) || `(${element.tagName.toLowerCase()} element)`,
        outerHTML: element.outerHTML.slice(0, 12_000),
        location: cssPath(element),
        screenshot,
        canExpand: Boolean(element.parentElement && element.parentElement !== document.body),
      },
    });
  }

  function rangeElement(range) {
    const common = range.commonAncestorContainer;
    const commonElement = common instanceof Element ? common : common.parentElement;
    if (commonElement && commonElement !== document.body && commonElement !== document.documentElement) return commonElement;
    const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    return start && start !== document.body && start !== document.documentElement ? start : null;
  }

  async function selectText(range) {
    const element = rangeElement(range);
    const text = range.toString().replace(/\s+/g, " ").trim();
    if (!element || !text || element.closest("[data-course-studio-ui]")) return;

    const fragment = document.createElement("div");
    fragment.append(range.cloneContents());
    const id = selectionId();
    selections.set(id, { element, range: range.cloneRange(), kind: "text" });
    post("selection", {
      selection: {
        id,
        kind: "text",
        tag: element.tagName.toLowerCase(),
        text: text.slice(0, 4_000),
        outerHTML: fragment.innerHTML.slice(0, 12_000) || element.outerHTML.slice(0, 12_000),
        location: cssPath(element),
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
  document.addEventListener("mouseup", () => {
    if (document.body.hasAttribute("data-course-studio-empty")) return;
    const nativeSelection = window.getSelection();
    if (!nativeSelection || nativeSelection.isCollapsed || nativeSelection.rangeCount === 0) return;
    const range = nativeSelection.getRangeAt(0).cloneRange();
    if (!range.toString().trim()) return;
    suppressBlockClick = true;
    window.setTimeout(() => { suppressBlockClick = false; }, 0);
    void selectText(range);
  }, true);

  document.addEventListener("click", (event) => {
    if (!active()) return;
    if (suppressBlockClick) return;
    const target = validTarget(event.target);
    if (!target) {
      clearHover();
      if (!multiple) clearActiveSelections();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    clearHover();

    // Check if target is already selected
    let alreadySelectedId = null;
    for (const [id, entry] of selections.entries()) {
      if (entry.element === target) {
        alreadySelectedId = id;
        break;
      }
    }

    if (alreadySelectedId) {
      selections.delete(alreadySelectedId);
      removeSelectionOverlay(alreadySelectedId);
      post("selection.removed", { id: alreadySelectedId });
      if (selections.size === 0) {
        post("selection.cleared");
      }
      return;
    }

    if (!multiple) {
      selections.clear();
      clearAllSelectionOverlays();
    }
    void selectBlock(target);
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
      clearActiveSelections();
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
    updateAllSelectionOverlays();
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      post("scroll", { top: window.scrollY, section: readingSection() });
    });
  }, { passive: true });

  window.addEventListener("resize", () => {
    clearHover();
    updateAllSelectionOverlays();
  }, { passive: true });

  let suppressSelectionChange = false;

  function clearActiveSelections() {
    if (selections.size === 0 && selectionOverlays.size === 0) return;
    selections.clear();
    clearAllSelectionOverlays();
    post("selection.cleared");
  }

  document.addEventListener("selectionchange", () => {
    if (suppressSelectionChange || active() || document.body.hasAttribute("data-course-studio-empty")) return;
    const nativeSelection = window.getSelection();
    if (nativeSelection && (nativeSelection.isCollapsed || nativeSelection.rangeCount === 0 || !nativeSelection.toString().trim())) {
      let hadText = false;
      for (const [id, entry] of selections.entries()) {
        if (entry.kind === "text") {
          selections.delete(id);
          hadText = true;
        }
      }
      if (hadText) post("selection.cleared", { kind: "text" });
    }
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || event.data?.source !== "course-studio") return;
    if (event.data.type === "inspect") {
      inspect = Boolean(event.data.active);
      if (typeof event.data.multiple === "boolean") {
        multiple = event.data.multiple;
      }
      document.documentElement.style.cursor = inspect ? "crosshair" : "";
      if (!inspect) clearHover();
    }
    if (event.data.type === "selection.multiple") {
      multiple = Boolean(event.data.active);
    }
    if (event.data.type === "selection.expand") {
      const element = selections.get(event.data.id)?.element;
      const parent = element?.parentElement;
      if (parent && parent !== document.body) {
        removeSelectionOverlay(event.data.id);
        void selectBlock(parent, event.data.id);
      }
    }
    if (event.data.type === "selection.remove") {
      selections.delete(event.data.id);
      removeSelectionOverlay(event.data.id);
      suppressSelectionChange = true;
      window.getSelection()?.removeAllRanges();
      window.setTimeout(() => { suppressSelectionChange = false; }, 0);
    }
    if (event.data.type === "selection.clear") {
      selections.clear();
      clearAllSelectionOverlays();
      suppressSelectionChange = true;
      window.getSelection()?.removeAllRanges();
      window.setTimeout(() => { suppressSelectionChange = false; }, 0);
    }
    if (event.data.type === "scroll.restore" && Number.isFinite(event.data.top)) {
      window.scrollTo({ top: event.data.top, behavior: "instant" });
      requestAnimationFrame(() => {
        updateAllSelectionOverlays();
        post("scroll", { top: window.scrollY, section: readingSection() });
      });
    }
    if (event.data.type === "scroll.toSection") {
      const target = (event.data.id && document.getElementById(event.data.id))
        || (Number.isInteger(event.data.index) ? document.querySelectorAll("h2")[event.data.index] : null);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  document.querySelector("[data-course-studio-start]")?.addEventListener("click", () => post("empty.start"));

  post("ready", { title: document.title, top: window.scrollY, section: readingSection() });
})();
