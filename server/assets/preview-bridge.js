// Studio preview bridge. The studio server injects this into every course HTML
// page it serves — it is NOT part of the course itself, so course files stay
// clean. It gives the parent studio two things: DevTools-style element
// selection, and scroll preservation across live reloads.
(function () {
  "use strict";
  var MARK = "data-studio-selected";
  var SCROLL_KEY = "studio:scroll:" + location.pathname;

  // --- scroll preservation across reloads ---------------------------------
  try {
    var saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved) window.scrollTo(0, parseInt(saved, 10) || 0);
  } catch (e) {}
  window.addEventListener(
    "scroll",
    function () {
      try {
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
      } catch (e) {}
    },
    { passive: true },
  );

  // --- inspect + selection ------------------------------------------------
  var inspecting = false;
  var hovered = null;
  var box = document.createElement("div");
  box.style.cssText =
    "position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #c67139;" +
    "background:rgba(198,113,57,0.12);border-radius:4px;display:none;transition:all .04s;";
  var label = document.createElement("div");
  label.style.cssText =
    "position:fixed;z-index:2147483647;pointer-events:none;font:600 11px/1.4 ui-monospace,monospace;" +
    "background:#c67139;color:#fff;padding:2px 6px;border-radius:4px;display:none;white-space:nowrap;";
  function mount() {
    if (document.body) {
      document.body.appendChild(box);
      document.body.appendChild(label);
    }
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  function setInspecting(on) {
    inspecting = on;
    document.documentElement.style.cursor = on ? "crosshair" : "";
    if (!on) hideBox();
  }
  function hideBox() {
    box.style.display = "none";
    label.style.display = "none";
    hovered = null;
  }
  function drawBox(el) {
    var r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = r.left + "px";
    box.style.top = r.top + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
    var name = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "");
    label.textContent = name;
    label.style.display = "block";
    label.style.left = r.left + "px";
    label.style.top = Math.max(0, r.top - 20) + "px";
  }

  document.addEventListener(
    "mousemove",
    function (e) {
      if (!inspecting) return;
      var el = e.target;
      if (!el || el === box || el === label || el === hovered) return;
      hovered = el;
      drawBox(el);
    },
    true,
  );

  document.addEventListener(
    "click",
    function (e) {
      if (!inspecting) return;
      e.preventDefault();
      e.stopPropagation();
      var el = e.target;
      if (!el || el.nodeType !== 1) return;
      select(el);
    },
    true,
  );

  // Escape exits inspect mode.
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && inspecting) {
      parent.postMessage({ type: "studio:inspect-off" }, "*");
      setInspecting(false);
    }
  });

  function select(el) {
    document.querySelectorAll("[" + MARK + "]").forEach(function (n) {
      n.removeAttribute(MARK);
    });
    el.setAttribute(MARK, "1");
    var r = el.getBoundingClientRect();
    parent.postMessage(
      {
        type: "studio:selected",
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140),
        snippet: clip(el.outerHTML, 4000),
        locationHint: locate(el),
        rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      },
      "*",
    );
    setInspecting(false);
    parent.postMessage({ type: "studio:inspect-off" }, "*");
  }

  // A readable path to the element: tag#id / nth-of-type chain + nearby text.
  function locate(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 5) {
      var seg = node.tagName.toLowerCase();
      if (node.id) {
        seg += "#" + node.id;
        parts.unshift(seg);
        break;
      }
      var i = 1;
      var sib = node;
      while ((sib = sib.previousElementSibling)) {
        if (sib.tagName === node.tagName) i++;
      }
      if (i > 1) seg += ":nth-of-type(" + i + ")";
      parts.unshift(seg);
      node = node.parentElement;
    }
    var path = parts.join(" > ");
    var text = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
    return text ? path + '  (near text: "' + text + '")' : path;
  }

  function clip(s, n) {
    return s.length > n ? s.slice(0, n) + "\n<!-- …truncated… -->" : s;
  }

  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.type === "studio:set-inspect") setInspecting(!!d.on);
    else if (d.type === "studio:scroll-to") {
      var target = document.getElementById(d.id);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // Keep the highlight box aligned while scrolling in inspect mode.
  window.addEventListener(
    "scroll",
    function () {
      if (inspecting && hovered) drawBox(hovered);
    },
    { passive: true, capture: true },
  );

  parent.postMessage({ type: "studio:preview-ready" }, "*");
})();
