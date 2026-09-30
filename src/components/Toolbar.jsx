import { memo } from "react";
import { useAuth } from "../store/AuthContext";
import { useCalendarActions, useCalendarState } from "../store/CalendarContext";
import { useHistory } from "../hooks/useHistory";
import { TIMEZONE_OPTIONS } from "../utils/dateUtils";

const btn =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40";

function SyncStatus() {
  const { sync } = useCalendarState();
  const { clearSyncError } = useCalendarActions();

  if (sync.status === "saving") {
    return <span className="text-sm text-amber-600">Saving...</span>;
  }
  if (sync.status === "saved") {
    return <span className="text-sm text-green-600">Saved</span>;
  }
  if (sync.status === "failed") {
    return (
      <span className="flex items-center gap-2 text-sm text-red-600">
        Failed to save
        <button
          onClick={clearSyncError}
          className="rounded border border-red-300 px-2 text-xs hover:bg-red-50"
        >
          Dismiss
        </button>
      </span>
    );
  }
  return null;
}

// Sirf props aur chhote context use karta hai, isliye drag ke dauran re-render nahi hota
function Toolbar({
  title,
  view,
  tz,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onTzChange,
  children, // attendee filter yahan aayega
}) {
  const { user, logout } = useAuth();
  // Shortcuts (Ctrl+Z) sirf yahin lagte hain, warna ek keypress par do undo
  const { undo, redo, canUndo, canRedo, undoLabel, redoLabel } = useHistory({
    enableShortcuts: true,
  });

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-2">
      <h1 className="min-w-40 text-lg font-semibold text-slate-900">{title}</h1>

      <div className="flex items-center gap-1" role="group" aria-label="Navigate">
        <button className={btn} onClick={onPrev} aria-label="Previous">
          ‹
        </button>
        <button className={btn} onClick={onToday}>
          Today
        </button>
        <button className={btn} onClick={onNext} aria-label="Next">
          ›
        </button>
      </div>

      <div className="flex" role="group" aria-label="View">
        {["week", "month"].map((v) => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            aria-pressed={view === v}
            className={`border border-slate-300 px-3 py-1.5 text-sm capitalize first:rounded-l-md last:rounded-r-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              view === v ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <select
        value={tz}
        onChange={(e) => onTzChange(e.target.value)}
        aria-label="Timezone"
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
      >
        {/* URL se aaya valid tz list mein na ho tab bhi dikhe */}
        {(TIMEZONE_OPTIONS.includes(tz) ? TIMEZONE_OPTIONS : [tz, ...TIMEZONE_OPTIONS]).map(
          (z) => (
            <option key={z} value={z}>
              {z}
            </option>
          )
        )}
      </select>

      {children}

      <div className="flex items-center gap-1" role="group" aria-label="History">
        <button
          className={btn}
          onClick={undo}
          disabled={!canUndo}
          title={undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : "Nothing to undo"}
          aria-label="Undo"
        >
          ↶ Undo
        </button>
        <button
          className={btn}
          onClick={redo}
          disabled={!canRedo}
          title={redoLabel ? `Redo: ${redoLabel} (Ctrl+Shift+Z)` : "Nothing to redo"}
          aria-label="Redo"
        >
          ↷ Redo
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <SyncStatus />
        <span className="hidden text-sm text-slate-500 sm:inline">{user?.firstName}</span>
        <button className={btn} onClick={logout}>
          Log out
        </button>
      </div>
    </header>
  );
}

export default memo(Toolbar);