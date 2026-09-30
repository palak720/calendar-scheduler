import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useCalendarState } from "../store/CalendarContext";
import { expandEvents } from "../utils/recurrence";
import {
  addDays,
  addMonths,
  civilToKey,
  formatMonthTitle,
  getMonthGrid,
  getWeekDays,
  parseDateParam,
  parseTzParam,
  parseView,
  todayCivil,
  zonedTimeToUtc,
} from "../utils/dateUtils";

// "3,7,7,abc" -> [3, 7]  (sirf valid, unique, positive integers)
function parseAttendees(value) {
  if (!value) return [];
  const ids = value
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

export function useCalendar() {
  const [params, setParams] = useSearchParams();
  const { events } = useCalendarState();

  // ---------- URL se state (galat value = safe fallback) ----------
  const view = parseView(params.get("view"));
  const tz = parseTzParam(params.get("tz"));
  const date = parseDateParam(params.get("date"), tz);
  const attendeeKey = params.get("attendees") || "";
  const attendeeIds = useMemo(() => parseAttendees(attendeeKey), [attendeeKey]);

  // Ek key se pura param set karo. Functional form: stale params ka darr nahi.
  const update = useCallback(
    (changes) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) next.delete(k);
          else next.set(k, Array.isArray(v) ? v.join(",") : v);
        }
        return next;
      });
    },
    [setParams]
  );

  // ---------- Visible range ----------
  const dateKey = civilToKey(date);

  const layout = useMemo(() => {
    if (view === "week") {
      const days = getWeekDays(date);
      return {
        days,
        monthGrid: null,
        first: days[0],
        lastExclusive: addDays(days[6], 1),
      };
    }
    const monthGrid = getMonthGrid(date);
    return {
      days: null,
      monthGrid,
      first: monthGrid[0][0],
      lastExclusive: addDays(monthGrid[5][6], 1),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, dateKey]);

  const rangeStart = useMemo(() => zonedTimeToUtc(layout.first, tz), [layout, tz]);
  const rangeEnd = useMemo(() => zonedTimeToUtc(layout.lastExclusive, tz), [layout, tz]);

  // ---------- Instances ----------
  // Step 1: sirf visible range ke instances (events/range badle tabhi dobara)
  const expanded = useMemo(
    () => expandEvents(events, rangeStart, rangeEnd),
    [events, rangeStart, rangeEnd]
  );

  // Step 2: attendee filter. Alag memo, taaki filter badalne par expand dobara na chale.
  const instances = useMemo(() => {
    if (attendeeIds.length === 0) return expanded;
    return expanded.filter((inst) =>
      inst.event.attendeeIds.some((id) => attendeeIds.includes(id))
    );
  }, [expanded, attendeeIds]);

  // ---------- Navigation ----------
  const goToDate = useCallback((c) => update({ date: civilToKey(c) }), [update]);

  const goPrev = useCallback(() => {
    goToDate(view === "week" ? addDays(date, -7) : addMonths({ ...date, day: 1 }, -1));
  }, [view, date, goToDate]);

  const goNext = useCallback(() => {
    goToDate(view === "week" ? addDays(date, 7) : addMonths({ ...date, day: 1 }, 1));
  }, [view, date, goToDate]);

  const goToday = useCallback(() => goToDate(todayCivil(tz)), [tz, goToDate]);

  const setView = useCallback(
    (v) => update({ view: parseView(v), date: dateKey }),
    [update, dateKey]
  );
  const setTz = useCallback((z) => update({ tz: parseTzParam(z) }), [update]);
  const setAttendeeFilter = useCallback((ids) => update({ attendees: ids }), [update]);

  // Title: week mein beech ke din (Thursday) ka mahina
  const title = formatMonthTitle(view === "week" ? layout.days[3] : date);

  return {
    view,
    date,
    tz,
    attendeeIds,
    title,
    days: layout.days, // week view: 7 civil dates
    monthGrid: layout.monthGrid, // month view: 6x7 civil dates
    rangeStart,
    rangeEnd,
    instances,
    goPrev,
    goNext,
    goToday,
    goToDate,
    setView,
    setTz,
    setAttendeeFilter,
  };
}