import { Download, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useI18n } from "../i18n";

type ExportFormat = "standalone" | "package";

type Props = {
  open: boolean;
  format: ExportFormat;
  prompt: string;
  exporting: boolean;
  onFormatChange: (format: ExportFormat) => void;
  onPromptChange: (prompt: string) => void;
  onClose: () => void;
  onExport: () => void;
};

export function ExportDialog({
  open,
  format,
  prompt,
  exporting,
  onFormatChange,
  onPromptChange,
  onClose,
  onExport,
}: Props) {
  const { t } = useI18n();
  const textarea = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    if (format === "standalone") textarea.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !exporting) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [exporting, format, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="dialog-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !exporting) onClose();
      }}
    >
      <section
        className="dialog-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
      >
        <form onSubmit={(event) => { event.preventDefault(); onExport(); }}>
          <div className="dialog-modal-header">
            <div>
              <h2 id="export-dialog-title" className="dialog-modal-title">{t("exportDialog.title")}</h2>
              <p className="dialog-modal-desc">
                {format === "standalone" ? t("exportDialog.description") : t("exportDialog.packageDescription")}
              </p>
            </div>
            <button
              type="button"
              className="dialog-modal-close-btn"
              onClick={onClose}
              disabled={exporting}
              aria-label={t("exportDialog.close")}
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>

          <div className="export-formats-grid" role="radiogroup" aria-label={t("exportDialog.formatLabel")} style={{ marginTop: "16px", marginBottom: "16px" }}>
            <button
              type="button"
              className={`export-format-card-btn ${format === "standalone" ? "active" : ""}`}
              onClick={() => onFormatChange("standalone")}
              disabled={exporting}
            >
              <span className="format-radio-circle">
                {format === "standalone" && <span style={{ width: "6px", height: "6px", borderRadius: "999px", background: "#fff" }} />}
              </span>
              <strong className="format-card-label">{t("exportDialog.formatStandalone")}</strong>
              <span className="format-card-detail">{t("exportDialog.description")}</span>
              <span className="format-card-filesize">≈ 340 KB</span>
            </button>

            <button
              type="button"
              className={`export-format-card-btn ${format === "package" ? "active" : ""}`}
              onClick={() => onFormatChange("package")}
              disabled={exporting}
            >
              <span className="format-radio-circle">
                {format === "package" && <span style={{ width: "6px", height: "6px", borderRadius: "999px", background: "#fff" }} />}
              </span>
              <strong className="format-card-label">{t("exportDialog.formatPackage")}</strong>
              <span className="format-card-detail">{t("exportDialog.packageDescription")}</span>
              <span className="format-card-filesize">.course.zip</span>
            </button>
          </div>

          {format === "standalone" && (
            <div className="dialog-input-group" style={{ marginBottom: "16px" }}>
              <label htmlFor="export-prompt" className="dialog-input-label">{t("exportDialog.promptLabel")}</label>
              <textarea
                ref={textarea}
                id="export-prompt"
                className="dialog-modal-textarea"
                rows={2}
                value={prompt}
                disabled={exporting}
                maxLength={20_000}
                placeholder={t("exportDialog.placeholder")}
                onChange={(event) => onPromptChange(event.target.value)}
              />
              <span className="dialog-input-hint">{t("exportDialog.hint")}</span>
            </div>
          )}

          <div className="dialog-modal-actions">
            <button
              type="button"
              className="dialog-btn-cancel"
              onClick={onClose}
              disabled={exporting}
            >
              {t("exportDialog.cancel")}
            </button>
            <button
              type="submit"
              className="dialog-btn-submit"
              disabled={exporting}
            >
              {exporting ? <LoaderCircle className="spin" size={15} /> : <Download size={15} strokeWidth={2.4} />}
              <span>{exporting ? t("exportDialog.preparing") : t("exportDialog.submit")}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
