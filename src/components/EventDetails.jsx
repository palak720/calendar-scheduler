import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import { fetchUserById } from "../api/userService";
import { civilFromUtc, formatCivilLong, formatDateTime, formatTime, isSameCivil } from "../utils/dateUtils";
import { REMINDER_OPTIONS } from "../utils/validation";

function describeRecurrence(rule) {
  if (!rule) return null;
  const unit = { daily: "day", weekly: "week", monthly: "month" }[rule.freq] || "period";
  const every = rule.interval > 1 ? `every ${rule.interval} ${unit}s` : `every ${unit}`;
  const mode = rule.freq === "monthly" && rule.monthlyMode === "nth" ? " (same weekday)" : "";
  const end = rule.until
    ? `, until ${rule.until}`
    : rule.count
    ? `, ${rule.count} times`
    : "";
  return `Repeats ${every}${mode}${end}`;
}

// event null ho to "Not found" dikhta hai (galat /events/:id)
export default function EventDetails({ event, instance, tz, onClose, onEdit, onDelete }) {
  const [names, setNames] = useState({});
  const deletedRef = useRef(false); // Delete double click: ek hi baar

  useEffect(() => {
    if (!event) return;
    const ids = Array.from(
      new Set([event.organizerId, ...event.attendeeIds].filter(Number.isInteger))
    );
    let alive = true;
    const controller = new AbortController();
    Promise.allSettled(ids.map((id) => fetchUserById(id, { signal: controller.signal }))).then(
      (res) => {
        if (!alive) return;
        const map = {};
        res.forEach((r, i) => {
          if (r.status === "fulfilled") map[ids[i]] = r.value.name;
        });
        setNames(map);
      }
    );
    return () => {
      alive = false;
      controller.abort();
    };
  }, [event]);

  if (!event) {
    return (
      <Modal title="Event not found" onClose={onClose} size="sm">
        <p className="text-sm text-slate-600">
          This event doesn't exist or was deleted.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Back to calendar
          </button>
        </div>
      </Modal>
    );
  }

  const nameOf = (id) => names[id] || `User ${id}`;

  // When
  let when;
  if (event.allDay) {
    const s = civilFromUtc(instance.start, tz);
    const e = civilFromUtc(Math.max(instance.start, instance.end - 1), tz);
    when = isSameCivil(s, e)
      ? `${formatCivilLong(s)} (all day)`
      : `${formatCivilLong(s)} to ${formatCivilLong(e)} (all day)`;
  } else {
    const sameDay = isSameCivil(civilFromUtc(instance.start, tz), civilFromUtc(instance.end, tz));
    when = sameDay
      ? `${formatDateTime(instance.start, tz)} to ${formatTime(instance.end, tz)}`
      : `${formatDateTime(instance.start, tz)} to ${formatDateTime(instance.end, tz)}`;
  }

  const reminder = REMINDER_OPTIONS.find((o) => o.value === event.reminder);
  const repeat = describeRecurrence(event.recurrence);

  return (
    <Modal title={event.title} onClose={onClose}>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs uppercase text-slate-400">When ({tz})</dt>
          <dd className="text-slate-900">{when}</dd>
        </div>
        {repeat && (
          <div>
            <dt className="text-xs uppercase text-slate-400">Repeat</dt>
            <dd className="text-slate-900">{repeat}</dd>
          </div>
        )}
        {Number.isInteger(event.organizerId) && (
          <div>
            <dt className="text-xs uppercase text-slate-400">Organizer</dt>
            <dd className="text-slate-900">{nameOf(event.organizerId)}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase text-slate-400">Attendees</dt>
          <dd className="text-slate-900">
            {event.attendeeIds.length ? event.attendeeIds.map(nameOf).join(", ") : "None"}
          </dd>
        </div>
        {reminder && event.reminder !== null && (
          <div>
            <dt className="text-xs uppercase text-slate-400">Reminder</dt>
            <dd className="text-slate-900">{reminder.label}</dd>
          </div>
        )}
      </dl>

      <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => {
            if (deletedRef.current) return;
            deletedRef.current = true;
            onDelete(instance);
          }}
          className="mr-auto rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
        >
          Close
        </button>
        <button
          type="button"
          data-autofocus
          onClick={() => onEdit(instance)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Edit
        </button>
      </div>
    </Modal>
  );
}