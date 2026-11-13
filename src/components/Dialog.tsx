import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { t } from "../i18n";

export function Dialog({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
  dismissible = true,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current;
    const initial = !dismissible
      ? dialog?.querySelector<HTMLElement>("input:checked")
      : null;
    (
      initial || dialog?.querySelector<HTMLElement>("button, input, select")
    )?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (dismissible) onClose();
      }
      if (event.key === "Tab") {
        const focusable = dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not([type="radio"]), input[type="radio"]:checked, select, a[href], [tabindex="0"]',
        );
        if (!focusable?.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [onClose, dismissible]);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`dialog ${wide ? "wide" : ""}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2 id="dialog-title">{title}</h2>
          </div>
          {dismissible && (
            <button
              className="icon-button"
              onClick={onClose}
              aria-label={t("Dialog schließen", "Close dialog")}
            >
              <X size={20} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
