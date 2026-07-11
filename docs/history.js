// docs/history.js
//
// Shared undo/redo stack for the BO2 emblem editor.
// Manual edits and AI tool calls both call `history.snapshot(currentState())`.
// `window.__bo2ApplyState(history.undo() / history.redo())` restores a stripped
// snapshot back onto the live editor (see hooks.js).

export function createHistory({ limit = 200 } = {}) {
  const past = [];
  const future = [];
  const subs = new Set();

  const notify = () =>
    subs.forEach((fn) =>
      fn({ size: past.length, canUndo: past.length > 0, canRedo: future.length > 0 })
    );

  return {
    snapshot(state) {
      // Deep-clone via JSON so callers can mutate freely without poisoning history.
      past.push(JSON.parse(JSON.stringify(state)));
      if (past.length > limit) past.shift();
      future.length = 0;
      notify();
    },
    undo() {
      if (past.length === 0) return null;
      const current = past.pop();
      future.push(current);
      const prev = past[past.length - 1] ?? null;
      notify();
      return prev;
    },
    redo() {
      if (future.length === 0) return null;
      const next = future.pop();
      past.push(next);
      notify();
      return next;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    // Persistence is added in Task 7; stub here so the public surface is complete.
    loadFromStorage() {
      /* filled in by Task 7 */
    },
    clear() {
      past.length = 0;
      future.length = 0;
      notify();
    },
    size: () => past.length,
  };
}