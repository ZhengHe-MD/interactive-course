import { AlertTriangle, X } from "lucide-react";
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
      className="dialog-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="dialog-modal-card conflict"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-dialog-title"
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <span className="conflict-icon-header">
            <AlertTriangle size={20} strokeWidth={2.75} />
          </span>
          <button
            type="button"
            className="dialog-modal-close-btn"
            onClick={onClose}
            aria-label={t("exportDialog.close")}
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <h2 id="conflict-dialog-title" style={{ margin: 0, fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: "20px" }}>
            {t("importConflict.title")}
          </h2>
          <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.55, color: "var(--color-neutral-700)" }}>
            <code>~/.courses/{courseId}</code> {t("importConflict.description").replace("{id}", courseId)}
          </p>
        </div>

        <div className="conflict-option-cards">
          <button
            type="button"
            className="conflict-card-btn primary"
            onClick={() => onResolve("copy")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong className="conflict-card-title">{t("importConflict.copy")}</strong>
              <span className="conflict-card-desc">
                Lands as <code>{courseId}-2</code>; yours is untouched
              </span>
            </div>
          </button>

          <button
            type="button"
            className="conflict-card-btn"
            onClick={() => onResolve("replace")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong className="conflict-card-title" style={{ color: "var(--color-neutral-900)" }}>{t("importConflict.replace")}</strong>
              <span className="conflict-card-desc">
                Existing checkpoints are archived, not deleted
              </span>
            </div>
          </button>
        </div>

        <div className="dialog-modal-actions">
          <button
            type="button"
            className="dialog-btn-cancel"
            onClick={onClose}
          >
            {t("importConflict.cancel")}
          </button>
        </div>
      </section>
    </div>
  );
}
