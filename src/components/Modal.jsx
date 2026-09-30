import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function Modal({ title, onClose, children, size = "md" }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Open: focus andar. Close: focus wapas wahi jahan se aaya tha.
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    const first = dialog.querySelector("[data-autofocus]") || dialog.querySelector(FOCUSABLE);
    (first || dialog).focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // peeche ka page scroll na ho

    return () => {
      document.body.style.overflow = prevOverflow;
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // sirf sabse upar wala modal band ho
      onCloseRef.current();
      return;
    }
    if (e.key !== "Tab") return;

    // Focus trap: Tab last se first par, Shift+Tab first se last par
    const nodes = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE)).filter(
      (n) => n.offsetParent !== null || n === document.activeElement
    );
    if (nodes.length === 0) {
      e.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;

    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Backdrop click se band nahi karte: form ka data galti se na jaye. Esc aur buttons hain.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`flex max-h-full w-full flex-col rounded-xl bg-white shadow-xl outline-none ${
          size === "sm" ? "max-w-sm" : "max-w-lg"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="Close"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}