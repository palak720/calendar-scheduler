import {
  DAY,
  addDays,
  civilFromUtc,
  civilToDayNumber,
  civilToKey,
  dayNumberToCivil,
  getZonedParts,
  zonedTimeToUtc,
} from "./dateUtils";
import {
  compositeCommand,
  createEventCommand,
  deleteEventCommand,
  updateEventCommand,
} from "../history/commands";
import { expandEvents } from "./recurrence";

// Recurring event ke edit/delete ke teen scope: "this" | "following" | "all".
// Har function ek command deta hai (kai commands ho to composite = ek undo step).
//
//   this      : us occurrence ko series se hatao (exdates) aur alag standalone event banao
//   following : purani series us din se pehle khatam (until), nayi series us din se shuru
//   all       : poori series (master event) badlo

const ms = (iso) => Date.parse(iso);
const iso = (n) => new Date(n).toISOString();
const exdatesOf = (e) => e.recurrence?.exdates || [];
const isFirst = (master, instance) => instance.occurrenceStart === ms(master.startUtc);

function withExdate(master, occurrenceStart) {
  return {
    ...master,
    recurrence: { ...master.recurrence, exdates: [...exdatesOf(master), occurrenceStart] },
  };
}

// Is occurrence se pehle kitni occurrences thi (count wali series ko baantne ke liye)
function countBefore(master, occurrenceStart) {
  const open = {
    ...master,
    recurrence: { ...master.recurrence, count: null, until: null, exdates: [] },
  };
  return expandEvents([open], ms(master.startUtc) - DAY, occurrenceStart).filter(
    (i) => i.start < occurrenceStart
  ).length;
}

// Purani series us occurrence se ek din pehle tak (until inclusive hota hai)
function truncated(master, occurrenceStart) {
  const civil = civilFromUtc(occurrenceStart, master.recurrence.tz);
  return {
    ...master,
    recurrence: {
      ...master.recurrence,
      until: civilToKey(addDays(civil, -1)),
      count: null,
      exdates: exdatesOf(master).filter((x) => x < occurrenceStart),
    },
  };
}

// "All events": user ne ek occurrence ka time badla, poori series utna khisakti hai
function applyToSeries(master, instance, edited, tz, timeChanged) {
  const next = { ...edited, id: master.id, organizerId: master.organizerId };

  if (!timeChanged) {
    // Sirf title/attendees jaisa kuch badla: series ka time bilkul nahi chheda
    next.startUtc = master.startUtc;
    next.endUtc = master.endUtc;
    if (next.recurrence) {
      next.recurrence = { ...next.recurrence, tz: master.recurrence.tz, exdates: exdatesOf(master) };
    }
    return next;
  }

  const newStart = ms(edited.startUtc);
  const newEnd = ms(edited.endUtc);

  // Din ka shift aur naya wall-clock time (display timezone mein)
  const dayDelta =
    civilToDayNumber(civilFromUtc(newStart, tz)) -
    civilToDayNumber(civilFromUtc(instance.start, tz));
  const t = getZonedParts(newStart, tz);
  const masterDay = civilToDayNumber(civilFromUtc(ms(master.startUtc), tz));
  const target = dayNumberToCivil(masterDay + dayDelta);

  const startUtc = zonedTimeToUtc({ ...target, hour: t.hour, minute: t.minute }, tz);
  let endUtc;
  if (edited.allDay) {
    const span =
      civilToDayNumber(civilFromUtc(newEnd, tz)) - civilToDayNumber(civilFromUtc(newStart, tz));
    endUtc = zonedTimeToUtc(dayNumberToCivil(civilToDayNumber(target) + span), tz);
  } else {
    endUtc = startUtc + (newEnd - newStart);
  }

  next.startUtc = iso(startUtc);
  next.endUtc = iso(endUtc);
  if (next.recurrence) {
    const delta = startUtc - ms(master.startUtc);
    next.recurrence = {
      ...next.recurrence,
      tz,
      exdates: exdatesOf(master).map((x) => x + delta), // deleted occurrences bhi saath khisakte hain
    };
  }
  return next;
}

// ---------- Edit ----------
// edited: formValuesToEvent (ya move/resize) ka poora event, instance ke naye time ke saath
export function buildEditCommand({
  master,
  instance,
  edited,
  scope,
  tz,
  newId,
  label = "Edit event",
  type = "update",
}) {
  if (!master.recurrence) {
    return updateEventCommand(master, { ...edited, id: master.id }, { type, label });
  }

  const timeChanged = ms(edited.startUtc) !== instance.start || ms(edited.endUtc) !== instance.end;
  const first = isFirst(master, instance);

  if (scope === "this") {
    const detached = { ...edited, id: newId, recurrence: null };
    return compositeCommand(
      label,
      [
        updateEventCommand(master, withExdate(master, instance.occurrenceStart), { type, label }),
        createEventCommand(detached, label),
      ],
      type
    );
  }

  if (scope === "following" && !first) {
    const startMs = timeChanged ? ms(edited.startUtc) : instance.start;
    const endMs = timeChanged ? ms(edited.endUtc) : instance.end;
    const delta = startMs - instance.start;

    const series = { ...edited, id: newId, startUtc: iso(startMs), endUtc: iso(endMs) };
    if (series.recurrence) {
      const rule = series.recurrence;
      let count = rule.count;
      // Count badla nahi to bachi hui occurrences (N - pehle wali)
      if (count !== null && master.recurrence.count === count) {
        count = Math.max(1, count - countBefore(master, instance.occurrenceStart));
      }
      series.recurrence = {
        ...rule,
        count,
        tz: timeChanged ? tz : master.recurrence.tz,
        exdates: exdatesOf(master)
          .filter((x) => x >= instance.occurrenceStart)
          .map((x) => x + delta),
      };
    }

    return compositeCommand(
      label,
      [
        updateEventCommand(master, truncated(master, instance.occurrenceStart), { type, label }),
        createEventCommand(series, label),
      ],
      type
    );
  }

  // "all", ya "following" jab pehli occurrence hi ho (matlab poori series)
  return updateEventCommand(master, applyToSeries(master, instance, edited, tz, timeChanged), {
    type,
    label,
  });
}

// ---------- Delete ----------
export function buildDeleteCommand({ master, instance, scope }) {
  if (!master.recurrence) return deleteEventCommand(master, "Delete event");

  if (scope === "this") {
    return updateEventCommand(master, withExdate(master, instance.occurrenceStart), {
      type: "delete",
      label: "Delete event",
    });
  }
  if (scope === "following" && !isFirst(master, instance)) {
    return updateEventCommand(master, truncated(master, instance.occurrenceStart), {
      type: "delete",
      label: "Delete this and following events",
    });
  }
  return deleteEventCommand(master, "Delete all events");
}