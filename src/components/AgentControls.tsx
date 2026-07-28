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
    <div className={`agent-controls ${className}`.trim()} aria-label={t("agent.configuration")}>
      <label title={selectedModel.description}>
        <span>{t("agent.model")}</span>
        <select
          aria-label={t("agent.model")}
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
      </label>

      {efforts.length > 0 && (
        <label title={efforts.find((option) => option.effort === selectedEffort)?.description}>
          <span>{t("agent.thinking")}</span>
          <select
            aria-label={t("agent.thinkingEffort")}
            value={selectedEffort}
            disabled={disabled}
            onChange={(event) => onChange({ model: selectedModel.model, effort: event.target.value })}
          >
            {efforts.map((option) => (
              <option key={option.effort} value={option.effort}>{effortLabel(option.effort, t("agent.extraHigh"))}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function effortLabel(effort: string, extraHigh: string) {
  if (effort === "xhigh") return extraHigh;
  return effort.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase());
}
