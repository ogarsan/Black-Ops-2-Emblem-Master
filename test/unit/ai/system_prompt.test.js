// test/unit/ai/system_prompt.test.js
//
// Unit tests for docs/ai/system_prompt.js — focus on catalog injection
// priority. The bug we want to prevent from regressing: editor.js nulls the
// live `var emblemdata` after loadedall(), but our system prompt must still
// see a populated catalog (sourced from window.__bo2Catalog, captured
// synchronously by js/bo2_catalog_capture.js).

import { describe, it, expect, afterEach } from 'vitest';
import { buildSystemPrompt } from '../../../docs/ai/system_prompt.js';

const FIXTURE = Object.freeze({
  type: ['Letter A', 'Letter B'],
  tools: ['Biohazard', 'Heart'],
  ranks: ['Private 1st Class'],
  gear: ['KAP-40 Qualified'],
  emblems: ['Ninja'],
});

afterEach(() => {
  // Wipe globals so tests don't leak.
  delete globalThis.__bo2Catalog;
  delete globalThis.emblemdata;
});

describe('buildSystemPrompt — catalog source priority', () => {
  it('uses caller-supplied emblemData first', () => {
    const r = buildSystemPrompt({ emblemData: FIXTURE });
    expect(r).toContain('Letter A');
    expect(r).toContain('Biohazard');
    expect(r).toContain('Ninja');
    expect(r).not.toContain('catalog not yet loaded');
  });

  it('falls back to window.__bo2Catalog when no caller data (the production path)', () => {
    globalThis.__bo2Catalog = FIXTURE;
    const r = buildSystemPrompt({});
    expect(r).toContain('Letter A');
    expect(r).toContain('Biohazard');
    expect(r).not.toContain('catalog not yet loaded');
  });

  it('survives editor.js nulling the live `emblemdata` global — the core regression test', () => {
    // Simulate the production sequence: catalog was captured, then editor.js
    // nulled the live var. The system prompt must still work.
    globalThis.__bo2Catalog = FIXTURE;
    globalThis.emblemdata = null;
    const r = buildSystemPrompt({});
    expect(r).not.toContain('catalog not yet loaded');
    expect(r).toContain('Biohazard');
    expect(r).toContain('Letter A');
  });

  it('falls back to the live globalThis.emblemdata when __bo2Catalog is absent (older deployments)', () => {
    globalThis.emblemdata = FIXTURE;
    const r = buildSystemPrompt({});
    expect(r).toContain('Letter A');
    expect(r).not.toContain('catalog not yet loaded');
  });

  it('shows the "not yet loaded" placeholder only when NO source has the catalog', () => {
    const r = buildSystemPrompt({});
    expect(r).toContain('catalog not yet loaded — wait and retry');
  });

  it('includes a Canvas section with the actual pixel-coordinate system (origin upper-left)', () => {
    globalThis.__bo2Catalog = FIXTURE;
    const r = buildSystemPrompt({});
    expect(r).toContain('## Canvas');
    // The model must see the real pixel coords, not the previous (wrong)
    // "centered at 0, x ∈ [-2, +2]" framing.
    expect(r).toMatch(/300×300/);
    expect(r).toMatch(/UPPER-LEFT/);
    expect(r).toMatch(/CENTER/);
    expect(r).toMatch(/150/); // center value
    // The bug we just fixed: assert the BAD framing is gone.
    expect(r).not.toMatch(/centered at 0/);
    expect(r).not.toMatch(/\[-2,\s*\+2\]/);
  });

  it('tightens Output style to forbid preambles and visible reasoning', () => {
    globalThis.__bo2Catalog = FIXTURE;
    const r = buildSystemPrompt({});
    // Explicit rules the model will see.
    expect(r).toMatch(/NEVER write preambles/i);
    expect(r).toMatch(/Do not list reasons/i);
    // Concrete BAD/GOOD examples that anchor the instruction.
    expect(r).toMatch(/BAD:/);
    expect(r).toMatch(/GOOD:/);
    // The failure mode we're fixing (long internal monologue in prose).
    expect(r).toMatch(/Let me think/i);
    // Hard cap on response length.
    expect(r).toMatch(/≤15 words|0 or 1 short sentences/);
  });

  it('includes a Layer order section so the model understands z-order', () => {
    globalThis.__bo2Catalog = FIXTURE;
    const r = buildSystemPrompt({});
    expect(r).toMatch(/## Layer order/);
    expect(r).toMatch(/Position 1 is the BOTTOM/);
    expect(r).toMatch(/higher positions COVER/);
  });

  it('tightens Output style with a hard 25-word cap and filler bans', () => {
    globalThis.__bo2Catalog = FIXTURE;
    const r = buildSystemPrompt({});
    // Hard cap on total visible text per turn.
    expect(r).toMatch(/25 words/);
    // Explicit bans on common filler openers.
    expect(r).toMatch(/NEVER start a reply with: Sure, Let me, I'll/);
    // Regression: the previous BAD/GOOD example stays.
    expect(r).toMatch(/BAD:/);
    expect(r).toMatch(/GOOD:/);
  });

  it('includes a Self-review section telling the model to verify size/order/color/shape', () => {
    globalThis.__bo2Catalog = FIXTURE;
    const r = buildSystemPrompt({});
    expect(r).toMatch(/## Self-review/);
    // The four review axes the model must check.
    expect(r).toMatch(/SIZE/);
    expect(r).toMatch(/ORDER/);
    expect(r).toMatch(/COLOR/);
    expect(r).toMatch(/SHAPE/);
    // Must explicitly tell the model to inspect via get_emblem_state before replying.
    expect(r).toMatch(/get_emblem_state/);
    expect(r).toMatch(/BEFORE writing your final reply/);
    expect(r).toMatch(/includeScreenshot: true/); // tells the model how to ask for the canvas image
  });

  it('includes a Design philosophy section teaching cartoon-realism + stacking', () => {
    globalThis.__bo2Catalog = FIXTURE;
    const r = buildSystemPrompt({});
    expect(r).toMatch(/## Design philosophy/);
    // Cartoon-realism + stacking guidance.
    expect(r).toMatch(/cartoon-realism/);
    expect(r).toMatch(/STACKING layers/);
    // Recommends a meaningful layer count to discourage 3-layer sparse emblems.
    expect(r).toMatch(/15/);
    // Mentions get_free_layers so the model knows the tool exists.
    expect(r).toMatch(/get_free_layers/);
  });

  it('lists get_free_layers in the ## Tools section', () => {
    globalThis.__bo2Catalog = FIXTURE;
    const r = buildSystemPrompt({});
    expect(r).toMatch(/get_free_layers/);
  });

  it('includes a "## Tool reference" section with per-tool guidance and mentions get_layer', () => {
    globalThis.__bo2Catalog = FIXTURE;
    const r = buildSystemPrompt({});
    // Section exists.
    expect(r).toMatch(/## Tool reference/);
    // Each tool mentioned with usage guidance.
    for (const tool of ['get_free_layers', 'get_layer', 'get_emblem_state', 'add_layer', 'update_layer', 'delete_layer', 'move_layer']) {
      expect(r).toMatch(new RegExp(tool));
    }
    // Specific guidance for the new get_layer tool.
    expect(r).toMatch(/get_layer\(position\)/);
    // The reference pairs get_layer with update_layer (the typical workflow).
    expect(r).toMatch(/inspect current values first/);
  });
});