# Calendar Scheduler

A calendar app built with React, Tailwind CSS and Axios. Users log in with a DummyJSON account, then create, move, resize and repeat events, with full undo/redo.

- **Live:** <your-vercel-link>
- **Repo:** <your-github-link>
- **Design note:** [docs/DESIGN.md](docs/DESIGN.md)

## Setup

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

Test login: `emilys` / `emilyspass` (any user from https://dummyjson.com/users works).

Add `?delay=3000` to a request URL to test slow responses. To test token refresh, set `ACCESS_TOKEN_MINS = 1` in `src/api/http.js`.

## Stack and rules followed

React (Vite), Tailwind CSS, Axios, React Router, `useReducer` + Context. No Redux Toolkit Query, React Query, SWR, calendar, date, drag-drop or state-history libraries. Only plain `Date` and `Intl`.

## Project structure

```
src/
  api/         http.js (shared Axios), tokenStorage, authService, userService, eventService
  history/     commands.js (do/undo commands), history.js (undo/redo stacks)
  store/       calendarReducer, CalendarContext, AuthContext
  hooks/       useCalendar (URL state), useDragInteraction, useHistory
  utils/       dateUtils, overlapLayout, recurrence, recurringEdit, conflicts,
               validation, eventForm, storage, gridConstants
  components/  Toolbar, WeekView, MonthView, EventBlock, EventForm, EventDetails,
               AttendeeSelect, Modal, RecurrenceScopeDialog, Announcer, ProtectedRoute
  pages/       LoginPage, CalendarPage
```

## Persistence approach

DummyJSON saves nothing and has no events, so the browser store is the source of truth.

- Events and recurrence rules live in `localStorage` under one key, wrapped as `{ version, savedAt, events }`. `version` is the schema version; `migrate()` in `src/utils/storage.js` is where a future v2 upgrade step goes.
- Every event is sanitized on load. If the JSON is broken, has the wrong shape or a newer version, the raw data is moved to a backup key, the app starts clean (seed events are fetched again) and a notice is shown. If only some events are invalid, the valid ones are kept.
- Seed events come from `GET /todos` (3 pages, 254 total). Start/end times are derived only from `todo.id` with a fixed rule, so they are identical after every refresh.
- Recurrence is stored as a rule on the event. Instances are generated only for the visible range.
- Session tokens are stored in `localStorage`; the `storage` event logs out other tabs.

## Finished features

## Finished features

Checked items were tested manually.

- [x] Login with `POST /auth/login`, clear errors, protected routes, logout, double-click safe
- [x] Session restore with `GET /auth/me` on reload
- [x] Single shared Axios instance with token attach and one consistent error shape
- [x] API calls only in service files
- [x] Week and month views with previous / next / today
- [x] View, date, timezone and attendee filter stored in the URL, bad values fall back safely
- [x] Drag on empty slots to create, snapped to 15 minutes, validated form
- [x] Overlap layout written from scratch (side by side columns)
- [x] Searchable attendee multi-select (own component, debounced, cancels stale requests)
- [x] Live busy warning when an attendee has an overlapping event
- [x] Timezone switcher (UTC storage, Intl display)
- [x] Undo / redo with buttons and Ctrl+Z / Ctrl+Shift+Z
- [x] `/events/:id` details dialog, survives refresh, "Event not found" for bad ids
- [x] Double submit guard for Save and Login
- [x] Multi-tab logout

## Implemented, not fully tested

The code for these is in the repository, but I have not verified them end to end yet, so they may have bugs.

- [ ] 401 then one refresh then retry (single-flight refresh)
- [ ] Move and resize with live preview, Esc cancels, one drag = one undo step
- [ ] Drag performance (state in refs, `requestAnimationFrame` preview, memoized blocks)
- [ ] Keyboard alternative: focus an event, press `M`, arrows to move, Enter to confirm
- [ ] Recurring events (daily / weekly / monthly, until date or count) and month-end / DST handling
- [ ] Edit and delete scopes: this event / this and following / all events
- [ ] Fake sync (fails about 20% of the time) with saving / saved / failed status and rollback
- [ ] Accessibility: grid arrow keys, modal focus trap, `aria-live` announcements

## Performance notes (500+ events)

- Drag state lives in refs. React state changes only twice per drag (start and end).
- The preview is one DOM element moved with `transform` inside `requestAnimationFrame`; no event block re-renders while dragging.
- `EventBlock` uses a custom `memo` comparing real values, because instances are recreated on every expand.
- `useCalendar` has two memo steps: expanding recurrence (only when events or range change) and the attendee filter (only when the filter changes).
- Month view groups instances into 42 day buckets in a single pass.

## Known limitations

- Month view has no drag or create; click a day to open its week.
- Reminders are stored and shown but no notification is fired.
- The time grid is a fixed 24 rows, so on DST change days the wall-clock position and the elapsed duration can differ by an hour.
- A "5th weekday" monthly rule means "last weekday" of the month.
- `count` includes occurrences removed with "this event" (the same way most calendars count).
- "All events" edits shift deleted-occurrence markers by the same delta; across a DST change this can be off by an hour.
- Editing a series in a display timezone different from the timezone it was created in can move it by an hour across DST.
- Events are not synced live between tabs (only logout is), and all users of one browser profile share the same stored events.
- Touch devices: the grid uses `touch-action: none`, so scrolling the grid by touch is hard.
- Bad URL values fall back safely when read, but the address bar is not rewritten until the next navigation.
- No automated tests; features were checked manually.
