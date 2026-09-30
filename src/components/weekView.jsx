import { memo, useEffect, useMemo, useRef, useState } from "react";
import EventBlock from "./EventBlock";
import { layoutDayEvents } from "../utils/overlapLayout";
import {
  MINUTE,
  SNAP_MINUTES,
  civilToKey,
  dayBoundsUtc,
  formatCivilLong,
  formatDayNumber,
  formatHourLabel,
  formatTime,
  formatWeekdayShort,
  isSameCivil,
  minutesOfDay,
  todayCivil,
} from "../utils/dateUtils";
import {
  ALL_DAY_ROW_HEIGHT,
  GRID_HEIGHT,
  GUTTER_WIDTH,
  HOUR_HEIGHT,
  MIN_EVENT_MINUTES,
  PX_PER_MINUTE,
} from "../utils/gridConstants";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Ghante ki lines: CSS gradient, 24 alag div nahi
const hourLines = {
  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${
    HOUR_HEIGHT - 1
  }px, #e2e8f0 ${HOUR_HEIGHT - 1}px, #e2e8f0 ${HOUR_HEIGHT}px)`,
};

// Props:
//   days, tz, instances       : useCalendar se
//   selectedId, draggingId    : instanceId
//   gridRef                   : drag hook ko geometry ke liye (body row)
//   previewRef                : drag hook ka preview element (rAF se move hota hai)
//   onSlotPointerDown(e, day) : khaali jagah par drag = naya event
//   onSlotActivate(day, mins) : keyboard Enter se naya event
//   onEventPointerDown, onEventKeyDown, onOpen, onSelect : EventBlock ke liye (stable callbacks)
function WeekView({
  days,
  tz,
  instances,
  selectedId,
  draggingId,
  gridRef,
  previewRef,
  onSlotPointerDown,
  onSlotActivate,
  onEventPointerDown,
  onEventKeyDown,
  onOpen,
  onSelect,
}) {
  const scrollRef = useRef(null);
  const highlightRef = useRef(null);
  const [cell, setCell] = useState({ col: 0, minutes: 9 * 60 }); // keyboard focus ka slot
  const [cellActive, setCellActive] = useState(false);

  // Aaj wala column pehle focus mile
  const today = useMemo(() => todayCivil(tz), [tz]);
  const todayCol = days.findIndex((d) => isSameCivil(d, today));
  const activeCol = cellActive || todayCol < 0 ? cell.col : todayCol;

  // ---------- Har din ka layout (instances ya days badle tabhi dobara) ----------
  const dayData = useMemo(() => {
    return days.map((day) => {
      const { startUtc, endUtc } = dayBoundsUtc(day, tz);
      const allDay = [];
      const timed = [];
      const items = [];

      for (const inst of instances) {
        if (inst.start >= endUtc || inst.end <= startUtc) continue;
        if (inst.event.allDay) {
          allDay.push(inst);
          continue;
        }
        const cs = Math.max(inst.start, startUtc);
        const ce = Math.min(inst.end, endUtc);
        timed.push({ inst, cs, ce });
        items.push({ id: inst.instanceId, start: cs, end: ce });
      }

      const layout = layoutDayEvents(items, MIN_EVENT_MINUTES * MINUTE);

      const blocks = timed.map(({ inst, cs, ce }) => {
        const top = minutesOfDay(cs, tz) * PX_PER_MINUTE;
        const mins = Math.max((ce - cs) / MINUTE, MIN_EVENT_MINUTES);
        const height = Math.min(mins * PX_PER_MINUTE, GRID_HEIGHT - top) - 1;
        return {
          inst,
          top,
          height,
          clipStart: inst.start < startUtc,
          clipEnd: inst.end > endUtc,
          pos: layout.get(inst.instanceId) || { column: 0, columns: 1, span: 1 },
        };
      });

      return { day, key: civilToKey(day), isToday: isSameCivil(day, today), allDay, blocks };
    });
  }, [days, tz, instances, today]);

  // Pehli baar 8 AM tak scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 8 * HOUR_HEIGHT;
  }, []);

  // Keyboard slot dikhta rahe
  useEffect(() => {
    if (cellActive) highlightRef.current?.scrollIntoView({ block: "nearest" });
  }, [cell, cellActive]);

  // ---------- Grid keyboard navigation ----------
  function focusColumn(col) {
    gridRef?.current?.querySelector(`[data-col="${col}"]`)?.focus();
  }

  function handleCellKeyDown(e, col, day) {
    if (e.target !== e.currentTarget) return; // event block ke andar ke keys yahan nahi
    let next = null;

    if (e.key === "ArrowLeft") next = { col: Math.max(0, col - 1), minutes: cell.minutes };
    else if (e.key === "ArrowRight")
      next = { col: Math.min(days.length - 1, col + 1), minutes: cell.minutes };
    else if (e.key === "ArrowUp")
      next = { col, minutes: Math.max(0, cell.minutes - SNAP_MINUTES) };
    else if (e.key === "ArrowDown")
      next = { col, minutes: Math.min(24 * 60 - SNAP_MINUTES, cell.minutes + SNAP_MINUTES) };
    else if (e.key === "Enter") {
      e.preventDefault();
      onSlotActivate?.(day, cell.minutes);
      return;
    } else return;

    e.preventDefault();
    setCell(next);
    if (next.col !== col) focusColumn(next.col);
  }

  const rangeLabel = `${formatCivilLong(days[0])} to ${formatCivilLong(days[6])}`;

  return (
    <div
      role="grid"
      aria-label={`Week view, ${rangeLabel}. Use arrow keys to pick a time slot, Enter to create an event.`}
      aria-rowcount={3}
      aria-colcount={8}
      className="flex h-full min-h-0 flex-col bg-white"
    >
      {/* ---------- Header row ---------- */}
      <div role="row" className="flex border-b border-slate-200">
        <div style={{ width: GUTTER_WIDTH }} className="shrink-0" />
        {dayData.map((d) => (
          <div
            key={d.key}
            role="columnheader"
            className="flex-1 border-l border-slate-200 py-1 text-center"
          >
            <div className="text-xs uppercase text-slate-500">{formatWeekdayShort(d.day)}</div>
            <div
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-lg ${
                d.isToday ? "bg-blue-600 text-white" : "text-slate-900"
              }`}
            >
              {formatDayNumber(d.day)}
            </div>
          </div>
        ))}
      </div>

      {/* ---------- All-day row ---------- */}
      <div role="row" className="flex border-b border-slate-200">
        <div
          style={{ width: GUTTER_WIDTH }}
          className="shrink-0 pr-1 pt-1 text-right text-[10px] text-slate-400"
        >
          all-day
        </div>
        {dayData.map((d) => (
          <div
            key={d.key}
            role="gridcell"
            style={{ minHeight: ALL_DAY_ROW_HEIGHT }}
            className="flex-1 space-y-0.5 border-l border-slate-200 p-0.5"
          >
            {d.allDay.map((inst) => (
              <button
                key={inst.instanceId}
                onClick={() => onOpen(inst)}
                onFocus={() => onSelect?.(inst)}
                className={`block w-full truncate rounded bg-blue-100 px-1 text-left text-xs text-blue-900 focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  selectedId === inst.instanceId ? "ring-2 ring-blue-600" : ""
                }`}
              >
                {inst.event.title}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ---------- Time grid (scroll hota hai) ---------- */}
      <div ref={scrollRef} role="rowgroup" className="min-h-0 flex-1 overflow-y-auto">
        <div
          ref={gridRef}
          role="row"
          className="relative flex"
          style={{ height: GRID_HEIGHT }}
        >
          {/* Hour labels */}
          <div style={{ width: GUTTER_WIDTH }} className="relative shrink-0" aria-hidden="true">
            {HOURS.slice(1).map((h) => (
              <div
                key={h}
                style={{ top: h * HOUR_HEIGHT - 8 }}
                className="absolute right-1 text-[10px] text-slate-400"
              >
                {formatHourLabel(h)}
              </div>
            ))}
          </div>

          {dayData.map((d, col) => (
            <div
              key={d.key}
              role="gridcell"
              tabIndex={col === activeCol ? 0 : -1}
              data-col={col}
              data-day-key={d.key}
              aria-label={`${formatCivilLong(d.day)}, ${d.blocks.length} events`}
              style={hourLines}
              onPointerDown={(e) => {
                if (e.target.closest("[data-instance-id]")) return; // event par click = move drag
                onSlotPointerDown?.(e, d.day, col);
              }}
              onKeyDown={(e) => handleCellKeyDown(e, col, d.day)}
              onFocus={(e) => {
                if (e.target !== e.currentTarget) return;
                setCell((c) => ({ ...c, col }));
                setCellActive(true);
              }}
              onBlur={(e) => {
                if (e.target === e.currentTarget) setCellActive(false);
              }}
              className={`relative flex-1 touch-none border-l border-slate-200 outline-none ${
                d.isToday ? "bg-blue-50/40" : ""
              }`}
            >
              {/* Keyboard se chuna hua slot */}
              {cellActive && cell.col === col && (
                <div
                  ref={highlightRef}
                  aria-hidden="true"
                  style={{
                    top: cell.minutes * PX_PER_MINUTE,
                    height: SNAP_MINUTES * PX_PER_MINUTE,
                  }}
                  className="pointer-events-none absolute inset-x-0 z-20 rounded border-2 border-blue-600 bg-blue-200/50 text-[10px] text-blue-900"
                >
                  {formatTime(
                    Date.UTC(2000, 0, 1, 0, cell.minutes),
                    "UTC" // sirf label: wall-clock minutes dikhane ke liye
                  )}
                </div>
              )}

              {d.blocks.map((b) => (
                <EventBlock
                  key={b.inst.instanceId}
                  instance={b.inst}
                  top={b.top}
                  height={b.height}
                  column={b.pos.column}
                  columns={b.pos.columns}
                  span={b.pos.span}
                  clipStart={b.clipStart}
                  clipEnd={b.clipEnd}
                  tz={tz}
                  selected={selectedId === b.inst.instanceId}
                  dragging={draggingId === b.inst.instanceId}
                  onPointerDown={onEventPointerDown}
                  onOpen={onOpen}
                  onSelect={onSelect}
                  onKeyDown={onEventKeyDown}
                />
              ))}
            </div>
          ))}

          {/* Drag preview: drag hook isko rAF se seedha DOM par move karta hai */}
          <div
            ref={previewRef}
            aria-hidden="true"
            className="pointer-events-none absolute z-30 hidden rounded-md border-2 border-blue-600 bg-blue-300/40"
          />
        </div>
      </div>
    </div>
  );
}

export default memo(WeekView);