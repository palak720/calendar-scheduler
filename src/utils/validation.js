import {
  DAY,
  civilToDayNumber,
  inputValueToUtc,
  keyToCivil,
  zonedTimeToUtc,
  addDays,
} from "./dateUtils";

export const TITLE_MAX = 100;
export const INTERVAL_MAX = 99;
export const COUNT_MAX = 500; // recurrence.js ke MAX_INSTANCES_PER_EVENT ke barabar
export const ATTENDEES_MAX = 50;

// Reminder: event se kitne minute pehle (null = koi reminder nahi)
export const REMINDER_OPTIONS = [
  { value: "", label: "No reminder" },
  { value: 0, label: "At start" },
  { value: 5, label: "5 minutes before" },
  { value: 10, label: "10 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
];

const REMINDER_VALUES = REMINDER_OPTIONS.map((o) => o.value).filter((v) => v !== "");

const isIntInRange = (v, min, max) => {
  const n = Number(v);
  return v !== "" && v !== null && Number.isInteger(n) && n >= min && n <= max;
};

// values (form ka draft):
// {
//   title, allDay,
//   start, end           : "YYYY-MM-DDTHH:mm"  (timed event, tz ki wall-clock)
//   startDate, endDate   : "YYYY-MM-DD"        (all-day, endDate inclusive)
//   attendeeIds          : [number]
//   recurrence           : { enabled, freq, interval, monthlyMode, endType, until, count }
//   reminder             : "" | number
// }
//
// Return: { valid, errors, startUtc, endUtc }
//   errors: { title, start, end, startDate, endDate, interval, until, count, reminder, attendees }
//   startUtc/endUtc valid hone par hi milte hain (all-day mein end exclusive hota hai)
export function validateEventForm(values, tz) {
  const errors = {};
  let startUtc = null;
  let endUtc = null;
  let startDayNum = null; // recurrence "until" check ke liye

  // ---------- Title ----------
  const title = (values.title || "").trim();
  if (!title) errors.title = "Title is required";
  else if (title.length > TITLE_MAX) errors.title = `Title must be ${TITLE_MAX} characters or less`;

  // ---------- Time ----------
  if (values.allDay) {
    const s = keyToCivil(values.startDate);
    const e = keyToCivil(values.endDate);
    if (!s) errors.startDate = "Enter a valid start date";
    if (!e) errors.endDate = "Enter a valid end date";
    if (s && e) {
      startDayNum = civilToDayNumber(s);
      if (civilToDayNumber(e) < startDayNum) {
        errors.endDate = "End date can't be before start date";
      } else {
        startUtc = zonedTimeToUtc(s, tz);
        endUtc = zonedTimeToUtc(addDays(e, 1), tz); // exclusive: agle din ki shuruaat
      }
    }
  } else {
    const s = inputValueToUtc(values.start, tz);
    const e = inputValueToUtc(values.end, tz);
    if (s === null) errors.start = "Enter a valid start date and time";
    if (e === null) errors.end = "Enter a valid end date and time";
    if (s !== null && e !== null) {
      if (e <= s) {
        errors.end = "End must be after start";
      } else {
        startUtc = s;
        endUtc = e;
      }
    }
    const civil = keyToCivil((values.start || "").slice(0, 10));
    if (civil) startDayNum = civilToDayNumber(civil);
  }

  // ---------- Recurrence ----------
  const rec = values.recurrence;
  if (rec && rec.enabled) {
    if (!isIntInRange(rec.interval, 1, INTERVAL_MAX)) {
      errors.interval = `Enter a whole number from 1 to ${INTERVAL_MAX}`;
    }

    if (rec.endType === "until") {
      const until = keyToCivil(rec.until);
      if (!until) {
        errors.until = "Enter a valid end date";
      } else if (startDayNum !== null && civilToDayNumber(until) < startDayNum) {
        errors.until = "Repeat end date can't be before the event";
      }
    } else if (rec.endType === "count") {
      if (!isIntInRange(rec.count, 1, COUNT_MAX)) {
        errors.count = `Enter a whole number from 1 to ${COUNT_MAX}`;
      }
    }
  }

  // ---------- Reminder ----------
  if (values.reminder !== "" && values.reminder !== null && values.reminder !== undefined) {
    if (!REMINDER_VALUES.includes(Number(values.reminder))) {
      errors.reminder = "Choose a valid reminder";
    }
  }

  // ---------- Attendees ----------
  const ids = values.attendeeIds || [];
  if (ids.length > ATTENDEES_MAX) {
    errors.attendees = `You can add up to ${ATTENDEES_MAX} attendees`;
  } else if (!ids.every((id) => Number.isInteger(id) && id > 0)) {
    errors.attendees = "Invalid attendee";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    startUtc: Object.keys(errors).length === 0 ? startUtc : null,
    endUtc: Object.keys(errors).length === 0 ? endUtc : null,
  };
}

// Sirf ek field ka error ek baar (form ke top par summary ke liye)
export function firstError(errors) {
  const order = [
    "title",
    "start",
    "end",
    "startDate",
    "endDate",
    "interval",
    "until",
    "count",
    "reminder",
    "attendees",
  ];
  const key = order.find((k) => errors[k]);
  return key ? { field: key, message: errors[key] } : null;
}

export const ONE_DAY = DAY;