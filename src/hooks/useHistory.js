import { useEffect } from "react";
import { useCalendarActions, useCalendarState } from "../store/CalendarContext";
import {
  canRedo,
  canUndo,
  peekRedoLabel,
  peekUndoLabel,
} from "../history/history";

// Typing ke waqt browser ka apna undo chalna chahiye, calendar ka nahi
function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

// enableShortcuts: sirf ek hi component (Toolbar) me true rakhna,
// warna ek keypress par undo do baar chalega.
export function useHistory({ enableShortcuts = false } = {}) {
  const { history } = useCalendarState();
  const { undo, redo } = useCalendarActions();

  useEffect(() => {
    if (!enableShortcuts) return;

    function onKeyDown(e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;

      if (isTypingTarget(e.target)) return; // input ke andar native undo
      if (document.querySelector('[aria-modal="true"]')) return; // modal khula ho to peeche ka calendar mat badlo

      e.preventDefault();
      if (isUndo) undo();
      else redo();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enableShortcuts, undo, redo]);

  return {
    undo,
    redo,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    undoLabel: peekUndoLabel(history), // tooltip: "Move event"
    redoLabel: peekRedoLabel(history),
  };
}