import {
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type AccessibleDialogProps = {
  children: ReactNode;
  className: string;
  labelledBy: string;
  describedBy?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
};

/**
 * A small modal primitive shared by the account and checkout surfaces.
 *
 * It is rendered outside `#root`, allowing the entire application behind it
 * to become inert while preserving a real, keyboard-contained dialog.
 */
export function AccessibleDialog({
  children,
  className,
  labelledBy,
  describedBy,
  initialFocusRef,
  onClose,
}: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const application = document.getElementById("root");
    const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const wasInert = Boolean(application?.inert);
    const previousAriaHidden = application?.getAttribute("aria-hidden") ?? null;

    document.body.classList.add("landing-dialog-open");
    if (application) {
      application.inert = true;
      application.setAttribute("aria-hidden", "true");
    }

    const focusableElements = () => Array.from(
      dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");

    const initial = initialFocusRef?.current ?? focusableElements()[0] ?? dialog;
    initial?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("landing-dialog-open");
      if (application) {
        application.inert = wasInert;
        if (previousAriaHidden === null) application.removeAttribute("aria-hidden");
        else application.setAttribute("aria-hidden", previousAriaHidden);
      }
      if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
    };
  }, [initialFocusRef]);

  const closeFromBackdrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return createPortal(
    <div className="landing-login-backdrop" onMouseDown={closeFromBackdrop}>
      <section
        ref={dialogRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}
