import { useEffect, useState } from "react";
import { useCalendarState } from "../store/CalendarContext";

// Kahin se bhi announce karne ke liye (jaise keyboard move mode):
//   import { announce } from "./Announcer";  announce("Moving event");
export function announce(text) {
  window.dispatchEvent(new CustomEvent("cs-announce", { detail: text }));
}

// Screen reader ke liye hidden live region. Poore app mein sirf ek baar lagta hai.
export default function Announcer() {
  const { announce: fromStore } = useCalendarState(); // undo/redo/save fail ke messages
  const [local, setLocal] = useState({ seq: 0, text: "" });

  useEffect(() => {
    const handler = (e) =>
      setLocal((prev) => ({ seq: prev.seq + 1, text: String(e.detail) }));
    window.addEventListener("cs-announce", handler);
    return () => window.removeEventListener("cs-announce", handler);
  }, []);

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {/* key badalne se same text dobara aaye to bhi padha jaata hai */}
        <span key={fromStore.seq}>{fromStore.text}</span>
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        <span key={local.seq}>{local.text}</span>
      </div>
    </>
  );
}