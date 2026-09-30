import { useCallback, useEffect, useRef, useState } from "react";
import { announce } from "../components/Announcer";
import {
  MINUTE,
  SNAP_MINUTES,
  civilFromUtc,
  civilToDayNumber,
  dayNumberToCivil,
  formatDateTime,
  formatTime,
  minutesOfDay,
  zonedTimeToUtc,
} from "../utils/dateUtils";
import { GUTTER_WIDTH, PX_PER_MINUTE } from "../utils/gridConstants";

const DAY_MIN = 24 * 60;
const DRAG_THRESHOLD = 4; // px, isse kam hilna = click, drag nahi
const EDGE = 40; // scroll container ke kinare itne px par auto-scroll
const SCROLL_SPEED = 12;
const CLICK_GUARD_MS = 250; // drag ke turant baad wala click ignore
const DEFAULT_CREATE_MINUTES = 60; // keyboard se bana event

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ---------- Wall-clock helpers ----------
// "total" = din number * 1440 + din ke minute (timezone ki wall-clock mein).
// Snapping wall-clock par hoti hai, isliye 9:15 hamesha 9:15 rehta hai.
function wallToUtc(total, tz) {
  const dayNum = Math.floor(total / DAY_MIN);
  const minutes = total - dayNum * DAY_MIN;
  const c = dayNumberToCivil(dayNum);
  return zonedTimeToUtc(
    { ...c, hour: Math.floor(minutes / 60), minute: minutes % 60 },
    tz
  );
}

function utcToWall(ms, tz) {
  return civilToDayNumber(civilFromUtc(ms, tz)) * DAY_MIN + minutesOfDay(ms, tz);
}

// ---------- Geometry ----------
function colWidthOf(gridEl, dayCount) {
  return (gridEl.getBoundingClientRect().width - GUTTER_WIDTH) / dayCount;
}

// Screen point -> { col, minutes, colWidth }. Rect har frame mein ek baar padhte hain.
function pointerToGrid(gridEl, dayCount, x, y) {
  const rect = gridEl.getBoundingClientRect();
  const colWidth = (rect.width - GUTTER_WIDTH) / dayCount;
  return {
    col: clamp(Math.floor((x - rect.left - GUTTER_WIDTH) / colWidth), 0, dayCount - 1),
    minutes: clamp((y - rect.top) / PX_PER_MINUTE, 0, DAY_MIN),
    colWidth,
  };
}

// ---------- Draft (abhi ka proposed start/end) ----------
function computeMouseDraft(d, p, days, tz) {
  const firstNum = civilToDayNumber(days[0]);
  const lastNum = firstNum + days.length - 1;

  if (d.mode === "create") {
    const dayNum = firstNum + d.col0; // create ek hi din ke andar
    const a = Math.floor(d.raw0 / SNAP_MINUTES) * SNAP_MINUTES; // jis slot par dabaya
    let lo;
    let hi;
    if (p.minutes >= d.raw0) {
      lo = a;
      hi = Math.max(Math.ceil(p.minutes / SNAP_MINUTES) * SNAP_MINUTES, a + SNAP_MINUTES);
    } else {
      lo = Math.floor(p.minutes / SNAP_MINUTES) * SNAP_MINUTES;
      hi = a + SNAP_MINUTES;
    }
    lo = clamp(lo, 0, DAY_MIN - SNAP_MINUTES);
    hi = clamp(hi, SNAP_MINUTES, DAY_MIN);
    return {
      startUtc: wallToUtc(dayNum * DAY_MIN + lo, tz),
      endUtc: wallToUtc(dayNum * DAY_MIN + hi, tz),
    };
  }

  if (d.mode === "move") {
    // Pointer kitna khisaka (grab offset apne aap sambhal jaata hai), utna event khisao
    const dayNum = firstNum + p.col;
    const startPtr = (firstNum + d.col0) * DAY_MIN + d.raw0;
    const nowPtr = dayNum * DAY_MIN + p.minutes;
    let total =
      Math.round((d.origStartTotal + (nowPtr - startPtr)) / SNAP_MINUTES) * SNAP_MINUTES;
    total = clamp(total, firstNum * DAY_MIN, lastNum * DAY_MIN + DAY_MIN - SNAP_MINUTES);
    const startUtc = wallToUtc(total, tz);
    return { startUtc, endUtc: startUtc + d.duration }; // duration same rehti hai
  }

  // resize-start / resize-end: sirf ek edge, usi column mein
  const dayNum = firstNum + d.col0;
  const snapped = clamp(Math.round(p.minutes / SNAP_MINUTES) * SNAP_MINUTES, 0, DAY_MIN);
  const edge = wallToUtc(dayNum * DAY_MIN + snapped, tz);
  const minLen = SNAP_MINUTES * MINUTE; // end hamesha start ke baad
  if (d.mode === "resize-end") {
    return { startUtc: d.origStart, endUtc: Math.max(edge, d.origStart + minLen) };
  }
  return { startUtc: Math.min(edge, d.origEnd - minLen), endUtc: d.origEnd };
}

