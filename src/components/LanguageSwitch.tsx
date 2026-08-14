import { Check, ChevronDown, Languages } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n, type Language } from "../i18n";

export function LanguageSwitch() {
  const { language, setLanguage, t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (open && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [open]);

  const languages: Array<{ id: Language; label: string }> = [
    { id: "en", label: t("language.english") },
    { id: "zh-CN", label: t("language.chinese") },
  ];

  const currentLabel = languages.find((l) => l.id === language)?.label ?? "English";

  return (
    <div ref={containerRef} className="custom-dropdown-wrapper">
      <select
        aria-label={t("language.label")}
        className="sr-only"
        tabIndex={-1}
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
      >
        <option value="en">{t("language.english")}</option>
        <option value="zh-CN">{t("language.chinese")}</option>
      </select>

      <button
        type="button"
        className={`language-switch-btn ${open ? "open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t("language.label")}
        title={t("language.label")}
      >
        <Languages size={13} aria-hidden="true" strokeWidth={2.4} />
        <span className="language-switch-label">{currentLabel}</span>
        <span className={`language-switch-caret ${open ? "open" : ""}`}>
          <ChevronDown size={13} strokeWidth={2.5} />
        </span>
      </button>

      {open && (
        <div className="custom-dropdown-menu align-right" role="menu">
          <span className="custom-dropdown-heading">{t("language.label")}</span>
          {languages.map((item) => {
            const isCurrent = item.id === language;
            return (
              <button
                type="button"
                key={item.id}
                role="menuitem"
                className={`custom-dropdown-item ${isCurrent ? "active" : ""}`}
                onClick={() => {
                  setLanguage(item.id);
                  setOpen(false);
                }}
              >
                <span className="custom-dropdown-item-info">
                  <span className="custom-dropdown-item-title">{item.label}</span>
                </span>
                {isCurrent && (
                  <Check className="custom-dropdown-check" size={14} strokeWidth={2.75} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

