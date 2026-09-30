// Events aur recurrence rules browser mein store hote hain (DummyJSON kuch save nahi karta).
// Format: { version, savedAt, events: [...] }
// Corrupt data aaye to app crash nahi hota: purana raw data backup key mein chala jaata hai
// aur caller ko "recovered" status milta hai.

const KEY = "cs_events";
const BACKUP_KEY = "cs_events_corrupt_backup";
export const SCHEMA_VERSION = 1;

const FREQS = ["daily", "weekly", "monthly"];

// Ek event ko check + normalize karta hai. Galat ho to null (event skip hoga).
export function sanitizeEvent(e) {
  if (!e || typeof e !== "object") return null;
  if (typeof e.id !== "string" || !e.id) return null;
  if (typeof e.title !== "string") return null;

  const start = Date.parse(e.startUtc);
  const end = Date.parse(e.endUtc);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;

  let recurrence = null;
  if (e.recurrence && typeof e.recurrence === "object") {
    if (!FREQS.includes(e.recurrence.freq)) return null;
    recurrence = {
      freq: e.recurrence.freq,
      interval: Math.max(1, Math.floor(Number(e.recurrence.interval)) || 1),
      monthlyMode: e.recurrence.monthlyMode === "nth" ? "nth" : "date",
      until: typeof e.recurrence.until === "string" ? e.recurrence.until : null,
      count: Number.isInteger(e.recurrence.count) ? e.recurrence.count : null,
      tz: typeof e.recurrence.tz === "string" ? e.recurrence.tz : "UTC",
      exdates: Array.isArray(e.recurrence.exdates)
        ? e.recurrence.exdates.filter((n) => Number.isFinite(n))
        : [],
    };
  }

  return {
    id: e.id,
    title: e.title,
    startUtc: new Date(start).toISOString(),
    endUtc: new Date(end).toISOString(),
    allDay: Boolean(e.allDay),
    organizerId: Number.isFinite(e.organizerId) ? e.organizerId : null,
    attendeeIds: Array.isArray(e.attendeeIds)
      ? e.attendeeIds.filter((n) => Number.isFinite(n))
      : [],
    recurrence,
    reminder: Number.isFinite(e.reminder) ? e.reminder : null,
  };
}

// Purane version ka data naye version mein badalne ki jagah.
// Abhi sirf v1 hai. Kal v2 aaye to yahan case 1 -> 2 ka step add hoga.
function migrate(data) {
  let current = data;
  // if (current.version === 1) current = { ...current, version: 2, events: ... };
  return current;
}

function backupCorrupt(raw) {
  try {
    localStorage.setItem(BACKUP_KEY, raw);
  } catch {
    /* storage full ho sakta hai, ignore */
  }
}

// Return: { status: "empty" | "ok" | "recovered", events }
//   empty     -> pehli baar, seed fetch karna hai
//   ok        -> data theek tha
//   recovered -> data kharab tha (ya kuch events invalid the), safe hissa mila
export function loadEvents() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { status: "empty", events: [] }; // storage access hi block hai
  }
  if (raw === null) return { status: "empty", events: [] };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    backupCorrupt(raw);
    localStorage.removeItem(KEY);
    return { status: "recovered", events: [] };
  }

  const validShape =
    data &&
    typeof data === "object" &&
    Number.isInteger(data.version) &&
    Array.isArray(data.events);

  // Shape galat, ya future version jo ye code samajhta nahi
  if (!validShape || data.version > SCHEMA_VERSION) {
    backupCorrupt(raw);
    localStorage.removeItem(KEY);
    return { status: "recovered", events: [] };
  }

  const migrated = migrate(data);
  const seen = new Set();
  const events = [];
  for (const item of migrated.events) {
    const clean = sanitizeEvent(item);
    if (clean && !seen.has(clean.id)) {
      seen.add(clean.id);
      events.push(clean);
    }
  }

  const droppedSome = events.length !== migrated.events.length;
  if (droppedSome) backupCorrupt(raw);
  return { status: droppedSome ? "recovered" : "ok", events };
}

// Return: true agar save hua. Quota full ho to false (app chalta rahega).
export function saveEvents(events) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: SCHEMA_VERSION, savedAt: Date.now(), events })
    );
    return true;
  } catch {
    return false;
  }
}

export function clearEvents() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}