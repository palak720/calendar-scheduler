export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

// Live change round mein sirf ye number badalna (15 -> 30)
export const SNAP_MINUTES = 15;

export const DEFAULT_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
})();

export const TIMEZONE_OPTIONS = Array.from(
  new Set([
    DEFAULT_TZ,
    "UTC",
    "Asia/Kolkata",
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Tokyo",
    "Australia/Sydney",
  ])
);

const pad = (n, len = 2) => String(n).padStart(len, "0");

// ---------- Timezone basics ----------

export function isValidTimeZone(tz) {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const partsFormatters = new Map();
function getPartsFormatter(tz) {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

// UTC ms -> us timezone ki wall-clock (year, month 1-12, day, hour, minute, second)
export function getZonedParts(utcMs, tz) {
  const map = {};
  for (const p of getPartsFormatter(tz).formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour, // kuch browsers midnight ko 24 dete hain
    minute: map.minute,
    second: map.second,
  };
}

// Us instant par timezone ka UTC se offset (ms mein). DST ke saath badalta hai.
export function getOffsetMs(utcMs, tz) {
  const p = getZonedParts(utcMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// Wall-clock (tz mein) -> UTC ms. Do pass isliye ki offset DST boundary par badal sakta hai.
// Spring-forward gap wala time aage shift hota hai, fall-back wala pehla instance milta hai.
export function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0 }, tz) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let utc = guess - getOffsetMs(guess, tz);
  const offset2 = getOffsetMs(utc, tz);
  if (offset2 !== guess - utc) utc = guess - offset2;
  return utc;
}

// ---------- Civil dates ({ year, month, day }) ----------
// Calendar ka hisaab UTC fields par hota hai, isliye DST se kabhi nahi bigadta.

export function civilToDayNumber(c) {
  return Math.round(Date.UTC(c.year, c.month - 1, c.day) / DAY);
}

export function dayNumberToCivil(n) {
  const d = new Date(n * DAY);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export const addDays = (c, n) => dayNumberToCivil(civilToDayNumber(c) + n);

export const dayOfWeek = (c) =>
  new Date(Date.UTC(c.year, c.month - 1, c.day)).getUTCDay(); // 0 = Sunday

export const daysInMonth = (year, month) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export const isSameCivil = (a, b) =>
  a.year === b.year && a.month === b.month && a.day === b.day;

// Month +/- n. 31 tareekh clamp hoti hai (31 Jan + 1 month = 28/29 Feb)
export function addMonths(c, n) {
  const total = c.year * 12 + (c.month - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return { year, month, day: Math.min(c.day, daysInMonth(year, month)) };
}

// Week Monday se shuru hota hai
export function startOfWeek(c) {
  return addDays(c, -((dayOfWeek(c) + 6) % 7));
}

export function getWeekDays(c) {
  const start = startOfWeek(c);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// Month view: hamesha 6 rows x 7 columns (42 cells)
export function getMonthGrid(c) {
  const first = { year: c.year, month: c.month, day: 1 };
  const start = startOfWeek(first);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
  }
  return weeks;
}

// "2026-10-05" <-> civil
export const civilToKey = (c) => `${pad(c.year, 4)}-${pad(c.month)}-${pad(c.day)}`;

export function keyToCivil(str) {
  if (typeof str !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  const c = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  // Round trip check: 2026-02-31 jaisi invalid date yahin pakdi jaati hai
  const back = dayNumberToCivil(civilToDayNumber(c));
  return isSameCivil(c, back) ? c : null;
}

// ---------- UTC <-> civil ----------

export function civilFromUtc(utcMs, tz) {
  const p = getZonedParts(utcMs, tz);
  return { year: p.year, month: p.month, day: p.day };
}

export const todayCivil = (tz) => civilFromUtc(Date.now(), tz);

// Ek din ki UTC range. DST wale din 23 ya 25 ghante ke ho sakte hain.
export function dayBoundsUtc(c, tz) {
  return {
    startUtc: zonedTimeToUtc(c, tz),
    endUtc: zonedTimeToUtc(addDays(c, 1), tz),
  };
}

// Wall-clock ke hisaab se din ka minute (0..1439), grid par position ke liye
export function minutesOfDay(utcMs, tz) {
  const p = getZonedParts(utcMs, tz);
  return p.hour * 60 + p.minute;
}

// ---------- Snapping ----------

export function snapToStep(utcMs, stepMinutes = SNAP_MINUTES) {
  const step = stepMinutes * MINUTE;
  return Math.round(utcMs / step) * step;
}

// ---------- Formatting (Intl) ----------

const fmtCache = new Map();
function getFormatter(tz, key, options) {
  const cacheKey = `${tz}|${key}`;
  let f = fmtCache.get(cacheKey);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...options });
    fmtCache.set(cacheKey, f);
  }
  return f;
}

export const formatTime = (utcMs, tz) =>
  getFormatter(tz, "time", { hour: "numeric", minute: "2-digit" }).format(new Date(utcMs));

export const formatDateTime = (utcMs, tz) =>
  getFormatter(tz, "datetime", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(utcMs));

// Civil date ko label dene ke liye: UTC mein format karte hain taaki tz shift na ho
const civilToNoonUtc = (c) => new Date(Date.UTC(c.year, c.month - 1, c.day, 12));

export const formatWeekdayShort = (c) =>
  getFormatter("UTC", "wd", { weekday: "short" }).format(civilToNoonUtc(c));

export const formatDayNumber = (c) =>
  getFormatter("UTC", "dn", { day: "numeric" }).format(civilToNoonUtc(c));

export const formatMonthTitle = (c) =>
  getFormatter("UTC", "mt", { month: "long", year: "numeric" }).format(civilToNoonUtc(c));

export const formatCivilLong = (c) =>
  getFormatter("UTC", "cl", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(civilToNoonUtc(c));

// Hour label (grid ke left side ke liye): 0 -> "12 AM"
export const formatHourLabel = (hour) =>
  getFormatter("UTC", "hl", { hour: "numeric" }).format(new Date(Date.UTC(2000, 0, 1, hour)));

// ---------- Form inputs ("YYYY-MM-DDTHH:mm") ----------

export function utcToInputValue(utcMs, tz) {
  const p = getZonedParts(utcMs, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function inputValueToUtc(value, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || "");
  if (!m) return null;
  const c = { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] };
  if (!keyToCivil(`${m[1]}-${m[2]}-${m[3]}`) || c.hour > 23 || c.minute > 59) return null;
  return zonedTimeToUtc(c, tz);
}

// ---------- URL params: galat value aaye to safe fallback ----------

export const parseView = (v) => (v === "month" ? "month" : "week");

export const parseTzParam = (v) => (isValidTimeZone(v) ? v : DEFAULT_TZ);

export const parseDateParam = (v, tz) => keyToCivil(v) ?? todayCivil(tz);