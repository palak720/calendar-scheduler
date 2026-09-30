import { memo } from "react";
import { formatDateTime, formatTime } from "../utils/dateUtils";

// Tailwind ko full class names chahiye (dynamic string banane se class nahi milti)
const COLORS = [
  "bg-blue-100 border-blue-500 text-blue-900",
  "bg-emerald-100 border-emerald-500 text-emerald-900",
  "bg-amber-100 border-amber-500 text-amber-900",
  "bg-rose-100 border-rose-500 text-rose-900",
  "bg-violet-100 border-violet-500 text-violet-900",
  "bg-cyan-100 border-cyan-500 text-cyan-900",
];

const colorFor = (organizerId) =>
  COLORS[Number.isInteger(organizerId) ? organizerId % COLORS.length : 0];

// Ek timed event ka block. Position ka hisaab parent (WeekView) karta hai,
// yahan sirf dikhana aur events forward karna hai.
//
// Props:
//   instance             : recurrence.js ka instance { instanceId, eventId, start, end, event, isRecurring }
//   top, height          : px, din ke andar
//   column, columns, span: overlapLayout ka output
//   clipStart, clipEnd   : event is din se pehle/baad tak jaata hai (us side ka handle nahi dikhega)
//   selected, dragging   : selection aur drag ki state
//   onPointerDown(e, instance, mode) : mode = "move" | "resize-start" | "resize-end"
//   onOpen(instance), onSelect(instance), onKeyDown(e, instance)
function EventBlock({
  instance,
  top,
  height,
  column,
  columns,
  span,
  clipStart,
  clipEnd,
  tz,
  selected,
  dragging,
  onPointerDown,
  onOpen,
  onSelect,
  onKeyDown,
}) {
  const { event, start, end, isRecurring } = instance;

  const left = (column / columns) * 100;
  const width = (span / columns) * 100;

  const timeText = `${formatTime(start, tz)} - ${formatTime(end, tz)}`;
  const label = `${event.title}. ${formatDateTime(start, tz)} to ${formatTime(end, tz)}${
    isRecurring ? ", repeating event" : ""
  }`;

  const compact = height < 34; // chhota block: title aur time ek line mein

  function handleKeyDown(e) {
    if (e.target !== e.currentTarget) return;
    // Pehle drag hook ko mauka (M key, move mode ke arrows, Esc, Enter).
    // Wo preventDefault kare to yahan kuch nahi hota.
    onKeyDown?.(e, instance);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(instance);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      data-instance-id={instance.instanceId}
      data-event-id={event.id}
      onPointerDown={(e) => onPointerDown?.(e, instance, "move")}
      onClick={() => onOpen(instance)}
      onFocus={() => onSelect?.(instance)}
      onKeyDown={handleKeyDown}
      style={{
        top,
        height,
        left: `calc(${left}% + 1px)`,
        width: `calc(${width}% - 2px)`,
      }}
      className={`absolute touch-none select-none overflow-hidden rounded-md border-l-4 px-1.5 text-xs shadow-sm outline-none ${colorFor(
        event.organizerId
      )} ${selected ? "z-20 ring-2 ring-blue-600" : "z-10"} ${
        dragging ? "opacity-40" : ""
      } cursor-grab focus-visible:ring-2 focus-visible:ring-blue-600`}
    >
      {!clipStart && (
        <div
          data-handle="start"
          onPointerDown={(e) => {
            e.stopPropagation(); // move drag shuru na ho
            onPointerDown?.(e, instance, "resize-start");
          }}
          className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
        />
      )}

      <div className={compact ? "flex gap-1 pt-0.5" : "pt-1"}>
        <span className="truncate font-medium">
          {isRecurring && <span aria-hidden="true">↻ </span>}
          {event.title}
        </span>
        <span className={`truncate opacity-75 ${compact ? "" : "block"}`}>{timeText}</span>
      </div>

      {!clipEnd && (
        <div
          data-handle="end"
          onPointerDown={(e) => {
            e.stopPropagation();
            onPointerDown?.(e, instance, "resize-end");
          }}
          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
        />
      )}
    </div>
  );
}

// Custom memo: instances har expand par naye object bante hain, isliye
// identity ke bajay asli values compare karte hain. Handlers stable (useCallback) hone chahiye.
function areEqual(a, b) {
  return (
    a.instance.instanceId === b.instance.instanceId &&
    a.instance.start === b.instance.start &&
    a.instance.end === b.instance.end &&
    a.instance.event === b.instance.event &&
    a.top === b.top &&
    a.height === b.height &&
    a.column === b.column &&
    a.columns === b.columns &&
    a.span === b.span &&
    a.clipStart === b.clipStart &&
    a.clipEnd === b.clipEnd &&
    a.tz === b.tz &&
    a.selected === b.selected &&
    a.dragging === b.dragging &&
    a.onPointerDown === b.onPointerDown &&
    a.onOpen === b.onOpen &&
    a.onSelect === b.onSelect &&
    a.onKeyDown === b.onKeyDown
  );
}

export default memo(EventBlock, areEqual);