// ---------- Preview (seedha DOM, React render nahi) ----------
function paintPreview(el, draft, colWidth, days, tz) {
  if (!el || !draft) return;
  const firstNum = civilToDayNumber(days[0]);
  const startDay = civilToDayNumber(civilFromUtc(draft.startUtc, tz));
  const col = startDay - firstNum;
  if (col < 0 || col >= days.length) {
    el.style.display = "none";
    return;
  }
  const startMin = minutesOfDay(draft.startUtc, tz);
  const endDay = civilToDayNumber(civilFromUtc(draft.endUtc, tz));
  const endMin = endDay > startDay ? DAY_MIN : minutesOfDay(draft.endUtc, tz);
  const height = Math.max((endMin - startMin) * PX_PER_MINUTE, 12);

  if (!el.dataset.ready) {
    // Ek baar ke static styles
    el.dataset.ready = "1";
    Object.assign(el.style, {
      left: "0px",
      top: "0px",
      fontSize: "11px",
      padding: "2px 4px",
      overflow: "hidden",
      color: "#1e3a8a",
    });
  }
  el.style.display = "block";
  el.style.width = `${colWidth - 2}px`;
  el.style.height = `${height}px`;
  // transform: layout dobara nahi banta, isliye smooth
  el.style.transform = `translate(${GUTTER_WIDTH + col * colWidth + 1}px, ${
    startMin * PX_PER_MINUTE
  }px)`;
  el.textContent = `${formatTime(draft.startUtc, tz)} – ${formatTime(draft.endUtc, tz)}`;
}

const hidePreview = (el) => {
  if (el) el.style.display = "none";
};

