import { Download, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useI18n } from "../i18n";

type Props = {
  open: boolean;
  prompt: string;
  exporting: boolean;
  onPromptChange: (prompt: string) => void;
  onClose: () => void;
  onExport: () => void;
};

export function ExportDialog({ open, prompt, exporting, onPromptChange, onClose, onExport }: Props) {
  const { t } = useI18n();
  const textarea = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    textarea.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !exporting) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [exporting, onClose, open]);

  if (!open) return null;
  return (
    <div
      className="export-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !exporting) onClose();
      }}
    >
      <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
        <form onSubmit={(event) => { event.preventDefault(); onExport(); }}>
          <header>
            <div>
              <h2 id="export-dialog-title">{t("exportDialog.title")}</h2>
              <p>{t("exportDialog.description")}</p>
            </div>
            <button type="button" className="export-dialog-close" onClick={onClose} disabled={exporting} aria-label={t("exportDialog.close")}>
              <X size={18} />
            </button>
          </header>
          <label htmlFor="export-prompt">{t("exportDialog.promptLabel")}</label>
          <textarea
            ref={textarea}
            id="export-prompt"
            value={prompt}
            disabled={exporting}
            maxLength={20_000}
            placeholder={t("exportDialog.placeholder")}
            onChange={(event) => onPromptChange(event.target.value)}
          />
          <p className="export-dialog-hint">{t("exportDialog.hint")}</p>
          <footer>
            <button type="button" className="export-dialog-cancel" onClick={onClose} disabled={exporting}>
              {t("exportDialog.cancel")}
            </button>
            <button type="submit" className="export-dialog-submit" disabled={exporting}>
              {exporting ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
              {exporting ? t("exportDialog.preparing") : t("exportDialog.submit")}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
