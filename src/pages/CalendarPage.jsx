import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router-dom";
import Toolbar from "../components/Toolbar";
import WeekView from "../components/WeekView";
import MonthView from "../components/MonthView";
import EventForm from "../components/EventForm";
import EventDetails from "../components/EventDetails";
import RecurrenceScopeDialog from "../components/RecurrenceScopeDialog";
import AttendeeSelect from "../components/AttendeeSelect";
import Announcer from "../components/Announcer";
import { FullScreenSpinner } from "../components/ProtectedRoute";
import { useAuth } from "../store/AuthContext";
import { useCalendarActions, useCalendarState } from "../store/CalendarContext";
import { useCalendar } from "../hooks/useCalendar";
import { useDragInteraction } from "../hooks/useDragInteraction";
import {
  createEventCommand,
  deleteEventCommand,
  moveEventCommand,
  resizeEventCommand,
} from "../history/commands";
import { buildDeleteCommand, buildEditCommand } from "../utils/recurringEdit";
import { expandEvents } from "../utils/recurrence";
import {
  eventToFormValues,
  formValuesToEvent,
  newEventFormValues,
  withoutRecurrence,
} from "../utils/eventForm";
import { civilToKey } from "../utils/dateUtils";

const EMPTY = [];
const iso = (n) => new Date(n).toISOString();

