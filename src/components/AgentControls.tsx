import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AgentConfig, AgentModel } from "../types";
import { useI18n } from "../i18n";

type Props = {
  models: AgentModel[];
  value: AgentConfig | null;
  disabled?: boolean;
  className?: string;
  onChange: (config: AgentConfig) => void;
};

export function AgentControls({ models, value, disabled = false, className = "", onChange }: Props) {
  const { t } = useI18n();
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [effortMenuOpen, setEffortMenuOpen] = useState(false);

  const modelRef = useRef<HTMLDivElement | null>(null);
  const effortRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (modelMenuOpen && modelRef.current && !modelRef.current.contains(target)) {
        setModelMenuOpen(false);
      }
      if (effortMenuOpen && effortRef.current && !effortRef.current.contains(target)) {
        setEffortMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [modelMenuOpen, effortMenuOpen]);

  const selectedModel = models.find((model) => model.model === value?.model)
    ?? models.find((model) => model.isDefault)
    ?? models[0];

  if (!selectedModel || !value) return null;

  const efforts = selectedModel.supportedEfforts;
  const selectedEffort = efforts.some((option) => option.effort === value.effort)
    ? value.effort ?? ""
    : efforts.find((option) => option.effort === selectedModel.defaultEffort)?.effort
      ?? efforts[0]?.effort
      ?? "";

  return (
    <div className={`agent-controls-inline ${className}`.trim()} aria-label={t("agent.configuration")}>
      {/* Model Selector Dropdown */}
      <div ref={modelRef} className="custom-dropdown-wrapper">
        <select
          aria-label={t("agent.model")}
          className="sr-only"
          value={selectedModel.model}
          disabled={disabled}
          onChange={(event) => {
            const model = models.find((candidate) => candidate.model === event.target.value);
            if (model) {
              const effort = model.supportedEfforts.find((option) => option.effort === model.defaultEffort)?.effort
                ?? model.supportedEfforts[0]?.effort
                ?? null;
              onChange({ model: model.model, effort });
            }
          }}
        >
          {models.map((model) => (
            <option key={model.model} value={model.model}>{model.displayName}</option>
          ))}
        </select>

        <button
          type="button"
          className={`agent-control-pill-btn ${modelMenuOpen ? "open" : ""}`}
          onClick={() => {
            setEffortMenuOpen(false);
            setModelMenuOpen((prev) => !prev);
          }}
          disabled={disabled || models.length <= 1}
          title={selectedModel.description}
        >
          <span className="agent-control-label">{t("agent.model")}</span>
          <span className="agent-control-value">{selectedModel.displayName}</span>
          <span className={`custom-dropdown-caret ${modelMenuOpen ? "open" : ""}`}>
            <ChevronDown size={12} strokeWidth={2.5} />
          </span>
        </button>

        {modelMenuOpen && (
          <div className="custom-dropdown-menu" role="menu" style={{ minWidth: "240px" }}>
            <span className="custom-dropdown-heading">{t("agent.model")}</span>
            {models.map((m) => {
              const isCurrent = m.model === selectedModel.model;
              return (
                <button
                  type="button"
                  key={m.model}
                  role="menuitem"
                  className={`custom-dropdown-item ${isCurrent ? "active" : ""}`}
                  onClick={() => {
                    setModelMenuOpen(false);
                    const effort = m.supportedEfforts.find((option) => option.effort === m.defaultEffort)?.effort
                      ?? m.supportedEfforts[0]?.effort
                      ?? null;
                    onChange({ model: m.model, effort });
                  }}
                >
                  <span className="custom-dropdown-item-info">
                    <span className="custom-dropdown-item-title">{m.displayName}</span>
                    {m.description && (
                      <span className="custom-dropdown-item-desc">{m.description}</span>
                    )}
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

      {/* Thinking Effort Dropdown */}
      {efforts.length > 0 && (
        <div ref={effortRef} className="custom-dropdown-wrapper">
          <select
            aria-label={t("agent.thinkingEffort")}
            className="sr-only"
            value={selectedEffort}
            disabled={disabled}
            onChange={(event) => onChange({ model: selectedModel.model, effort: event.target.value })}
          >
            {efforts.map((option) => (
              <option key={option.effort} value={option.effort}>{effortLabel(option.effort, t("agent.extraHigh"))}</option>
            ))}
          </select>

          <button
            type="button"
            className={`agent-control-pill-btn ${effortMenuOpen ? "open" : ""}`}
            onClick={() => {
              setModelMenuOpen(false);
              setEffortMenuOpen((prev) => !prev);
            }}
            disabled={disabled || efforts.length <= 1}
            title={efforts.find((option) => option.effort === selectedEffort)?.description}
          >
            <span className="agent-control-label">{t("agent.thinking")}</span>
            <span className="agent-control-value">{effortLabel(selectedEffort, t("agent.extraHigh"))}</span>
            <span className={`custom-dropdown-caret ${effortMenuOpen ? "open" : ""}`}>
              <ChevronDown size={12} strokeWidth={2.5} />
            </span>
          </button>

          {effortMenuOpen && (
            <div className="custom-dropdown-menu align-right" role="menu" style={{ minWidth: "220px" }}>
              <span className="custom-dropdown-heading">{t("agent.thinking")}</span>
              {efforts.map((opt) => {
                const isCurrent = opt.effort === selectedEffort;
                return (
                  <button
                    type="button"
                    key={opt.effort}
                    role="menuitem"
                    className={`custom-dropdown-item ${isCurrent ? "active" : ""}`}
                    onClick={() => {
                      setEffortMenuOpen(false);
                      onChange({ model: selectedModel.model, effort: opt.effort });
                    }}
                  >
                    <span className="custom-dropdown-item-info">
                      <span className="custom-dropdown-item-title">
                        {effortLabel(opt.effort, t("agent.extraHigh"))}
                      </span>
                      {opt.description && (
                        <span className="custom-dropdown-item-desc">{opt.description}</span>
                      )}
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
      )}
    </div>
  );
}

function effortLabel(effort: string, extraHigh: string) {
  if (effort === "xhigh") return extraHigh;
  return effort.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase());
}

