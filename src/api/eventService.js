import http from "./http";

// Fixed base date (Monday, UTC). Time ka koi bhi rule Date.now() par nahi hai,
// isliye refresh ke baad bhi seed events wahi rahenge.
const SEED_BASE_UTC = Date.UTC(2026, 9, 5); // 5 Oct 2026
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Fake sync config
export const FAKE_FAIL_RATE = 0.2;
const FAKE_MIN_DELAY = 400;
const FAKE_MAX_DELAY = 900;

// todo -> event. Sirf todo.id se time nikalta hai (deterministic).
// day: 0..13 din base se, hour: 8..17, minute: 0/15/30/45, duration: 30..120 min
function mapTodoToEvent(todo) {
  const id = todo.id;
  const dayOffset = id % 14;
  const hour = 8 + ((id * 7) % 10);
  const minute = ((id * 3) % 4) * 15;
  const duration = 30 + ((id * 5) % 4) * 30;

  const start = SEED_BASE_UTC + dayOffset * DAY + hour * HOUR + minute * MIN;
  const end = start + duration * MIN;

  return {
    id: `todo-${id}`,
    title: todo.todo,
    startUtc: new Date(start).toISOString(),
    endUtc: new Date(end).toISOString(),
    allDay: false,
    organizerId: todo.userId,
    attendeeIds: [],
    recurrence: null, // { freq, interval, until, count } baad mein
    reminder: null,
  };
}

// GET /todos?limit=100&skip=0 ... total 254, isliye 3 pages
export async function fetchSeedEvents({ signal } = {}) {
  const limit = 100;
  let skip = 0;
  let total = Infinity;
  const events = [];

  while (skip < total) {
    const { data } = await http.get("/todos", {
      params: { limit, skip },
      signal,
    });
    total = data.total;
    events.push(...data.todos.map(mapTodoToEvent));
    if (data.todos.length === 0) break; // safety, infinite loop se bachne ke liye
    skip += limit;
  }
  return events;
}

// ---------- Fake sync ----------

function fakeNetwork() {
  const delay =
    FAKE_MIN_DELAY + Math.random() * (FAKE_MAX_DELAY - FAKE_MIN_DELAY);
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < FAKE_FAIL_RATE) {
        reject({
          status: 0,
          code: "SYNC_FAILED",
          message: "Could not save. Changes were rolled back.",
          details: null,
        });
      } else {
        resolve();
      }
    }, delay);
  });
}

// "todo-12" -> 12, warna null. Naye events ki id numeric nahi hoti.
function seedIdOf(event) {
  const m = /^todo-(\d+)$/.exec(event.id);
  return m ? Number(m[1]) : null;
}

// DummyJSON kuch save nahi karta, 404 ko success maante hain.
async function callApi(fn) {
  try {
    await fn();
  } catch (err) {
    if (err.status !== 404) throw err;
  }
}

// type: "create" | "update" | "delete"
// Pehle fake failure, tabhi real API call jaati hai.
export async function syncEvent(type, event) {
  await fakeNetwork();

  if (type === "create") {
    return callApi(() =>
      http.post("/todos/add", {
        todo: event.title,
        completed: false,
        userId: event.organizerId,
      })
    );
  }

  const seedId = seedIdOf(event);
  if (seedId === null) return; // naya event, API par exist hi nahi karta

  if (type === "update") {
    return callApi(() => http.put(`/todos/${seedId}`, { todo: event.title }));
  }
  if (type === "delete") {
    return callApi(() => http.delete(`/todos/${seedId}`));
  }
}