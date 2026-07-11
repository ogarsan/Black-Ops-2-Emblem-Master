// docs/ai/context_note.js
//
// `beforeSend({ lastAiTurnSnapshot, currentSnapshot })` returns a short note
// to prepend to the system prompt when the user's manual edits since the last
// AI turn would otherwise confuse the model (e.g. they undid one of our layers
// or recoloured something by hand).
//
// Returns null when there's nothing to say.

const COMPARE_FIELDS = ['x', 'y', 'rotate', 'hue', 'saturation', 'brightness', 'alpha', 'scalex', 'scaley'];

function diff(a, b) {
  const lines = [];
  const aStack = a?.stack ?? [];
  const bStack = b?.stack ?? [];

  // We diff by *layer name* (the user-facing identity) rather than slot index
  // so reorderings + removals read naturally to the model.
  const aMap = new Map();
  for (const l of aStack) if (l) aMap.set(l.name, { layer: l, pos: aStack.indexOf(l) + 1 });
  const bMap = new Map();
  for (const l of bStack) if (l) bMap.set(l.name, { layer: l, pos: bStack.indexOf(l) + 1 });

  // Removed
  for (const [name, { pos }] of aMap) {
    if (!bMap.has(name)) lines.push(`- Layer ${pos} '${name}' was removed`);
  }
  // Added
  for (const [name, { pos }] of bMap) {
    if (!aMap.has(name)) lines.push(`+ Layer ${pos} '${name}' was added`);
  }
  // Changed (same name, both present)
  for (const [name, { layer: la, pos }] of aMap) {
    const cur = bMap.get(name);
    if (!cur) continue;
    const lb = cur.layer;
    for (const k of COMPARE_FIELDS) {
      if (la[k] !== lb[k]) {
        lines.push(`Layer ${pos} '${name}' ${k} changed from ${la[k]} → ${lb[k]}`);
      }
    }
  }
  return lines;
}

export function beforeSend({ lastAiTurnSnapshot, currentSnapshot }) {
  if (!lastAiTurnSnapshot) return null;
  const lines = diff(lastAiTurnSnapshot, currentSnapshot);
  if (lines.length === 0) return null;
  const used = (currentSnapshot?.stack ?? []).filter(Boolean).length;
  return `Note: since your last turn, the user manually edited the emblem (or reverted some of your changes). Diff vs your last snapshot:\n${lines.join('\n')}\nCurrent state has ${used} layers used.`;
}