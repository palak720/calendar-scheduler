import { useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import AttendeeSelect from "./AttendeeSelect";
import { findConflicts } from "../utils/conflicts";
import { describeMonthly, toggleAllDay } from "../utils/eventForm";
import { firstError, REMINDER_OPTIONS, validateEventForm } from "../utils/validation";
import { inputValueToUtc, utcToInputValue } from "../utils/dateUtils";

const inputCls = (bad) =>
  `mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${
    bad ? "border-red-500" : "border-slate-300"
  }`;
const labelCls = "text-sm font-medium text-slate-700";

// Props:
//   title, initialValues, tz, events
//   excludeEventId : edit karte waqt khud ka event conflict mein na gine
//   hideRecurrence : "this event" edit mein series ka rule nahi dikhana
//   onSubmit(values, validationResult), onCancel
export default function EventForm({
  title,
  initialValues,
  tz,
  events,
  excludeEventId = null,
  hideRecurrence = false,
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState(initialValues);
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState(false);
  const submittedRef = useRef(false); // double submit: pehla hi jaata hai

  const validation = useMemo(() => validateEventForm(values, tz), [values, tz]);

  // Conflict ke liye sirf time chahiye. Title/recurrence galat ho tab bhi warning dikhni chahiye,
  // isliye baaki fields neutral karke sirf time fields ka check chalate hain.
  const timeCheck = useMemo(
    () =>
      validateEventForm(
        {
          ...values,
          title: "x",
          attendeeIds: [],
          reminder: "",
          recurrence: { ...values.recurrence, enabled: false },
        },
        tz
      ),
    [values, tz]
  );

  const conflicts = useMemo(
    () =>
      findConflicts({
        events,
        startUtc: timeCheck.startUtc,
        endUtc: timeCheck.endUtc,
        attendeeIds: values.attendeeIds,
        excludeEventId,
      }),
    [events, timeCheck, values.attendeeIds, excludeEventId]
  );

  const err = (name) => ((attempted || touched[name]) && validation.errors[name]) || undefined;

  const ip = (name) => ({
    id: `ef-${name}`,
    "aria-invalid": Boolean(err(name)),
    "aria-describedby": err(name) ? `ef-${name}-error` : undefined,
    onBlur: () => setTouched((t) => ({ ...t, [name]: true })),
    className: inputCls(Boolean(err(name))),
  });

  const errorText = (name) =>
    err(name) ? (
      <p id={`ef-${name}-error`} className="mt-1 text-xs text-red-600">
        {err(name)}
      </p>
    ) : null;

  const set = (patch) => setValues((v) => ({ ...v, ...patch }));
  const setRec = (patch) => setValues((v) => ({ ...v, recurrence: { ...v.recurrence, ...patch } }));

  // Start badle to duration same rakhte hain (end saath mein khisakta hai)
  function onStartChange(next) {
    setValues((prev) => {
      const oldS = inputValueToUtc(prev.start, tz);
      const oldE = inputValueToUtc(prev.end, tz);
      const newS = inputValueToUtc(next, tz);
      let end = prev.end;
      if (oldS !== null && oldE !== null && newS !== null && oldE > oldS) {
        end = utcToInputValue(newS + (oldE - oldS), tz);
      }
      return { ...prev, start: next, end };
    });
  }

  function onStartDateChange(next) {
    setValues((prev) => ({
      ...prev,
      startDate: next,
      endDate: prev.endDate && prev.endDate < next ? next : prev.endDate,
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (submittedRef.current) return;
    setAttempted(true);

    if (!validation.valid) {
      const first = firstError(validation.errors);
      if (first) document.getElementById(`ef-${first.field}`)?.focus();
      return;
    }
    submittedRef.current = true;
    onSubmit(values, validation);
  }

  const rec = values.recurrence;
  const anchorKey = values.allDay ? values.startDate : (values.start || "").slice(0, 10);
  const monthly = describeMonthly(anchorKey);

  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Title */}
        <div>
          <label htmlFor="ef-title" className={labelCls}>
            Title
          </label>
          <input
            {...ip("title")}
            data-autofocus
            value={values.title}
            onChange={(e) => set({ title: e.target.value })}
          />
          {errorText("title")}
        </div>

        {/* All-day */}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={values.allDay}
            onChange={(e) => setValues((v) => toggleAllDay(v, e.target.checked))}
          />
          All-day
        </label>

        {/* Time */}
        {values.allDay ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ef-startDate" className={labelCls}>
                Start date
              </label>
              <input
                {...ip("startDate")}
                type="date"
                value={values.startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
              />
              {errorText("startDate")}
            </div>
            <div>
              <label htmlFor="ef-endDate" className={labelCls}>
                End date
              </label>
              <input
                {...ip("endDate")}
                type="date"
                value={values.endDate}
                onChange={(e) => set({ endDate: e.target.value })}
              />
              {errorText("endDate")}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ef-start" className={labelCls}>
                Start
              </label>
              <input
                {...ip("start")}
                type="datetime-local"
                value={values.start}
                onChange={(e) => onStartChange(e.target.value)}
              />
              {errorText("start")}
            </div>
            <div>
              <label htmlFor="ef-end" className={labelCls}>
                End
              </label>
              <input
                {...ip("end")}
                type="datetime-local"
                value={values.end}
                onChange={(e) => set({ end: e.target.value })}
              />
              {errorText("end")}
            </div>
          </div>
        )}
        <p className="-mt-2 text-xs text-slate-400">Times are in {tz}</p>

        {/* Attendees */}
        <AttendeeSelect
          inputId="ef-attendees"
          value={values.attendeeIds}
          onChange={(ids) => set({ attendeeIds: ids })}
          conflicts={conflicts}
          tz={tz}
          error={err("attendees")}
        />

        {/* Recurrence */}
        {!hideRecurrence && (
          <fieldset className="space-y-3 rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium text-slate-700">Repeat</legend>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={rec.enabled}
                onChange={(e) => setRec({ enabled: e.target.checked })}
              />
              Repeat this event
            </label>

            {rec.enabled && (
              <>
                <div className="flex flex-wrap items-start gap-2">
                  <span className="pt-2 text-sm text-slate-700">Every</span>
                  <div className="w-20">
                    <input
                      {...ip("interval")}
                      type="number"
                      min="1"
                      aria-label="Repeat interval"
                      value={rec.interval}
                      onChange={(e) => setRec({ interval: e.target.value })}
                      className={inputCls(Boolean(err("interval"))) + " mt-0"}
                    />
                  </div>
                  <select
                    value={rec.freq}
                    onChange={(e) => setRec({ freq: e.target.value })}
                    aria-label="Repeat frequency"
                    className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  >
                    <option value="daily">day(s)</option>
                    <option value="weekly">week(s)</option>
                    <option value="monthly">month(s)</option>
                  </select>
                </div>
                {errorText("interval")}

                {rec.freq === "monthly" && (
                  <div className="space-y-1 text-sm text-slate-700">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="monthlyMode"
                        checked={rec.monthlyMode === "date"}
                        onChange={() => setRec({ monthlyMode: "date" })}
                      />
                      {monthly.dateLabel}
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="monthlyMode"
                        checked={rec.monthlyMode === "nth"}
                        onChange={() => setRec({ monthlyMode: "nth" })}
                      />
                      {monthly.nthLabel}
                    </label>
                  </div>
                )}

                <div className="space-y-2 text-sm text-slate-700">
                  <div className="font-medium">Ends</div>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="endType"
                      checked={rec.endType === "never"}
                      onChange={() => setRec({ endType: "never" })}
                    />
                    Never
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="endType"
                      id="ef-endType-until"
                      checked={rec.endType === "until"}
                      onChange={() => setRec({ endType: "until" })}
                    />
                    <label htmlFor="ef-endType-until">On</label>
                    <input
                      {...ip("until")}
                      type="date"
                      aria-label="Repeat until date"
                      disabled={rec.endType !== "until"}
                      value={rec.until}
                      onChange={(e) => setRec({ until: e.target.value })}
                      className={inputCls(Boolean(err("until"))) + " mt-0 w-auto disabled:opacity-40"}
                    />
                  </div>
                  {errorText("until")}
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="endType"
                      id="ef-endType-count"
                      checked={rec.endType === "count"}
                      onChange={() => setRec({ endType: "count" })}
                    />
                    <label htmlFor="ef-endType-count">After</label>
                    <input
                      {...ip("count")}
                      type="number"
                      min="1"
                      aria-label="Number of occurrences"
                      disabled={rec.endType !== "count"}
                      value={rec.count}
                      onChange={(e) => setRec({ count: e.target.value })}
                      className={inputCls(Boolean(err("count"))) + " mt-0 w-24 disabled:opacity-40"}
                    />
                    <span>occurrences</span>
                  </div>
                  {errorText("count")}
                </div>
              </>
            )}
          </fieldset>
        )}

        {/* Reminder */}
        <div>
          <label htmlFor="ef-reminder" className={labelCls}>
            Reminder
          </label>
          <select
            {...ip("reminder")}
            value={values.reminder}
            onChange={(e) => set({ reminder: e.target.value === "" ? "" : Number(e.target.value) })}
          >
            {REMINDER_OPTIONS.map((o) => (
              <option key={String(o.value)} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {errorText("reminder")}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}