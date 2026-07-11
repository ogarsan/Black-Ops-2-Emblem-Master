// docs/ai/main.js
//
// AI tab entrypoint. Loaded as a module after hooks.js so that
// `window.__bo2History` and `window.__bo2ApplyState` are available.
//
// Side effects on import:
//   - Reads settings + persisted conversation from localStorage
//   - Mounts the chat panel inside the existing #ai container
//   - Patches window.editor.changetab so 'ai' is a valid picker category
//     (upstream never knew about us, so we co-opt its hide/show infra)

import { mountPanel } from './panel.js';
import { loadSettings } from './settings.js';
import { loadConversation } from './conversation.js';

const aiTab = document.getElementById('ai');
if (aiTab) {
  const settings = loadSettings();
  const conversation = loadConversation();
  mountPanel(aiTab, { settings, conversation });

  const origChangetab = window.editor?.changetab;
  if (typeof origChangetab === 'function') {
    window.editor.changetab = function (cat) {
      if (cat === 'ai') {
        // Re-use upstream's hide/show by pretending to switch to 'emblems',
        // then override to show the AI container instead.
        origChangetab.call(this, 'emblems');
        document.getElementById('tab-emblems')?.classList.remove('selected');
        document.getElementById('tab-emblems')?.classList.add('deselected');
        document.getElementById('emblems').style.display = 'none';
        document.getElementById('tab-ai')?.classList.add('selected');
        document.getElementById('tab-ai')?.classList.remove('deselected');
        document.getElementById('ai').style.display = '';
      } else {
        document.getElementById('tab-ai')?.classList.remove('selected');
        document.getElementById('tab-ai')?.classList.add('deselected');
        document.getElementById('ai').style.display = 'none';
        origChangetab.call(this, cat);
      }
    };
  }
}