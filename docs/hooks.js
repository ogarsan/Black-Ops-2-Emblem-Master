// docs/hooks.js
//
// Emblem-level undo/redo wired to the live editor. Entrypoint script (no exports).
//
// Model: after each committed step we snapshot the WHOLE emblem (all 32 slots,
// positions preserved) via store.currentState(). Restore rebuilds the emblem with
// the editor's OWN load-path machinery so it comes back exactly, stays in the
// editor, and highlights the changed layer. The in-layer "U" button
// (editor.stackbackup) is separate and untouched.
//
// Capture funnels through one deduped commit(): a snapshot is taken only if the
// serialized state changed, so no-op interactions never create steps and each
// Ctrl+Z advances exactly one real change.

import { createHistory } from './history.js';
import { currentState } from './store.js';

const canvas = document.getElementById('canvas');
if (canvas) {
  const hist = createHistory();
  hist.loadFromStorage();

  let isRestoring = false;
  let lastJson = null;

  // Guard: undo/redo only act when the editor is open. While the user is on the
  // playercard screen we let native undo work in the name/clan fields.
  const editorVisible = () => {
    const el = document.getElementById('editor');
    return !!el && el.style.visibility === 'visible';
  };

  // Single source of truth for recording a commit; deduped by serialized state.
  const commit = () => {
    if (isRestoring || !window.editor) return;
    const st = currentState();
    const json = JSON.stringify(st);
    if (json === lastJson) return;
    lastJson = json;
    hist.snapshot(st);
  };
  window.__bo2Commit = commit;

  // Deterministic baseline: upstream calls the global loadedall() after all
  // images decode and after any `?load=` is applied — race-free hook, seeded once.
  let seeded = false;
  const seedBaseline = () => {
    if (seeded || !window.editor) return false;
    if (!window.editor.icons || Object.keys(window.editor.icons).length === 0) return false;
    seeded = true;
    if (hist.size() === 0) commit();                    // fresh session → baseline
    else lastJson = JSON.stringify(currentState());     // restored history → sync ref
    return true;
  };
  const origLoadedall = typeof window.loadedall === 'function' ? window.loadedall : null;
  window.loadedall = function (...args) {
    const r = origLoadedall ? origLoadedall.apply(this, args) : undefined;
    seedBaseline();
    return r;
  };
  // Try immediately + poll briefly because upstream's loadedall may already have
  // fired before this deferred module evaluated.
  if (!seedBaseline()) {
    let attempts = 0;
    const tick = () => {
      if (seedBaseline() || ++attempts > 600) return; // ~30 s upper bound
      setTimeout(tick, 50);
    };
    setTimeout(tick, 50);
  }

  // Commit on the trailing edge of interactions; dedupe drops no-ops.
  document.addEventListener('keyup', commit);
  document.addEventListener('mouseup', commit);
  document.addEventListener('change', (e) => {
    if (e.target && e.target.closest && e.target.closest('#editor')) commit();
  });
  let wheelTimer = null;
  window.addEventListener('wheel', () => {
    if (wheelTimer) clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelTimer = null; commit(); }, 250);
  }, { passive: true });

  // Faithful restore: rebuild every slot the way editor.loaddata does per layer,
  // over the full 32-slot snapshot (handling nulls). Never touches editor/
  // playercard visibility; lands in the general view; highlights the changed layer.
  window.__bo2ApplyState = (state) => {
    const ed = window.editor;
    if (!state || !ed) return;
    if (!editorVisible()) return; // guard: don't restore from the playercard screen

    const prev = currentState();
    isRestoring = true;
    try {
      const incoming = Array.isArray(state.stack) ? state.stack : [];
      for (let i = 0; i < 32; i++) {
        const snap = incoming[i] || null;
        const imgEl = document.getElementById(`layer-img-${i}`);
        const matrixEl = document.getElementById(`matrix-${i}`);
        if (!snap) {
          ed.stack[i] = null;
          if (imgEl) imgEl.src = 'img/empty.png';
          if (matrixEl) matrixEl.setAttribute('values', '1 0 0 0 0\n0 1 0 0 0\n0 0 1 0 0\n0 0 0 1 0');
          continue;
        }
        // Rebuild exactly like editor.loaddata's per-layer loop:
        ed.stack[i] = { ...snap, img: ed.icons?.[snap.name] };
        ed.stacki = i;                 // so generatestackcanvas + createfilter target slot i
        ed.generatestackcanvas?.();    // paints the layer canvas via alterstackcanvas
        ed.createfilter?.(snap.hue, snap.saturation, snap.brightness, snap.alpha); // → matrix-i
        if (imgEl && ed.stack[i].img && ed.stack[i].img.src) imgEl.src = ed.stack[i].img.src;
      }

      // Restore playercard details.
      if (state.details && window.details) {
        Object.assign(window.details, state.details);
        const nameEl = document.getElementById('playername');
        const clanEl = document.getElementById('playerclantag');
        const bgEl = document.getElementById('playercard-bg');
        if (nameEl) nameEl.innerText = state.details.playername ?? '';
        if (clanEl) clanEl.innerText = state.details.playerclantag ?? '';
        if (bgEl && state.details.playerbg != null && state.details.playerbg !== '') bgEl.src = state.details.playerbg;
      }

      // Land in the general layers view (never the playercard) + highlight the change.
      const target = changedIndex(prev, state);
      ed.changemode?.('main');
      ed.changestacki?.(target);

      ed.draw?.();
      ed.getusedlayers?.();
      // Belt-and-suspenders: never let a stale "hide editor" onload (armed by the
      // Escape-exit path) fire when updateimgs() reassigns #bigemblem.src.
      const bg = document.getElementById('bigemblem');
      if (bg) bg.onload = null;
      window.updateimgs?.();
      lastJson = JSON.stringify(state);
    } finally {
      isRestoring = false;
    }
  };

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (!editorVisible()) return; // let native undo work in the playercard name fields
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      window.__bo2ApplyState(hist.undo());
    } else if ((key === 'z' && e.shiftKey) || key === 'y') {
      e.preventDefault();
      window.__bo2ApplyState(hist.redo());
    }
  });

  // Deterministically make the previewer reflect the live stack. Called on editor
  // entry (index.html only flips visibility; it never re-renders). Never changes
  // editor/playercard visibility.
  window.__bo2RefreshView = () => {
    const ed = window.editor;
    if (!ed) return;
    const prev = document.getElementById('previews');
    if (prev) prev.style.visibility = 'inherit';
    const used = document.getElementById('usedlayers');
    if (used) used.style.display = '';
    for (let i = 0; i < 32; i++) {
      const L = ed.stack[i];
      const imgEl = document.getElementById(`layer-img-${i}`);
      if (!imgEl) continue;
      imgEl.src = (L && L.img && L.img.src) ? L.img.src : 'img/empty.png';
    }
    ed.draw?.();
    ed.getusedlayers?.();
  };

  // Entering the editor (clicking the big/small emblem on the playercard) flips
  // #editor visible via inline onclick; refresh right after so the previewer
  // matches the stack. setTimeout(0) runs after the inline handler applied it.
  ['bigemblem', 'smallemblem'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => setTimeout(() => window.__bo2RefreshView(), 0));
  });

  window.__bo2History = hist;
}

// Index of the single slot that differs between two snapshots; if zero or many
// differ, fall back to the restored state's own stacki.
function changedIndex(prevState, nextState) {
  const a = (prevState && prevState.stack) || [];
  const b = (nextState && nextState.stack) || [];
  let found = -1;
  let count = 0;
  for (let i = 0; i < 32; i++) {
    if (JSON.stringify(a[i] ?? null) !== JSON.stringify(b[i] ?? null)) { found = i; count++; }
  }
  if (count === 1) return found;
  return (nextState && typeof nextState.stacki === 'number') ? nextState.stacki : 0;
}
