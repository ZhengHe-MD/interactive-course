import { Languages } from "lucide-react";
import { useI18n } from "../i18n";

export function LanguageSwitch() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="language-switch">
      <Languages size={14} aria-hidden="true" />
      <span className="sr-only">{t("language.label")}</span>
      <select
        aria-label={t("language.label")}
        value={language}
        onChange={(event) => setLanguage(event.target.value as typeof language)}
      >
        <option value="en">{t("language.english")}</option>
        <option value="zh-CN">{t("language.chinese")}</option>
      </select>
    </label>
  );
}
