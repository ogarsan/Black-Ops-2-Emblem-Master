// docs/ai/drawer.js
//
// Viewport-level slide-over drawer for the AI chat. Appended to <body> (NOT
// inside #frame) so its text is crisp and independent of the editor's scale.
// A persistent vertical "AI" handle toggles it; it starts closed.
//
// Keyboard/wheel isolation: the upstream editor binds document.onkeypress /
// onkeydown / onwheel. Without isolation, typing 'x' in the chat would clear a
// layer and scrolling the chat would zoom the emblem. We stopPropagation on
// the drawer boundary (bubble phase) so chat input still types/scrolls natively
// but events never reach document. Escape emits `bo2:abort` (to cancel a stream).

import { mountPanel } from './panel.js';

const OPEN_KEY = 'bo2_ai_drawer_open_v1';

export function mountDrawer({ settings, conversation }) {
  const root = document.createElement('div');
  root.className = 'bo2-ai-drawer';

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'bo2-ai-handle';
  handle.textContent = 'AI';
  handle.setAttribute('aria-label', 'Toggle AI chat');

  const host = document.createElement('div');
  host.className = 'bo2-ai-panelhost';

  root.append(handle, host);
  document.body.appendChild(root);

  const panel = mountPanel(host, { settings, conversation });

  let open = false;
  try { open = localStorage.getItem(OPEN_KEY) === '1'; } catch { /* ignore */ }
  const apply = () => {
    root.setAttribute('data-open', String(open));
    try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* ignore */ }
  };
  const openDrawer = () => { open = true; apply(); panel.focusInput(); };
  const closeDrawer = () => { open = false; apply(); };
  const toggle = () => (open ? closeDrawer() : openDrawer());
  handle.addEventListener('click', toggle);
  apply();

  // Bubble-phase guard on the drawer root: input still types/scrolls, but the
  // event is stopped before reaching document (editor handlers) or window
  // (hooks capture). Escape emits bo2:abort first.
  const swallow = (e) => {
    if (e.type === 'keydown' && e.key === 'Escape') {
      root.dispatchEvent(new CustomEvent('bo2:abort'));
    }
    e.stopPropagation();
  };
  root.addEventListener('keydown', swallow);
  root.addEventListener('keypress', swallow);
  root.addEventListener('keyup', swallow);
  root.addEventListener('wheel', swallow, { passive: true });

  return { root, host, panel, open: openDrawer, close: closeDrawer, toggle };
}