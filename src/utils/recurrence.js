import {
  DAY,
  addDays,
  civilFromUtc,
  civilToDayNumber,
  dayNumberToCivil,
  dayOfWeek,
  daysInMonth,
  getZonedParts,
  keyToCivil,
  zonedTimeToUtc,
} from "./dateUtils";

// Recurrence rule ka shape (event.recurrence), null matlab repeat nahi:
// {
//   freq: "daily" | "weekly" | "monthly",
//   interval: 1,               // har 2 din / 2 hafte / 2 mahine
//   monthlyMode: "date" | "nth",  // "date" = har 15 tareekh, "nth" = har 2nd Tuesday
//   until: "YYYY-MM-DD" | null,   // inclusive, event ke tz mein
//   count: number | null,         // total occurrences
//   tz: "Asia/Kolkata",           // jis zone mein rule bana (wall-clock isi mein chalti hai)
//   exdates: [ms, ...],           // jo occurrences delete/alag ho gayi ("this event" edit)
// }
//
// Kabhi hazaron instances store nahi karte. Sirf visible range ke instances
// yahin generate hote hain.

const MAX_INSTANCES_PER_EVENT = 500; // safety cap

// n-th occurrence ki civil date (n = 0 anchor khud hai)
function occurrenceDate(anchor, rule, n) {
  const step = n * rule.interval;

  if (rule.freq === "daily") {
    return addDays(anchor, step);
  }
  if (rule.freq === "weekly") {
    return addDays(anchor, step * 7);
  }

  // monthly
  const total = anchor.year * 12 + (anchor.month - 1) + step;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const dim = daysInMonth(year, month);

  if (rule.monthlyMode === "nth") {
    const weekday = dayOfWeek(anchor);
    const nth = Math.ceil(anchor.day / 7); // 1..5
    if (nth >= 5) {
      // 5th weekday har mahine nahi hota, isliye "last weekday" maante hain
      const lastWd = dayOfWeek({ year, month, day: dim });
      return { year, month, day: dim - ((lastWd - weekday + 7) % 7) };
    }
    const firstWd = dayOfWeek({ year, month, day: 1 });
    const firstMatch = 1 + ((weekday - firstWd + 7) % 7);
    return { year, month, day: firstMatch + (nth - 1) * 7 };
  }

  // "date" mode: 31 tareekh chhote mahine mein last day par clamp hoti hai
  return { year, month, day: Math.min(anchor.day, dim) };
}

// Range se pehle ke occurrences skip karne ke liye shuruaati index ka andaza.
// Andaza thoda peeche rakhte hain (safe side), loop khud aage badh jaata hai.
function estimateStartIndex(anchor, rule, rangeStartMs, durationMs) {
  const rs = civilFromUtc(rangeStartMs - durationMs - DAY, rule.tz);
  const diffDays = civilToDayNumber(rs) - civilToDayNumber(anchor);
  if (diffDays <= 0) return 0;

  let est;
  if (rule.freq === "daily") {
    est = Math.floor(diffDays / rule.interval);
  } else if (rule.freq === "weekly") {
    est = Math.floor(diffDays / (7 * rule.interval));
  } else {
    const diffMonths = rs.year * 12 + rs.month - (anchor.year * 12 + anchor.month);
    est = Math.floor(diffMonths / rule.interval);
  }
  return Math.max(0, est - 1);
}

function normalizeRule(rec) {
  return {
    freq: rec.freq,
    interval: Math.max(1, Math.floor(Number(rec.interval)) || 1),
    monthlyMode: rec.monthlyMode === "nth" ? "nth" : "date",
    until: rec.until ? keyToCivil(rec.until) : null,
    count: Number.isInteger(rec.count) && rec.count > 0 ? rec.count : null,
    tz: rec.tz || "UTC",
  };
}

function overlapsRange(start, end, rangeStart, rangeEnd) {
  return start < rangeEnd && (end > rangeStart || start >= rangeStart);
}

// Ek event ke visible instances
function expandOne(event, rangeStart, rangeEnd) {
  const baseStart = Date.parse(event.startUtc);
  const baseEnd = Date.parse(event.endUtc);
  if (Number.isNaN(baseStart) || Number.isNaN(baseEnd)) return [];

  const rec = event.recurrence;

  // Repeat nahi hota: seedha overlap check
  if (!rec || !["daily", "weekly", "monthly"].includes(rec.freq)) {
    if (!overlapsRange(baseStart, baseEnd, rangeStart, rangeEnd)) return [];
    return [makeInstance(event, baseStart, baseEnd, baseStart)];
  }

  // Series shuru hone se pehle ki range: kuch nahi
  if (baseStart >= rangeEnd) return [];

  const rule = normalizeRule(rec);
  const exdates = new Set(rec.exdates || []);
  const duration = baseEnd - baseStart;
  const wall = getZonedParts(baseStart, rule.tz);
  const anchor = { year: wall.year, month: wall.month, day: wall.day };
  const untilDay = rule.until ? civilToDayNumber(rule.until) : null;
  const allDaySpan = event.allDay ? Math.max(1, Math.round(duration / DAY)) : 0;

  const out = [];
  let n = estimateStartIndex(anchor, rule, rangeStart, duration);

  for (let guard = 0; guard < MAX_INSTANCES_PER_EVENT * 4; guard++, n++) {
    if (rule.count !== null && n >= rule.count) break;

    const date = occurrenceDate(anchor, rule, n);
    if (untilDay !== null && civilToDayNumber(date) > untilDay) break;

    // Wall-clock same rakhte hain (9:00 AM hamesha 9:00 AM), UTC DST ke saath badalta hai
    const start = zonedTimeToUtc({ ...date, hour: wall.hour, minute: wall.minute }, rule.tz);
    if (start >= rangeEnd) break; // start sirf badhta hai, aage ke sab bahar

    const end = event.allDay
      ? zonedTimeToUtc(dayNumberToCivil(civilToDayNumber(date) + allDaySpan), rule.tz)
      : start + duration;

    if (exdates.has(start)) continue;
    if (overlapsRange(start, end, rangeStart, rangeEnd)) {
      out.push(makeInstance(event, start, end, start));
      if (out.length >= MAX_INSTANCES_PER_EVENT) break;
    }
  }
  return out;
}

function makeInstance(event, start, end, occurrenceStart) {
  return {
    instanceId: `${event.id}@${occurrenceStart}`,
    eventId: event.id,
    start, // ms
    end, // ms
    occurrenceStart, // asli occurrence ka start, exdates aur "this and following" ke liye
    isRecurring: Boolean(event.recurrence),
    event, // same object reference: memo ke liye stable
  };
}

// Sab events ke instances [rangeStart, rangeEnd) ke liye, start ke hisaab se sorted
export function expandEvents(events, rangeStart, rangeEnd) {
  const out = [];
  for (const event of events) {
    const items = expandOne(event, rangeStart, rangeEnd);
    for (const item of items) out.push(item);
  }
  out.sort((a, b) => a.start - b.start || a.end - b.end);
  return out;
}