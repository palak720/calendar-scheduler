import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { calendarReducer, initialState, A } from "./calendarReducer";
import { loadEvents, saveEvents } from "../utils/storage";
import { fetchSeedEvents, syncEvent } from "../api/eventService";

// Do context: state alag, actions alag.
// Actions ke functions kabhi nahi badalte, isliye jo component sirf actions
// use karta hai wo state badalne par re-render nahi hota.
const StateCtx = createContext(null);
const ActionsCtx = createContext(null);

export function CalendarProvider({ children }) {
  const [state, rawDispatch] = useReducer(calendarReducer, initialState);
  const [loadError, setLoadError] = useState(null);
  const [loadTick, setLoadTick] = useState(0);

  // stateRef: hamesha latest state (render ka wait nahi karta).
  // Ctrl+Z do baar jaldi dabao to bhi doosra undo sahi command dekhta hai.
  const stateRef = useRef(state);
  const dispatch = useCallback((action) => {
    stateRef.current = calendarReducer(stateRef.current, action); // reducer pure hai, safe
    rawDispatch(action);
  }, []);

  // ---------- Initial load: localStorage, warna seed todos ----------
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function init() {
      setLoadError(null);
      const saved = loadEvents();
      const needSeed =
        saved.status === "empty" ||
        (saved.status === "recovered" && saved.events.length === 0);

      if (!needSeed) {
        dispatch({
          type: A.INIT,
          events: saved.events,
          recovered: saved.status === "recovered",
        });
        return;
      }
      try {
        const seed = await fetchSeedEvents({ signal: controller.signal });
        if (cancelled) return;
        dispatch({
          type: A.INIT,
          events: seed,
          recovered: saved.status === "recovered",
        });
      } catch (err) {
        if (cancelled || err?.code === "CANCELLED") return;
        setLoadError(err?.message || "Could not load events");
      }
    }

    init();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dispatch, loadTick]);

  const retryLoad = useCallback(() => setLoadTick((n) => n + 1), []);

  // ---------- Persistence ----------
  useEffect(() => {
    if (!state.ready) return;
    const t = setTimeout(() => saveEvents(state.events), 150);
    return () => clearTimeout(t);
  }, [state.ready, state.events]);

  // Tab band hone se pehle bacha hua save flush
  useEffect(() => {
    const flush = () => {
      if (stateRef.current.ready) saveEvents(stateRef.current.events);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  // ---------- Fake sync queue ----------
  // Ek serial queue: changes usi order mein sync hote hain jis order mein user ne kiye.
  // Isse "drag -> edit -> drag" mein purana response naye ko overwrite nahi kar sakta.
  const queueRef = useRef(Promise.resolve());
  const seqRef = useRef(0);

  const enqueueSync = useCallback(
    (command, dir) => {
      // Key unique hai kyunki ek hi command ka do aur undo dono pending ho sakte hain
      seqRef.current += 1;
      const key = `${command.id}#${seqRef.current}`;
      const ops = command.ops(dir);

      dispatch({ type: A.SYNC_START, commandId: key, ids: command.touchedIds });

      queueRef.current = queueRef.current.then(async () => {
        // Pehle wale command ke fail hone par ye cancel ho chuka hoga
        if (!stateRef.current.pending[key]) return;
        try {
          for (const op of ops) await syncEvent(op.type, op.event);
          dispatch({ type: A.SYNC_SUCCESS, commandId: key, ops });
        } catch (error) {
          dispatch({ type: A.SYNC_FAILED, commandId: key, error });
        }
      });
    },
    [dispatch]
  );

  // ---------- Actions ----------
  const execute = useCallback(
    (command) => {
      dispatch({ type: A.EXECUTE, command });
      enqueueSync(command, "do");
    },
    [dispatch, enqueueSync]
  );

  const undo = useCallback(() => {
    const past = stateRef.current.history.past;
    const command = past[past.length - 1];
    if (!command) return;
    dispatch({ type: A.UNDO, commandId: command.id });
    enqueueSync(command, "undo");
  }, [dispatch, enqueueSync]);

  const redo = useCallback(() => {
    const future = stateRef.current.history.future;
    const command = future[future.length - 1];
    if (!command) return;
    dispatch({ type: A.REDO, commandId: command.id });
    enqueueSync(command, "do");
  }, [dispatch, enqueueSync]);

  const clearSyncError = useCallback(
    () => dispatch({ type: A.CLEAR_SYNC_ERROR }),
    [dispatch]
  );

  const newEventId = useCallback(
    () => `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    []
  );

  const actions = useMemo(
    () => ({ execute, undo, redo, clearSyncError, retryLoad, newEventId }),
    [execute, undo, redo, clearSyncError, retryLoad, newEventId]
  );

  const value = useMemo(() => ({ ...state, loadError }), [state, loadError]);

  return (
    <StateCtx.Provider value={value}>
      <ActionsCtx.Provider value={actions}>{children}</ActionsCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useCalendarState() {
  const ctx = useContext(StateCtx);
  if (!ctx) throw new Error("useCalendarState must be used inside CalendarProvider");
  return ctx;
}

export function useCalendarActions() {
  const ctx = useContext(ActionsCtx);
  if (!ctx) throw new Error("useCalendarActions must be used inside CalendarProvider");
  return ctx;
}