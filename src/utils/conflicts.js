import { expandEvents } from "./recurrence";

// Return: Map(attendeeId -> [instance, ...]) : kaun kis instance mein busy hai.
// All-day events ko busy nahi maante (Google Calendar bhi nahi maanta).
export function findConflicts({ events, startUtc, endUtc, attendeeIds, excludeEventId = null }) {
  const conflicts = new Map();
  if (startUtc == null || endUtc == null || endUtc <= startUtc) return conflicts;
  if (!attendeeIds || attendeeIds.length === 0) return conflicts;

  const wanted = new Set(attendeeIds);

  // Pehle sasta filter: sirf wahi events jinme koi wanted attendee hai.
  // Isse 500+ events mein bhi expand sirf kuch events ka hota hai.
  const candidates = events.filter(
    (e) =>
      e.id !== excludeEventId &&
      !e.allDay &&
      e.attendeeIds.some((id) => wanted.has(id))
  );
  if (candidates.length === 0) return conflicts;

  // Recurring events bhi sirf is time window ke liye expand hote hain
  for (const inst of expandEvents(candidates, startUtc, endUtc)) {
    if (inst.start >= endUtc || inst.end <= startUtc) continue; // sirf touch karna overlap nahi
    for (const id of inst.event.attendeeIds) {
      if (!wanted.has(id)) continue;
      const list = conflicts.get(id) || [];
      list.push(inst);
      conflicts.set(id, list);
    }
  }
  return conflicts;
}