// Toolbar ke andar chhota attendee filter (URL mein ?attendees=3,7)
function AttendeeFilter({ value, onChange }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
        Attendees{value.length ? ` (${value.length})` : ""}
      </summary>
      <div className="absolute z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
        <AttendeeSelect
          value={value}
          onChange={onChange}
          inputId="filter-attendees"
          label="Show events with"
        />
      </div>
    </details>
  );
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { ready, events, loadError, recovered } = useCalendarState();
  const { execute, newEventId, retryLoad } = useCalendarActions();
  const cal = useCalendar();
  const { view, date, tz, days, monthGrid, instances, attendeeIds } = cal;

  const location = useLocation();
  const navigate = useNavigate();
  const match = useMatch("/events/:id");
  const detailId = match ? match.params.id : null;

  // Latest events hamesha ref mein: handlers stale state nahi dekhte
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  });
  const findMaster = (id) => eventsRef.current.find((e) => e.id === id);

  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null); // { mode: "create"|"edit", ... }
  const [scopeAsk, setScopeAsk] = useState(null); // { action, instance, ... }
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);

  // ---------- Details route (/events/:id?occ=...) ----------
  const openDetails = (instance) => {
    const p = new URLSearchParams(location.search);
    if (instance.isRecurring) p.set("occ", String(instance.occurrenceStart));
    else p.delete("occ");
    navigate({ pathname: `/events/${encodeURIComponent(instance.eventId)}`, search: p.toString() });
  };

  const closeDetails = useCallback(() => {
    const p = new URLSearchParams(location.search);
    p.delete("occ");
    navigate({ pathname: "/", search: p.toString() }, { replace: true });
  }, [location.search, navigate]);

  const detail = useMemo(() => {
    if (!detailId || !ready) return null;
    const event = events.find((e) => e.id === detailId);
    if (!event) return { event: null, instance: null };

    const start = Date.parse(event.startUtc);
    const end = Date.parse(event.endUtc);
    const occ = Number(new URLSearchParams(location.search).get("occ"));
    const target = event.recurrence && Number.isFinite(occ) && occ > 0 ? occ : start;

    const instance =
      expandEvents([event], target, target + 1).find((i) => i.start === target) ||
      expandEvents([event], start, start + 1)[0] || {
        instanceId: `${event.id}@${start}`,
        eventId: event.id,
        start,
        end,
        occurrenceStart: start,
        isRecurring: Boolean(event.recurrence),
        event,
      };
    return { event, instance };
  }, [detailId, ready, events, location.search]);

  // ---------- Drag / keyboard commit ----------
  function handleCommit(c) {
    if (c.kind === "create") {
      setForm({ mode: "create", startUtc: c.startUtc, endUtc: c.endUtc });
      return;
    }
    const master = findMaster(c.instance.eventId);
    if (!master) return;

    const edited = { ...master, startUtc: iso(c.startUtc), endUtc: iso(c.endUtc) };
    if (!master.recurrence) {
      execute(
        c.kind === "move" ? moveEventCommand(master, edited) : resizeEventCommand(master, edited)
      );
      return;
    }
    setScopeAsk({
      action: c.kind,
      instance: c.instance,
      edited,
      label: c.kind === "move" ? "Move event" : "Resize event",
    });
  }

  const drag = useDragInteraction({
    days: days || EMPTY,
    tz,
    onCommit: handleCommit,
    onOpen: openDetails,
  });

  const handleSelect = useCallback((instance) => setSelectedId(instance.instanceId), []);

  // ---------- Details se Edit / Delete ----------
  function startEdit(instance) {
    closeDetails();
    if (instance.isRecurring) setScopeAsk({ action: "edit", instance });
    else setForm({ mode: "edit", instance, scope: null });
  }

  function startDelete(instance) {
    if (instance.isRecurring) {
      setScopeAsk({ action: "delete", instance });
      return;
    }
    const master = findMaster(instance.eventId);
    if (master) execute(deleteEventCommand(master));
    closeDetails();
  }

  function confirmScope(scope) {
    const ask = scopeAsk;
    setScopeAsk(null);
    const master = findMaster(ask.instance.eventId);
    if (!master) return;

    if (ask.action === "delete") {
      execute(buildDeleteCommand({ master, instance: ask.instance, scope }));
      closeDetails();
    } else if (ask.action === "edit") {
      setForm({ mode: "edit", instance: ask.instance, scope });
    } else {
      // move / resize
      execute(
        buildEditCommand({
          master,
          instance: ask.instance,
          edited: ask.edited,
          scope,
          tz,
          newId: newEventId(),
          label: ask.label,
          type: ask.action,
        })
      );
    }
  }

  function cancelScope() {
    // Delete se aaye the to details khule rehte hain; move/resize mein kuch nahi badla
    setScopeAsk(null);
  }

  // ---------- Form ----------
  const formInitial = useMemo(() => {
    if (!form) return null;
    if (form.mode === "create") return newEventFormValues(form, tz);
    const master = events.find((e) => e.id === form.instance.eventId);
    if (!master) return null;
    // Form mein wahi occurrence dikhti hai jise user ne chuna
    const shown = {
      ...master,
      startUtc: iso(form.instance.start),
      endUtc: iso(form.instance.end),
    };
    const values = eventToFormValues(shown, tz);
    return form.scope === "this" ? withoutRecurrence(values) : values;
  }, [form, events, tz]);

  function submitForm(values, result) {
    const f = form;
    setForm(null);

    if (f.mode === "create") {
      const event = formValuesToEvent(values, result, {
        tz,
        id: newEventId(),
        organizerId: user?.id,
      });
      execute(createEventCommand(event));
      return;
    }

    const master = findMaster(f.instance.eventId);
    if (!master) return;
    const edited = formValuesToEvent(values, result, { tz, base: master });
    execute(
      buildEditCommand({
        master,
        instance: f.instance,
        edited,
        scope: f.scope,
        tz,
        newId: newEventId(),
      })
    );
  }

  // Month view: din par click = us hafte ka week view (ek hi navigate, ek hi URL update)
  const openDay = useCallback(
    (day) => {
      const p = new URLSearchParams(location.search);
      p.set("view", "week");
      p.set("date", civilToKey(day));
      navigate({ search: p.toString() });
    },
    [location.search, navigate]
  );

  // ---------- Render ----------
  if (loadError) {
    return (
      <div role="alert" className="flex h-screen flex-col items-center justify-center gap-3">
        <p className="text-slate-700">Could not load events: {loadError}</p>
        <button
          onClick={retryLoad}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }
  if (!ready) return <FullScreenSpinner label="Loading events..." />;

  return (
    <div className="flex h-screen flex-col bg-white">
      <Toolbar
        title={cal.title}
        view={view}
        tz={tz}
        onPrev={cal.goPrev}
        onNext={cal.goNext}
        onToday={cal.goToday}
        onViewChange={cal.setView}
        onTzChange={cal.setTz}
      >
        <AttendeeFilter value={attendeeIds} onChange={cal.setAttendeeFilter} />
      </Toolbar>

      {recovered && !recoveryDismissed && (
        <div
          role="status"
          className="flex items-center justify-between bg-amber-50 px-4 py-2 text-sm text-amber-900"
        >
          Some saved data was damaged, so it was recovered or reset.
          <button onClick={() => setRecoveryDismissed(true)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      <main className="min-h-0 flex-1">
        {view === "week" ? (
          <WeekView
            days={days}
            tz={tz}
            instances={instances}
            selectedId={selectedId}
            draggingId={drag.draggingId}
            gridRef={drag.gridRef}
            previewRef={drag.previewRef}
            onSlotPointerDown={drag.onSlotPointerDown}
            onSlotActivate={drag.onSlotActivate}
            onEventPointerDown={drag.onEventPointerDown}
            onEventKeyDown={drag.onEventKeyDown}
            onOpen={drag.onOpen}
            onSelect={handleSelect}
          />
        ) : (
          <MonthView
            monthGrid={monthGrid}
            date={date}
            tz={tz}
            instances={instances}
            selectedId={selectedId}
            onOpen={openDetails}
            onSelect={handleSelect}
            onDayClick={openDay}
          />
        )}
      </main>

      <Announcer />

      {detail && (
        <EventDetails
          event={detail.event}
          instance={detail.instance}
          tz={tz}
          onClose={closeDetails}
          onEdit={startEdit}
          onDelete={startDelete}
        />
      )}

      {scopeAsk && (
        <RecurrenceScopeDialog
          action={scopeAsk.action}
          onConfirm={confirmScope}
          onCancel={cancelScope}
        />
      )}

      {form && formInitial && (
        <EventForm
          title={form.mode === "create" ? "New event" : "Edit event"}
          initialValues={formInitial}
          tz={tz}
          events={events}
          excludeEventId={form.mode === "edit" ? form.instance.eventId : null}
          hideRecurrence={form.scope === "this"}
          onSubmit={submitForm}
          onCancel={() => setForm(null)}
        />
      )}
    </div>
  );
}