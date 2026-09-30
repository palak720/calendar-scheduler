import {
  createHistory,
  pushCommand,
  undoStep,
  redoStep,
  dropFailedCommand,
} from "../history/history";

export const A = {
  INIT: "INIT",
  EXECUTE: "EXECUTE",
  UNDO: "UNDO",
  REDO: "REDO",
  SYNC_START: "SYNC_START",
  SYNC_SUCCESS: "SYNC_SUCCESS",
  SYNC_FAILED: "SYNC_FAILED",
  CLEAR_SYNC_ERROR: "CLEAR_SYNC_ERROR",
};

// events    : UI ki current (optimistic) state. Har action turant yahin lagta hai.
// confirmed : id -> last successfully synced snapshot. Rollback isi par hota hai.
// history   : { past, future } (history.js)
// pending   : commandId -> { ids }. Jo sync queue mein hai ya chal raha hai.
// announce  : aria-live ke liye { seq, text }
export const initialState = {
  ready: false,
  recovered: false,
  events: [],
  confirmed: {},
  history: createHistory(),
  pending: {},
  sync: { status: "idle", error: null }, // idle | saving | saved | failed
  announce: { seq: 0, text: "" },
};

const say = (state, text) => ({ seq: state.announce.seq + 1, text });

// Synced ops ko confirmed map par lagao
function applyOpsToConfirmed(confirmed, ops) {
  const next = { ...confirmed };
  for (const op of ops) {
    if (op.type === "delete") delete next[op.event.id];
    else next[op.event.id] = op.event;
  }
  return next;
}

// In ids ko last confirmed state par wapas lao.
// Confirmed mein nahi hai (naya event tha) -> hata do.
// Confirmed mein hai par locally delete ho gaya tha -> wapas aa jaata hai.
function restoreIds(events, confirmed, ids) {
  const set = new Set(ids);
  const kept = events.filter((e) => !set.has(e.id));
  const restored = ids.filter((id) => confirmed[id]).map((id) => confirmed[id]);
  return [...kept, ...restored];
}

export function calendarReducer(state, action) {
  switch (action.type) {
    case A.INIT: {
      const events = action.events;
      return {
        ...state,
        ready: true,
        recovered: Boolean(action.recovered),
        events,
        // Load hue events ko confirmed maante hain (unse pehle ka koi record nahi)
        confirmed: Object.fromEntries(events.map((e) => [e.id, e])),
        history: createHistory(),
        pending: {},
      };
    }

    case A.EXECUTE: {
      const { command } = action;
      return {
        ...state,
        events: command.do(state.events),
        history: pushCommand(state.history, command),
        announce: say(state, command.label),
      };
    }

    case A.UNDO: {
      // commandId match check: stale ya double dispatch par kuch nahi hoga
      const top = state.history.past[state.history.past.length - 1];
      if (!top || top.id !== action.commandId) return state;
      const { history, command } = undoStep(state.history);
      return {
        ...state,
        events: command.undo(state.events),
        history,
        announce: say(state, `Undid: ${command.label}`),
      };
    }

    case A.REDO: {
      const top = state.history.future[state.history.future.length - 1];
      if (!top || top.id !== action.commandId) return state;
      const { history, command } = redoStep(state.history);
      return {
        ...state,
        events: command.do(state.events),
        history,
        announce: say(state, `Redid: ${command.label}`),
      };
    }

    // Enqueue ke waqt hi register hota hai, taaki failure par queued commands cancel ho sakein
    case A.SYNC_START: {
      return {
        ...state,
        pending: { ...state.pending, [action.commandId]: { ids: action.ids } },
        sync: { status: "saving", error: null },
      };
    }

    case A.SYNC_SUCCESS: {
      if (!state.pending[action.commandId]) return state; // cancel ho chuka tha
      const { [action.commandId]: _done, ...pending } = state.pending;
      const stillSaving = Object.keys(pending).length > 0;
      return {
        ...state,
        pending,
        confirmed: applyOpsToConfirmed(state.confirmed, action.ops),
        sync: {
          status: stillSaving
            ? "saving"
            : state.sync.status === "failed"
            ? "failed"
            : "saved",
          error: state.sync.error,
        },
      };
    }

    case A.SYNC_FAILED: {
      const failed = state.pending[action.commandId];
      if (!failed) return state;

      // Failed command aur wo queued commands jo same events par hain
      // (unke snapshots failed state par based hain) sab cancel.
      const cancelledIds = new Set(failed.ids);
      const pending = {};
      for (const [cid, p] of Object.entries(state.pending)) {
        if (cid === action.commandId) continue;
        if (p.ids.some((id) => cancelledIds.has(id))) {
          p.ids.forEach((id) => cancelledIds.add(id)); // unke ids bhi rollback honge
        } else {
          pending[cid] = p;
        }
      }
      const ids = Array.from(cancelledIds);

      return {
        ...state,
        events: restoreIds(state.events, state.confirmed, ids),
        history: dropFailedCommand(state.history, action.commandId, ids),
        pending,
        sync: {
          status: "failed",
          error: action.error?.message || "Could not save. Changes were rolled back.",
        },
        announce: say(state, "Save failed. Changes were rolled back."),
      };
    }

    case A.CLEAR_SYNC_ERROR:
      return {
        ...state,
        sync: {
          status: Object.keys(state.pending).length ? "saving" : "idle",
          error: null,
        },
      };

    default:
      return state;
  }
}