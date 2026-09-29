// Undo/redo ka stack logic. Pure functions hain, React se koi lena-dena nahi.
// Har function purani history ko mutate nahi karta, nayi history return karta hai.
//
// past  : jo commands ho chuke (last element = sabse recent)
// future: jo undo ho chuke (last element = agla redo)

export const HISTORY_LIMIT = 100;

export const createHistory = () => ({ past: [], future: [] });

export const canUndo = (h) => h.past.length > 0;
export const canRedo = (h) => h.future.length > 0;

// Button tooltip aur aria-live ke liye: "Undo Move event"
export const peekUndoLabel = (h) => (h.past.length ? h.past[h.past.length - 1].label : null);
export const peekRedoLabel = (h) => (h.future.length ? h.future[h.future.length - 1].label : null);

// Naya action: command past mein jaata hai, future saaf.
// (Undo ke baad naya kaam karo to purana redo chain khatam hota hai, sab editors mein yahi hota hai)
export function pushCommand(h, command, limit = HISTORY_LIMIT) {
  const past = [...h.past, command];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    future: [],
  };
}

// Undo: past ka last command future mein chala jaata hai
export function undoStep(h) {
  if (h.past.length === 0) return { history: h, command: null };
  const command = h.past[h.past.length - 1];
  return {
    history: { past: h.past.slice(0, -1), future: [...h.future, command] },
    command,
  };
}

// Redo: future ka last command wapas past mein
export function redoStep(h) {
  if (h.future.length === 0) return { history: h, command: null };
  const command = h.future[h.future.length - 1];
  return {
    history: { past: [...h.past, command], future: h.future.slice(0, -1) },
    command,
  };
}

// Sync fail hone par: failed command aur uske baad ke wo commands hatao
// jo usi events ko touch karte hain (unke snapshots failed state par based hain,
// undo karte to failed state wapas aa jaati).
// Jo commands alag events par hain ya failed command se pehle ke hain, wo safe rehte hain.
export function dropFailedCommand(h, failedId, ids) {
  const touches = (c) => c.touchedIds.some((id) => ids.includes(id));
  const idx = h.past.findIndex((c) => c.id === failedId);

  const past = h.past.filter((c, i) => {
    if (idx === -1) return c.id !== failedId;
    if (i < idx) return true; // failed se pehle wale: safe
    return i !== idx && !touches(c); // failed aur uspar depend karne wale: hatao
  });

  // Future wale commands bhi in events par purani (ab ghalat) state maante hain
  const future = h.future.filter((c) => c.id !== failedId && !touches(c));

  return { past, future };
}