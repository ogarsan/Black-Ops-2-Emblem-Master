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
});