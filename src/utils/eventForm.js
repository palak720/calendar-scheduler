import {
  addDays,
  civilFromUtc,
  civilToKey,
  dayOfWeek,
  keyToCivil,
  utcToInputValue,
} from "./dateUtils";

// Form ke saare inputs string hote hain (number input bhi), isliye values yahan string rakhte hain.
// Validation (validation.js) unhe number mein badal kar check karta hai.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINALS = ["", "1st", "2nd", "3rd", "4th"];

export const defaultRecurrence = () => ({
  enabled: false,
  freq: "weekly",
  interval: "1",
  monthlyMode: "date", // "date" = har mahine same tareekh, "nth" = har mahine 2nd Tuesday
  endType: "never", // "never" | "until" | "count"
  until: "",
  count: "10",
});

// ---------- Event -> form values (edit ke liye) ----------
export function eventToFormValues(event, tz) {
  const start = Date.parse(event.startUtc);
  const end = Date.parse(event.endUtc);
  const startDate = civilToKey(civilFromUtc(start, tz));
  // All-day mein end exclusive store hota hai, form mein inclusive dikhana hai
  const endDate = civilToKey(civilFromUtc(Math.max(start, end - 1), tz));

  const rule = event.recurrence;
  const recurrence = rule
    ? {
        enabled: true,
        freq: rule.freq,
        interval: String(rule.interval ?? 1),
        monthlyMode: rule.monthlyMode === "nth" ? "nth" : "date",
        endType: rule.until ? "until" : rule.count ? "count" : "never",
        until: rule.until || "",
        count: String(rule.count ?? 10),
      }
    : defaultRecurrence();

  return {
    title: event.title,
    allDay: Boolean(event.allDay),
    start: utcToInputValue(start, tz),
    end: utcToInputValue(end, tz),
    startDate,
    endDate,
    attendeeIds: [...(event.attendeeIds || [])],
    recurrence,
    reminder: event.reminder ?? "",
  };
}

// ---------- Naye event ke default values (drag ya keyboard se mili range) ----------
export function newEventFormValues({ startUtc, endUtc }, tz) {
  const startDate = civilToKey(civilFromUtc(startUtc, tz));
  return {
    title: "",
    allDay: false,
    start: utcToInputValue(startUtc, tz),
    end: utcToInputValue(endUtc, tz),
    startDate,
    endDate: startDate,
    attendeeIds: [],
    recurrence: defaultRecurrence(),
    reminder: "",
  };
}

// ---------- All-day toggle: dono modes ke fields sync rakhta hai ----------
export function toggleAllDay(values, checked) {
  if (checked) {
    const startDate = (values.start || "").slice(0, 10) || values.startDate;
    const endDate = (values.end || "").slice(0, 10) || startDate;
    return { ...values, allDay: true, startDate, endDate: endDate < startDate ? startDate : endDate };
  }
  // Timed mein wapas: din wahi, time 9-10 AM
  const day = values.startDate;
  return { ...values, allDay: false, start: `${day}T09:00`, end: `${day}T10:00` };
}

// Monthly option ke labels: "Monthly on day 15" / "Monthly on the 2nd Tuesday"
export function describeMonthly(startDateKey) {
  const c = keyToCivil(startDateKey);
  if (!c) return { dateLabel: "Monthly on the same date", nthLabel: "Monthly on the same weekday" };
  const nth = Math.ceil(c.day / 7);
  const weekday = WEEKDAYS[dayOfWeek(c)];
  return {
    dateLabel: `Monthly on day ${c.day}`,
    nthLabel: nth >= 5 ? `Monthly on the last ${weekday}` : `Monthly on the ${ORDINALS[nth]} ${weekday}`,
  };
}

// ---------- Form values -> event ----------
// values   : validated form values
// times    : validateEventForm ka { startUtc, endUtc }
// options  : { tz, base (edit mein purana event), id (naye ke liye), organizerId }
export function formValuesToEvent(values, { startUtc, endUtc }, { tz, base = null, id, organizerId }) {
  let recurrence = null;
  const rec = values.recurrence;

  if (rec && rec.enabled) {
    recurrence = {
      freq: rec.freq,
      interval: Math.max(1, Math.floor(Number(rec.interval)) || 1),
      monthlyMode: rec.freq === "monthly" && rec.monthlyMode === "nth" ? "nth" : "date",
      until: rec.endType === "until" ? rec.until : null,
      count: rec.endType === "count" ? Math.floor(Number(rec.count)) : null,
      // Rule ka tz series ki wall-clock tay karta hai, edit par purana hi rakhte hain
      tz: base?.recurrence?.tz || tz,
      exdates: base?.recurrence?.exdates ? [...base.recurrence.exdates] : [],
    };
  }

  return {
    id: base?.id ?? id,
    title: values.title.trim(),
    startUtc: new Date(startUtc).toISOString(),
    endUtc: new Date(endUtc).toISOString(),
    allDay: Boolean(values.allDay),
    organizerId: base?.organizerId ?? organizerId ?? null,
    attendeeIds: Array.from(new Set(values.attendeeIds)).sort((a, b) => a - b),
    recurrence,
    reminder: values.reminder === "" || values.reminder == null ? null : Number(values.reminder),
  };
}

// Recurring event ka sirf ek din (instance) edit karte waqt form mein wahi din dikhana hai.
// Series ka rule form mein na dikhe, isliye "this event" edit mein recurrence band kar dete hain.
export function withoutRecurrence(values) {
  return { ...values, recurrence: defaultRecurrence() };
}

export const nextDayKey = (key) => {
  const c = keyToCivil(key);
  return c ? civilToKey(addDays(c, 1)) : key;
};