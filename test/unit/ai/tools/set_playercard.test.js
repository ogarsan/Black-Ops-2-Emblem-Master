import { describe, it, expect, beforeEach } from 'vitest';
import { execTool, resetRegistry } from '../../../../docs/ai/tools/exec.js';
import { registerSetPlayercard } from '../../../../docs/ai/tools/set_playercard.js';

describe('set_playercard', () => {
  beforeEach(() => {
    resetRegistry();
    registerSetPlayercard();
    globalThis.window.details = { playername: '', playerclantag: '', playerbg: '' };
  });

  it('updates only the fields sent', async () => {
    const out = await execTool('set_playercard', { playername: 'Hero' }, { editor: {} });
    expect(out.ok).toBe(true);
    expect(window.details.playername).toBe('Hero');
    expect(window.details.playerclantag).toBe('');
  });

  it('rejects empty args (at least one field required)', async () => {
    const out = await execTool('set_playercard', {}, { editor: {} });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/at least one/i);
  });
});