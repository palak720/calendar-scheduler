import { useEffect, useId, useRef, useState } from "react";
import { fetchUserById, fetchUsers, searchUsers } from "../api/userService";
import { formatTime } from "../utils/dateUtils";

// id -> user. Chips ke naam ke liye, taaki har baar API na jaye.
const cache = new Map();
const remember = (users) => users.forEach((u) => cache.set(u.id, u));
const nameOf = (id) => cache.get(id)?.name || `User ${id}`;

// Props:
//   value     : [attendeeId]
//   onChange  : (ids) => void
//   conflicts : Map(attendeeId -> [instance]) (optional, "busy" warning ke liye)
//   tz        : conflicts ka time dikhane ke liye
//   error, inputId, max, label
export default function AttendeeSelect({
  value,
  onChange,
  conflicts,
  tz,
  error,
  inputId = "attendees",
  max = 50,
  label = "Attendees",
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [active, setActive] = useState(0);
  const [, bump] = useState(0); // cache update par re-render

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ---------- Search (debounce 300ms + purani request cancel) ----------
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const controller = new AbortController();
    setStatus("loading");

    const timer = setTimeout(
      async () => {
        try {
          const { users } = q
            ? await searchUsers(q, { signal: controller.signal })
            : await fetchUsers({ limit: 30, signal: controller.signal });
          remember(users);
          setResults(users);
          setActive(0);
          setStatus("idle");
        } catch (err) {
          if (err?.code === "CANCELLED") return; // naya keystroke aa gaya
          setStatus("error");
        }
      },
      q ? 300 : 0
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  // ---------- Selected ids ke naam (reload ke baad cache khaali hota hai) ----------
  const requested = useRef(new Set());
  useEffect(() => {
    for (const id of value) {
      if (cache.has(id) || requested.current.has(id)) continue;
      requested.current.add(id);
      fetchUserById(id)
        .then((u) => cache.set(u.id, u))
        .catch(() => {})
        .finally(() => {
          if (mounted.current) bump((n) => n + 1);
        });
    }
  }, [value]);

  // Bahar click par list band
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  const selected = new Set(value);

  function toggle(user) {
    cache.set(user.id, user);
    if (selected.has(user.id)) onChange(value.filter((id) => id !== user.id));
    else if (value.length < max) onChange([...value, user.id]);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault(); // form submit na ho
      if (open && results[active]) toggle(results[active]);
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation(); // sirf list band ho, modal nahi
        setOpen(false);
      }
    } else if (e.key === "Backspace" && query === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  const activeId = open && results[active] ? `${listId}-opt-${active}` : undefined;
  const busyEntries = conflicts ? Array.from(conflicts.entries()) : [];

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>

      <div
        className={`mt-1 flex flex-wrap gap-1 rounded-md border bg-white p-1 focus-within:ring-2 focus-within:ring-blue-500 ${
          error ? "border-red-500" : "border-slate-300"
        }`}
      >
        {value.map((id) => (
          <span
            key={id}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
              conflicts?.has(id) ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-800"
            }`}
          >
            {nameOf(id)}
            {conflicts?.has(id) && <span className="font-medium">busy</span>}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== id))}
              aria-label={`Remove ${nameOf(id)}`}
              className="rounded-full px-1 hover:bg-black/10"
            >
              ✕
            </button>
          </span>
        ))}

        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={Boolean(error)}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length ? "" : "Search people..."}
          autoComplete="off"
          className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className="absolute z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg"
        >
          {status === "loading" && results.length === 0 && (
            <li className="px-3 py-2 text-slate-500">Loading...</li>
          )}
          {status === "error" && <li className="px-3 py-2 text-red-600">Could not load people</li>}
          {status === "idle" && results.length === 0 && (
            <li className="px-3 py-2 text-slate-500">No people found</li>
          )}
          {results.map((u, i) => (
            <li
              key={u.id}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={selected.has(u.id)}
              onMouseDown={(e) => e.preventDefault()} // input ka focus na jaye
              onClick={() => toggle(u)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${
                i === active ? "bg-blue-50" : ""
              }`}
            >
              <span className="w-4 text-blue-600">{selected.has(u.id) ? "✓" : ""}</span>
              <span className="flex-1 truncate">{u.name}</span>
              <span className="truncate text-xs text-slate-400">{u.email}</span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p id={`${inputId}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}

      {/* Live conflict warning: screen reader bhi padhta hai */}
      <div role="status" aria-live="polite">
        {busyEntries.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {busyEntries.map(([id, list]) => (
              <li key={id}>
                <strong>{nameOf(id)}</strong> is busy {formatTime(list[0].start, tz)} to{" "}
                {formatTime(list[0].end, tz)} ({list[0].event.title}
                {list.length > 1 ? ` and ${list.length - 1} more` : ""})
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}