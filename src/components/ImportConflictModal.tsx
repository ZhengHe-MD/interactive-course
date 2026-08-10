import { AlertTriangle, Copy, RefreshCw, X } from "lucide-react";
import { useEffect } from "react";
import { useI18n } from "../i18n";

type Props = {
  open: boolean;
  courseId: string;
  onResolve: (action: "replace" | "copy") => void;
  onClose: () => void;
};

export function ImportConflictModal({ open, courseId, onResolve, onClose }: Props) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="export-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="export-dialog conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-dialog-title">
        <header>
          <div className="conflict-header-title">
            <AlertTriangle className="conflict-icon" size={20} />
            <h2 id="conflict-dialog-title">{t("importConflict.title")}</h2>
          </div>
          <button type="button" className="export-dialog-close" onClick={onClose} aria-label={t("exportDialog.close")}>
            <X size={18} />
          </button>
        </header>

        <p className="conflict-description">
          {t("importConflict.description").replace("{id}", courseId)}
        </p>

        <div className="conflict-actions">
          <button
            type="button"
            className="conflict-action-button primary"
            onClick={() => onResolve("copy")}
          >
            <Copy size={16} />
            <div>
              <strong>{t("importConflict.copy")}</strong>
            </div>
          </button>
          <button
            type="button"
            className="conflict-action-button danger"
            onClick={() => onResolve("replace")}
          >
            <RefreshCw size={16} />
            <div>
              <strong>{t("importConflict.replace")}</strong>
            </div>
          </button>
        </div>

        <footer>
          <button type="button" className="export-dialog-cancel" onClick={onClose}>
            {t("importConflict.cancel")}
          </button>
        </footer>
      </section>
    </div>
  );
}
