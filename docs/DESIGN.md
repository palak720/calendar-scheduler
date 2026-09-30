# Design Note

## 1. State and history

**State.** One reducer (`calendarReducer`) holds:

- `events`: the optimistic UI state. Every action is applied here immediately.
- `confirmed`: id → last snapshot that the fake API accepted. Rollback restores from here.
- `history`: `{ past, future }` stacks of commands.
- `pending`: commands whose sync has not finished (with the event ids they touch).
- `sync`: `idle | saving | saved | failed`, and an `announce` message for `aria-live`.

Two contexts are used: state and actions. Action functions are stable, so components that only dispatch do not re-render on state changes. The reducer is pure; side effects (localStorage, sync queue, timers) live in `CalendarContext`.

**Command pattern.** Every user action is a command with `do(events)`, `undo(events)` and `ops(direction)` (the API calls to send). Update commands store full `before` and `after` snapshots, so undo restores the exact previous state whether it was a move, resize or edit. Recurring edits are `compositeCommand`s (for example "this and following" = truncate old series + create new series), so they are still one undo step.

**One drag = one undo step.** During a drag nothing is committed. `pointerup` calls `onCommit` once, which executes one command.

**Undo/redo.** Undo pops the top of `past`, applies `undo`, pushes to `future`. A new action clears `future`. History is capped at 100. Undo and redo are themselves synced (undo of a create sends a delete).

**Fake sync and rollback.** Changes go through one serial promise queue, in the order the user made them. The response never overwrites `events`; it only updates `confirmed`, `pending` and the status. So for "drag, edit, drag again while a save is pending" the UI always shows the last action, and syncs arrive in order.

When a sync fails, the touched events are restored from `confirmed`, queued commands on the same events are cancelled (their snapshots were based on the failed state), and `dropFailedCommand` removes the failed command and later commands on those events from the history. Commands on other events and earlier commands are untouched, so later undo steps are not corrupted.

## 2. Overlap layout

`layoutDayEvents` (src/utils/overlapLayout.js), per day:

1. Sort by start, longer event first on ties.
2. Split into **clusters**: a cluster ends when the next event starts at or after the latest end so far (touching is not overlapping).
3. Inside a cluster, place each event in the first column whose last event has ended (greedy).
4. **Expand**: an event grows to the right until it meets a column that contains an overlapping event.

Output per event is `{ column, columns, span }`, so `left = column / columns` and `width = span / columns`. Clusters keep a lone morning event at full width even if the afternoon is crowded. Cost is `O(n log n)` for the sort plus small loops inside clusters.

## 3. Recurrence

The rule is stored on the event: `freq`, `interval`, `monthlyMode` (`date` or `nth`), `until`, `count`, `tz`, `exdates`. `expandEvents(events, rangeStart, rangeEnd)` generates instances only for the visible range and never stores them.

- **Direct formula.** The n-th occurrence date is computed from the anchor and n, not from the previous date. That is why 31 Jan gives 28 Feb and then 31 Mar (the clamp does not accumulate).
- **Jump ahead.** `estimateStartIndex` starts near the range instead of at the first occurrence; the loop stops at the first start after the range or a safety cap of 500.
- **DST.** The date is a civil date and the time is a wall-clock time in the rule's timezone, converted with `zonedTimeToUtc`, so 9:00 stays 9:00 across DST while UTC changes. All-day spans are counted in days, not 24-hour blocks.
- **Nth weekday.** "2nd Tuesday" is derived from the anchor date; a 5th weekday means the last one.

**Edit scopes** (`recurringEdit.js`):

- *This event*: add the occurrence start to `exdates` and create a standalone event.
- *This and following*: set the old series `until` to the previous day (and drop `count`), create a new series from that date. If `count` was unchanged, the new series gets `count - occurrencesBefore`.
- *All events*: edit the master; if the time changed, the series moves by the same day and clock delta.

## 4. Other decisions

- **Time.** UTC is stored everywhere; calendar arithmetic uses civil dates `{ year, month, day }` on UTC fields, so DST cannot break navigation. `Intl` does all formatting.
- **URL as state.** `view`, `date`, `tz`, `attendees` (and `occ` for a recurring event dialog) are read from the URL and validated; invalid values fall back to defaults.
- **Drag.** Pointer events on `window` with one `AbortController`, a 4 px click threshold, auto-scroll near the edges, and the final position taken from the last pointer position on release.
- **Axios.** One instance. A refresh promise is shared by all failing requests (single flight), and requests are retried once with the new token. All errors are normalized to `{ status, code, message, details }`.