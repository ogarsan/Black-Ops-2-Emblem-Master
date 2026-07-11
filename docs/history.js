// docs/history.js
//
// Shared undo/redo stack for the BO2 emblem editor.
// Manual edits and AI tool calls both call `history.snapshot(currentState())`.
// `window.__bo2ApplyState(history.undo() / history.redo())` restores a stripped
// snapshot back onto the live editor (see hooks.js).

const STORAGE_KEY = 'bo2_history_v1';
const DEBOUNCE_MS = 250;
const QUOTA_TRIM_AMOUNT = 100;

export function createHistory({ limit = 200 } = {}) {
  const past = [];
  const future = [];
  const subs = new Set();
  let writeTimer = null;

  const notify = () =>
    subs.forEach((fn) =>
      fn({ size: past.length, canUndo: past.length > 0, canRedo: future.length > 0 })
    );

  const persistNow = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ past, future, limit }));
    } catch (err) {
      if (err && err.name === 'QuotaExceededError') {
        // Trim the oldest QUOTA_TRIM_AMOUNT snapshots and try once. If that also
        // throws, swallow — best-effort persistence, the in-memory stack is fine.
        past.splice(0, QUOTA_TRIM_AMOUNT);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ past, future, limit }));
        } catch {
          /* ignore */
        }
        // Notify after a trim so subscribers see the new size/canUndo.
        notify();
      }
    }
  };

  const schedulePersist = () => {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writeTimer = null;
      persistNow();
    }, DEBOUNCE_MS);
  };

  // Flush pending writes before tab close (browser fires `beforeunload` reliably).
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
        persistNow();
      }
    });
  }

  return {
    snapshot(state) {
      // Deep-clone via JSON so callers can mutate freely without poisoning history.
      past.push(JSON.parse(JSON.stringify(state)));
      if (past.length > limit) past.shift();
      future.length = 0;
      notify();
      schedulePersist();
    },
    undo() {
      if (past.length === 0) return null;
      const current = past.pop();
      future.push(current);
      const prev = past[past.length - 1] ?? null;
      notify();
      schedulePersist();
      return prev;
    },
    redo() {
      if (future.length === 0) return null;
      const next = future.pop();
      past.push(next);
      notify();
      schedulePersist();
      return next;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    loadFromStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.past)) past.push(...parsed.past);
        if (Array.isArray(parsed.future)) future.push(...parsed.future);
        notify();
      } catch {
        // Corrupt JSON: reset silently and keep going.
        past.length = 0;
        future.length = 0;
        notify();
      }
    },
    clear() {
      past.length = 0;
      future.length = 0;
      if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      notify();
    },
    flush() {
      if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
      persistNow();
    },
    size: () => past.length,
  };
}