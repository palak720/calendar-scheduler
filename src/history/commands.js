// Command pattern: har user action ek "command" object hai jisme
//   do(events)   -> naya events array
//   undo(events) -> naya events array (do ka ulta)
//   ops(dir)     -> fake sync ke liye API operations ("do" ya "undo" direction mein)
// Ye file pure JS hai, React se koi lena-dena nahi. Isliye test karna aasan hai.
//
// Rule: events immutable maane jaate hain. Kabhi mutate nahi karte, hamesha naya object banate hain.

let counter = 0;
function newCommandId() {
  counter += 1;
  return `cmd-${Date.now().toString(36)}-${counter}`;
}

// Snapshot: command ke andar ki copy, taaki baad mein koi object badle to undo na bigde
const snap = (obj) => structuredClone(obj);

function makeCommand({ type, label, touchedIds, doFn, undoFn, ops }) {
  return {
    id: newCommandId(),
    type,
    label, // aria-live announcements aur button tooltip ke liye
    touchedIds, // rollback ke waqt pata chalta hai kaunse events affect hue
    do: doFn,
    undo: undoFn,
    ops,
  };
}

// ---------- Create ----------
export function createEventCommand(event, label = "Create event") {
  const ev = snap(event);
  return makeCommand({
    type: "create",
    label,
    touchedIds: [ev.id],
    doFn: (events) => (events.some((e) => e.id === ev.id) ? events : [...events, ev]),
    undoFn: (events) => events.filter((e) => e.id !== ev.id),
    ops: (dir) =>
      dir === "do"
        ? [{ type: "create", event: ev }]
        : [{ type: "delete", event: ev }],
  });
}

// ---------- Delete ----------
export function deleteEventCommand(event, label = "Delete event") {
  const ev = snap(event);
  return makeCommand({
    type: "delete",
    label,
    touchedIds: [ev.id],
    doFn: (events) => events.filter((e) => e.id !== ev.id),
    undoFn: (events) => (events.some((e) => e.id === ev.id) ? events : [...events, ev]),
    ops: (dir) =>
      dir === "do"
        ? [{ type: "delete", event: ev }]
        : [{ type: "create", event: ev }],
  });
}

// ---------- Update (move / resize / edit teeno isi se) ----------
// before aur after: poore event ke snapshots. Partial diff nahi rakhte,
// isliye undo hamesha exact purani state wapas deta hai.
export function updateEventCommand(before, after, { type = "update", label = "Edit event" } = {}) {
  const b = snap(before);
  const a = snap(after);
  return makeCommand({
    type,
    label,
    touchedIds: [a.id],
    doFn: (events) => events.map((e) => (e.id === a.id ? a : e)),
    undoFn: (events) => events.map((e) => (e.id === b.id ? b : e)),
    ops: (dir) =>
      dir === "do"
        ? [{ type: "update", event: a }]
        : [{ type: "update", event: b }],
  });
}

export const moveEventCommand = (before, after) =>
  updateEventCommand(before, after, { type: "move", label: "Move event" });

export const resizeEventCommand = (before, after) =>
  updateEventCommand(before, after, { type: "resize", label: "Resize event" });

// ---------- Duplicate ----------
// Live change round ke liye: naya id, title mein "(copy)", baaki sab same.
// Bas ek create command hai, isliye undo apne aap kaam karta hai.
export function duplicateEventCommand(event, newId) {
  const copy = {
    ...snap(event),
    id: newId,
    title: `${event.title} (copy)`,
  };
  return createEventCommand(copy, "Duplicate event");
}

// ---------- Composite ----------
// Kai commands ek undo step ban jaate hain.
// Recurring edit ("this and following") mein: purani series update + nayi series create.
// do: order mein, undo: ulte order mein.
export function compositeCommand(label, commands, type = "composite") {
  const ids = Array.from(new Set(commands.flatMap((c) => c.touchedIds)));
  return makeCommand({
    type,
    label,
    touchedIds: ids,
    doFn: (events) => commands.reduce((acc, c) => c.do(acc), events),
    undoFn: (events) => commands.reduceRight((acc, c) => c.undo(acc), events),
    ops: (dir) =>
      dir === "do"
        ? commands.flatMap((c) => c.ops("do"))
        : [...commands].reverse().flatMap((c) => c.ops("undo")),
  });
}