// ---------- Hook ----------
// Props:
//   days, tz
//   onCommit({ kind: "create" | "move" | "resize", instance?, startUtc, endUtc })
//        drag ke end par sirf EK baar chalta hai (one drag = one undo step)
//   onOpen(instance) : details kholne ka handler
export function useDragInteraction({ days, tz, onCommit, onOpen }) {
  const gridRef = useRef(null);
  const previewRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null); // sirf 2 baar badalta hai (start, end)

  // Latest props ref mein, taaki handlers stable rahein (EventBlock ka memo na tootey)
  const latest = useRef({ days, tz, onCommit, onOpen });
  useEffect(() => {
    latest.current = { days, tz, onCommit, onOpen };
  });

  const dragRef = useRef(null); // mouse/touch drag ki state, render nahi karti
  const kbRef = useRef(null); // keyboard move mode
  const rafRef = useRef(0);
  const lastDragEnd = useRef(0);
  const pendingFocus = useRef(null); // move ke baad naye block par focus

  // ---------- rAF frame: auto-scroll + preview ----------
  const frame = useCallback(() => {
    rafRef.current = 0;
    const d = dragRef.current;
    const grid = gridRef.current;
    if (!d || !d.active || !grid) return;
    const { days, tz } = latest.current;

    // Kinare par pointer ho to grid scroll karo (24 ghante ek screen mein nahi aate)
    const scroller = grid.parentElement;
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      let dy = 0;
      if (d.pointer.y < r.top + EDGE) dy = -SCROLL_SPEED;
      else if (d.pointer.y > r.bottom - EDGE) dy = SCROLL_SPEED;
      if (dy) {
        const before = scroller.scrollTop;
        scroller.scrollTop += dy;
        if (scroller.scrollTop !== before) rafRef.current = requestAnimationFrame(frame);
      }
    }

    const p = pointerToGrid(grid, days.length, d.pointer.x, d.pointer.y);
    const draft = computeMouseDraft(d, p, days, tz);
    d.draft = draft;
    paintPreview(previewRef.current, draft, p.colWidth, days, tz);
  }, []);

  const schedule = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(frame);
  }, [frame]);

  // ---------- Drag khatam: commit ya cancel ----------
  const endDrag = useCallback((commit) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    d.abort.abort(); // saare window listeners ek saath hat gaye
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    hidePreview(previewRef.current);
    document.body.style.userSelect = "";
    setDraggingId(null);

    if (!d.active) return; // threshold paar nahi hua = normal click
    lastDragEnd.current = performance.now();

    if (!commit) {
      announce("Drag cancelled");
      return;
    }

    // Final draft chhode gaye pointer se, rAF ka wait nahi (last position hi sach hai)
    const { days, tz, onCommit } = latest.current;
    const grid = gridRef.current;
    let draft = d.draft;
    if (grid) {
      const p = pointerToGrid(grid, days.length, d.pointer.x, d.pointer.y);
      draft = computeMouseDraft(d, p, days, tz);
    }
    if (!draft) return;

    if (d.mode === "create") {
      onCommit({ kind: "create", startUtc: draft.startUtc, endUtc: draft.endUtc });
      return;
    }
    // Kuch badla nahi to khaali undo step mat banao
    if (draft.startUtc === d.instance.start && draft.endUtc === d.instance.end) return;

    pendingFocus.current = d.instance.event.id;
    onCommit({
      kind: d.mode === "move" ? "move" : "resize",
      instance: d.instance,
      startUtc: draft.startUtc,
      endUtc: draft.endUtc,
    });
  }, []);

  // ---------- Drag shuru ----------
  const startDrag = useCallback(
    (e, mode, instance) => {
      const grid = gridRef.current;
      if (!grid || e.button !== 0 || dragRef.current || kbRef.current) return;
      const { days, tz } = latest.current;
      const p = pointerToGrid(grid, days.length, e.clientX, e.clientY);

      const d = {
        mode, // "create" | "move" | "resize-start" | "resize-end"
        instance: instance || null,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        pointer: { x: e.clientX, y: e.clientY },
        active: false,
        col0: p.col,
        raw0: p.minutes,
        draft: null,
        abort: new AbortController(),
      };
      if (instance) {
        d.origStart = instance.start;
        d.origEnd = instance.end;
        d.duration = instance.end - instance.start;
        d.origStartTotal = utcToWall(instance.start, tz);
      }
      dragRef.current = d;
      pendingFocus.current = null;

      const { signal } = d.abort;

      window.addEventListener(
        "pointermove",
        (ev) => {
          if (ev.pointerId !== d.pointerId) return;
          // Mouse window ke bahar chhoda gaya aur pointerup nahi aaya
          if (ev.pointerType === "mouse" && ev.buttons === 0) {
            endDrag(false);
            return;
          }
          d.pointer = { x: ev.clientX, y: ev.clientY };
          if (!d.active) {
            const moved = Math.hypot(d.pointer.x - d.startX, d.pointer.y - d.startY);
            if (moved < DRAG_THRESHOLD) return;
            d.active = true;
            document.body.style.userSelect = "none"; // drag mein text select na ho
            setDraggingId(d.instance ? d.instance.instanceId : null);
          }
          schedule(); // ek frame mein ek hi update
        },
        { signal }
      );

      window.addEventListener(
        "pointerup",
        (ev) => {
          if (ev.pointerId !== d.pointerId) return;
          d.pointer = { x: ev.clientX, y: ev.clientY };
          endDrag(true);
        },
        { signal }
      );

      window.addEventListener("pointercancel", () => endDrag(false), { signal });

      window.addEventListener(
        "keydown",
        (ev) => {
          if (ev.key === "Escape") {
            ev.preventDefault();
            endDrag(false); // Esc = cancel, kuch commit nahi
          }
        },
        { signal }
      );
    },
    [endDrag, schedule]
  );

  // Khaali slot par drag = naya event
  const onSlotPointerDown = useCallback((e) => startDrag(e, "create", null), [startDrag]);

  // Event par: move ya edge se resize
  const onEventPointerDown = useCallback(
    (e, instance, mode) => startDrag(e, mode, instance),
    [startDrag]
  );

  // Keyboard: grid cell par Enter = us slot par naya event
  const onSlotActivate = useCallback((day, minutes) => {
    const { tz, onCommit } = latest.current;
    const total = civilToDayNumber(day) * DAY_MIN + minutes;
    onCommit({
      kind: "create",
      startUtc: wallToUtc(total, tz),
      endUtc: wallToUtc(total + DEFAULT_CREATE_MINUTES, tz),
    });
  }, []);

  // ---------- Keyboard move mode (M, arrows, Enter, Esc) ----------
  const exitKeyboard = useCallback((commit) => {
    const kb = kbRef.current;
    if (!kb) return;
    kbRef.current = null;
    kb.abort.abort();
    hidePreview(previewRef.current);
    setDraggingId(null);

    if (!commit) {
      announce("Move cancelled");
      return;
    }
    if (kb.startUtc === kb.instance.start && kb.endUtc === kb.instance.end) {
      announce("Position unchanged");
      return;
    }
    pendingFocus.current = kb.instance.event.id;
    latest.current.onCommit({
      kind: "move",
      instance: kb.instance,
      startUtc: kb.startUtc,
      endUtc: kb.endUtc,
    });
  }, []);

  const paintKeyboard = useCallback((kb) => {
    const grid = gridRef.current;
    const el = previewRef.current;
    if (!grid || !el) return;
    const { days, tz } = latest.current;
    paintPreview(el, kb, colWidthOf(grid, days.length), days, tz);
    el.scrollIntoView({ block: "nearest" });
  }, []);

  const onEventKeyDown = useCallback(
    (e, instance) => {
      const { days, tz } = latest.current;
      const kb = kbRef.current;

      // Move mode shuru: event par focus ho aur M dabao
      if (!kb) {
        if (
          e.key.toLowerCase() === "m" &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          !dragRef.current
        ) {
          e.preventDefault(); // EventBlock ko batata hai ki key handle ho gayi
          pendingFocus.current = null;
          const abort = new AbortController();
          const next = {
            instance,
            startUtc: instance.start,
            endUtc: instance.end,
            abort,
          };
          kbRef.current = next;
          // Focus hatne par (Tab, click) move mode band
          e.currentTarget.addEventListener("blur", () => exitKeyboard(false), {
            signal: abort.signal,
          });
          setDraggingId(instance.instanceId);
          paintKeyboard(next);
          announce(
            `Move mode. ${instance.event.title}. Arrow keys move it, Shift with up or down moves an hour, Enter confirms, Escape cancels.`
          );
        }
        return;
      }

      if (kb.instance.instanceId !== instance.instanceId) return;

      const arrows = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };

      if (arrows[e.key]) {
        e.preventDefault();
        const [dx, dy] = arrows[e.key];
        const step = e.shiftKey ? 60 : SNAP_MINUTES;
        const firstNum = civilToDayNumber(days[0]);
        const lastNum = firstNum + days.length - 1;
        const total = clamp(
          utcToWall(kb.startUtc, tz) + dx * DAY_MIN + dy * step,
          firstNum * DAY_MIN,
          lastNum * DAY_MIN + DAY_MIN - SNAP_MINUTES
        );
        const duration = kb.instance.end - kb.instance.start;
        kb.startUtc = wallToUtc(total, tz);
        kb.endUtc = kb.startUtc + duration;
        paintKeyboard(kb);
        announce(`${formatDateTime(kb.startUtc, tz)} to ${formatTime(kb.endUtc, tz)}`);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        exitKeyboard(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        exitKeyboard(false);
      } else if (e.key === " ") {
        e.preventDefault(); // Space se details na khule
      }
    },
    [exitKeyboard, paintKeyboard]
  );

  // ---------- Drag ke turant baad wala click ignore ----------
  const guardedOpen = useCallback((instance) => {
    if (performance.now() - lastDragEnd.current < CLICK_GUARD_MS) return;
    latest.current.onOpen?.(instance);
  }, []);

  // ---------- Move ke baad focus wapas ----------
  // Move par instanceId badalti hai (start time uska hissa hai), block remount hota hai
  // aur focus chala jaata hai. Isliye render ke baad naye block ko dhundh kar focus dete hain.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    if (document.querySelector('[aria-modal="true"]')) return; // modal ka focus mat chheeno
    const active = document.activeElement;
    if (active && active !== document.body) return; // user ne khud kahin aur focus kiya
    const el = gridRef.current?.querySelector(`[data-event-id="${CSS.escape(id)}"]`);
    if (el) {
      pendingFocus.current = null;
      el.focus({ preventScroll: true });
    }
  });

  // Unmount par sab saaf
  useEffect(
    () => () => {
      dragRef.current?.abort.abort();
      kbRef.current?.abort.abort();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      document.body.style.userSelect = "";
    },
    []
  );

  return {
    gridRef,
    previewRef,
    draggingId,
    onSlotPointerDown,
    onSlotActivate,
    onEventPointerDown,
    onEventKeyDown,
    onOpen: guardedOpen,
  };
}