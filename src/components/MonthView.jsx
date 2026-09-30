import { memo, useMemo, useRef, useState } from "react";
import {
  addDays,
  civilFromUtc,
  civilToDayNumber,
  civilToKey,
  formatCivilLong,
  formatDayNumber,
  formatTime,
  formatWeekdayShort,
  isSameCivil,
  todayCivil,
} from "../utils/dateUtils";

const MAX_CHIPS = 3; // ek cell mein itne events, baaki "+N more"
const GRID_DAYS = 42; // 6 weeks x 7 days

// Ek event ka chhota chip. memo: ek cell badalne par baaki chips re-render nahi hote.
const Chip = memo(function Chip({ instance, tz, selected, onOpen, onSelect }) {
  const { event, start } = instance;
  return (
    <button
      type="button"
      tabIndex={-1} // Tab se sirf grid cells aate hain; Enter par cell ke andar chips
      data-instance-id={instance.instanceId}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(instance);
      }}
      onFocus={() => onSelect?.(instance)}
      className={`block w-full truncate rounded px-1 text-left text-xs focus-visible:ring-2 focus-visible:ring-blue-600 ${
        event.allDay ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-900 hover:bg-blue-200"
      } ${selected ? "ring-2 ring-blue-600" : ""}`}
    >
      {!event.allDay && <span className="opacity-70">{formatTime(start, tz)} </span>}
      {instance.isRecurring && <span aria-hidden="true">↻ </span>}
      {event.title}
    </button>
  );
});

// Props:
//   monthGrid : 6x7 civil dates (useCalendar)
//   date      : abhi ka civil date (kaunsa mahina dikhana hai)
//   onDayClick(day) : cell/"+N more" par -> us din ka week view
function MonthView({ monthGrid, date, tz, instances, selectedId, onOpen, onSelect, onDayClick }) {
  const gridRef = useRef(null);
  const today = useMemo(() => todayCivil(tz), [tz]);

  // ---------- Har din ke events ----------
  // Har instance ko sirf usi din ki list mein daalte hain jis-jis din wo padta hai.
  // 500+ events par bhi ek hi pass: O(events x days_spanned).
  const dayData = useMemo(() => {
    const firstNum = civilToDayNumber(monthGrid[0][0]);
    const buckets = Array.from({ length: GRID_DAYS }, () => []);

    for (const inst of instances) {
      const s = civilToDayNumber(civilFromUtc(inst.start, tz));
      // end exclusive hai: midnight par khatam hone wala event agle din nahi ginte
      const e = civilToDayNumber(civilFromUtc(Math.max(inst.start, inst.end - 1), tz));
      const from = Math.max(s, firstNum);
      const to = Math.min(e, firstNum + GRID_DAYS - 1);
      for (let n = from; n <= to; n++) buckets[n - firstNum].push(inst);
    }

    // All-day pehle, phir start time se
    for (const list of buckets) {
      list.sort(
        (a, b) =>
          Number(b.event.allDay) - Number(a.event.allDay) || a.start - b.start || a.end - b.end
      );
    }
    return buckets;
  }, [monthGrid, instances, tz]);

  // ---------- Keyboard: roving tabindex ----------
  const firstInGrid = monthGrid[0][0];
  const todayInGrid = monthGrid.flat().some((d) => isSameCivil(d, today));
  const [focusKey, setFocusKey] = useState(null);
  const activeKey =
    focusKey && monthGrid.flat().some((d) => civilToKey(d) === focusKey)
      ? focusKey
      : civilToKey(todayInGrid ? today : { ...date, day: 1 });

  function handleKeyDown(e, day) {
    if (e.target !== e.currentTarget) return;
    let delta = 0;
    if (e.key === "ArrowLeft") delta = -1;
    else if (e.key === "ArrowRight") delta = 1;
    else if (e.key === "ArrowUp") delta = -7;
    else if (e.key === "ArrowDown") delta = 7;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onDayClick?.(day);
      return;
    } else return;

    e.preventDefault();
    const target = addDays(day, delta);
    const idx = civilToDayNumber(target) - civilToDayNumber(firstInGrid);
    if (idx < 0 || idx >= GRID_DAYS) return; // grid ke bahar nahi jaate
    const key = civilToKey(target);
    setFocusKey(key);
    gridRef.current?.querySelector(`[data-day-key="${key}"]`)?.focus();
  }

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label="Month view. Use arrow keys to move between days, Enter to open the day."
      aria-rowcount={7}
      aria-colcount={7}
      className="flex h-full min-h-0 flex-col bg-white"
    >
      <div role="row" className="grid grid-cols-7 border-b border-slate-200">
        {monthGrid[0].map((d) => (
          <div
            key={civilToKey(d)}
            role="columnheader"
            className="py-1 text-center text-xs uppercase text-slate-500"
          >
            {formatWeekdayShort(d)}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-6">
        {monthGrid.map((week, w) => (
          <div key={w} role="row" className="grid min-h-0 grid-cols-7">
            {week.map((day, i) => {
              const key = civilToKey(day);
              const list = dayData[w * 7 + i];
              const shown = list.slice(0, MAX_CHIPS);
              const extra = list.length - shown.length;
              const isToday = isSameCivil(day, today);
              const inMonth = day.month === date.month;

              return (
                <div
                  key={key}
                  role="gridcell"
                  tabIndex={key === activeKey ? 0 : -1}
                  data-day-key={key}
                  aria-label={`${formatCivilLong(day)}, ${list.length} events`}
                  aria-current={isToday ? "date" : undefined}
                  onKeyDown={(e) => handleKeyDown(e, day)}
                  onFocus={(e) => {
                    if (e.target === e.currentTarget) setFocusKey(key);
                  }}
                  onDoubleClick={() => onDayClick?.(day)}
                  className={`min-h-0 overflow-hidden border-b border-l border-slate-200 p-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${
                    inMonth ? "bg-white" : "bg-slate-50"
                  }`}
                >
                  <div className="mb-0.5 flex justify-center">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => onDayClick?.(day)}
                      aria-label={`Open ${formatCivilLong(day)}`}
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        isToday
                          ? "bg-blue-600 text-white"
                          : inMonth
                          ? "text-slate-900 hover:bg-slate-100"
                          : "text-slate-400 hover:bg-slate-100"
                      }`}
                    >
                      {formatDayNumber(day)}
                    </button>
                  </div>

                  <div className="space-y-0.5">
                    {shown.map((inst) => (
                      <Chip
                        key={inst.instanceId}
                        instance={inst}
                        tz={tz}
                        selected={selectedId === inst.instanceId}
                        onOpen={onOpen}
                        onSelect={onSelect}
                      />
                    ))}
                    {extra > 0 && (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => onDayClick?.(day)}
                        className="block w-full rounded px-1 text-left text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        +{extra} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(MonthView);