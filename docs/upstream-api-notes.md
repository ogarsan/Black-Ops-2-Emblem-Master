# Upstream Runtime API Audit

> Audited 2026-07-11 against upstream `docs/js/*.js` + `docs/index.html` at HEAD
> `a87927b`. Every assumption the rest of the plan makes about the editor's runtime
> is verified here with file/line evidence. **If upstream changes these contracts,
> update this file and the dependent modules in the same PR.**

The intent is to close the gap between "what the plan assumes" and "what the code
actually does" *before* downstream modules (`docs/history.js`, `docs/store.js`,
`docs/hooks.js`, `docs/ai/tools/*`) build on those assumptions.

---

## 1. `window.editor` shape

The editor instance is constructed by `editorClass()` at the end of
`docs/js/editor.js`, assigned to `var editor` in `docs/js/main.js:1` inside
`window.onload`.

| Member | Type | Definition | Notes |
|---|---|---|---|
| `editor.stack` | `Array(32)` indexed 0..31 | editor.js:354 | Each entry is `null` or a layer object (see §4). |
| `editor.stacki` | number 0..31 | editor.js:355 | "Currently selected" layer index. |
| `editor.stackbackup` | object \| null | editor.js:356 | Snapshot used by `u` (undo) in layer-edit mode. |
| `editor.icons` | `{ [name]: HTMLImageElement }` | editor.js:357, populated 445-459 | **Empty until `loadedall()` fires** after all 261 images finish loading. Any code that reads `editor.icons[name]` at startup will fail. |
| `editor.mode` | `"picker" \| "main" \| "layer"` | editor.js:358 | The three top-level UI states. |
| `editor.category` | `"type" \| "emblems" \| "gear" \| "ranks" \| "tools"` | editor.js:353, 64-72 | Selected picker tab. |
| `editor.clipboard` | number \| null | editor.js:359 | Index of the copied layer, or `null`. |
| `editor.canvas` | HTMLCanvasElement | editor.js:349 | The render canvas. |
| `editor.ctx` | CanvasRenderingContext2D | editor.js:351 | Context on `editor.canvas`. |
| `editor.draw()` | function | editor.js:1-12 | Repaints `editor.canvas` from `stack`. |
| `editor.getusedlayers()` | function | editor.js:81-84 | Side effect: writes count into `#usedlayers-num`. **Call after every mutation.** |
| `editor.changetab(category)` | function | editor.js:64-72 | Switch picker tab; updates `editor.category`. |
| `editor.changemode(mode)` | function | editor.js:86-149 | Switch UI mode; wires/unwires canvas event listeners. |
| `editor.generatestackcanvas()` | function | editor.js:379-386 | Creates `canvas` + `ctx` for `stack[stacki]`. **The canonical layer-construction step.** |
| `editor.alterstackcanvas()` | function | editor.js:388-397 | Redraws the current layer's canvas with its current transform. |
| `editor.loaddata(stack)` | function | editor.js:409-430 | Replaces `editor.stack` and rebuilds layer canvases. The "load emblem from URL/text" path. |
| `editor.addstack(objname)` | function | editor.js:361-377 | Appends a new layer object to `stack[stacki]` and runs `generatestackcanvas`. |
| `editor.movelayer(index)` | function | editor.js:235-249 | Swaps `stack[stacki]` with its neighbour (`index = ±1`). |
| `editor.keyfuncs({key, override?})` | function | editor.js:251-344 | Keyboard handler. Bound at editor.js:347 (`document.onkeypress`). Also called manually from inline `onclick` handlers in `index.html`. |
| `editor.selectpreview(id)` | function | editor.js:206-214 | Click handler on a layer preview. |

## 2. Other globals on `window`

| Global | Definition | Notes |
|---|---|---|
| `window.editor` | main.js:1 (assigned inside `window.onload`) | See §1. |
| `window.details` | main.js:2 (`var details`) | `{ playername, playerclantag, playerbg }`. **Mutated by `loaddata()`** (main.js:92-94). Defaults: `"Unknown Soldier"`, `"[CLAN]"`, `""`. |
| `window.updateimgs(func?)` | main.js:55-64 | Re-blobs the canvas to `#bigemblem` and `#smallemblem`. Optional `func` runs on `#bigemblem.onload`. **Call after every mutation that should reflect in the playercard preview.** |
| `window.alterbg()` | main.js:21-32 | Prompts the user for a playercard-background URL. Sets `details.playerbg`. |
| `window.savedata()` | main.js:66-83 | Serialises `details` + `editor.stack` (stripping `img`/`canvas`/`ctx`) into `#datatext` as `pako.deflate` → `Base64.encodeURI`. |
| `window.loaddata()` | main.js:85-96 | Inverse of `savedata`; calls `editor.loaddata(stack)`. |
| `window.loadedall()` | main.js:34-52 | Fires when all 261 emblem PNGs have loaded. Also sniffs `?load=…` from URL and calls `loaddata()` if present. |

## 3. The emblem catalog

`docs/js/emblems.js:1` declares `var emblemdata = { ... }` with five top-level
arrays (one per picker tab): `type`, `tools`, `ranks`, `gear`, `emblems`. The
combined set of 261 names (editor.js:434, `neededdone = 261`) becomes the keys
of `editor.icons`.

The runtime catalog — names the AI is allowed to pass to `add_layer` — is
`Object.keys(editor.icons)` after `loadedall()`. A static enumeration of the
261 names lives in `docs/js/emblems.js`; the system prompt (Task 18) reads it
from there rather than from the icon map, so the LLM gets the canonical names.

## 4. Layer object shape (verified)

Constructed by `editor.addstack` (editor.js:361-377), reproduced by
`editor.loaddata` for every entry of the loaded stack (editor.js:418-425).

```js
{
  name: string,                 // 'Letter A', 'Skull', etc. — key in editor.icons
  img: HTMLImageElement,        // editor.icons[name]; set after image.onload
  x: 150,                       // canvas-space, pixels
  y: 150,                       // canvas-space, pixels
  rotate: 0,                    // DEGREES — applied as rotate * Math.PI / 180 (editor.js:394)
  hue: 0,                       // 0..1
  saturation: 0,                // 0..1
  brightness: 1,                // 0..1
  alpha: 1,                     // 0..1
  scalex: 1.15,
  scaley: 1.15,
  canvas: HTMLCanvasElement,    // created by generatestackcanvas; size matches editor.canvas
  ctx: CanvasRenderingContext2D // context on canvas
}
```

**Implications for downstream modules:**

- `docs/history.js` / `docs/store.js` strip `img`, `canvas`, `ctx` from each
  layer before serialising (they are not serialisable, not cloneable across
  origins, and not useful for the LLM).
- `docs/hooks.js` `rebuildLayer()` must re-attach `img` from `editor.icons[name]`
  and recreate `canvas`/`ctx` — **same as `editor.generatestackcanvas`** does
  for `stack[stacki]`. The plan's `hooks.js` does this correctly.
- `docs/ai/tools/add_layer.js` hand-rolls a canvas at line 2015-2025 of the
  plan; this is functionally equivalent to `generatestackcanvas` for the
  current `stacki`, and is the right move for AI-initiated inserts at
  *arbitrary* positions (which `addstack` does not support).

## 5. DOM id conventions (verified from `docs/index.html`)

| Element | id | Notes |
|---|---|---|
| Render canvas | `#canvas` | index.html (single occurrence) |
| Layer preview container | `#layer-N` (N = 0..31) | index.html:48. **0-indexed**, even though the human-facing label is "Layer 1..32". |
| Layer preview image | `#layer-img-N` | inside `#layer-N`. Src set to `img/empty.png` for empty slots. |
| SVG color matrix | `#matrix-N` | editor.js:411, 421. |
| Slider inputs | `#slider-hue`, `#slider-saturation`, `#slider-brightness`, `#slider-alpha` | editor.js:39-41 reads `slider-${i}`. |
| Color picker | `#colourbox` | editor.js:172. |
| Playercard | `#playercard`, `#playercard-bg`, `#playername`, `#playerclantag`, `#bigemblem`, `#smallemblem` | main.js:48-51. |
| Status | `#status`, `#usedlayers`, `#usedlayers-num` | editor.js:92, 83. |
| Emblem count | `#emblemcount` | editor.js:435. |
| Data text | `#datatext` | main.js:38, 82, 87. |
| Picker container | `#picker`, `#icons`, `#emblems`, `#ranks`, `#gear`, `#tools`, `#type` | index.html tabs row + `#icons`. |
| Header name preview | `#nametext`, `#littleicon` | editor.js:113-114. |

**Critical for E2E selectors (Tasks 33-37):** `#layer-N` is **0-indexed**, but
"Layer 1" in the UI is `#layer-0`. Spec language "position 1..32" in tool
schemas maps to `stack[position - 1]`.

## 6. Commit-event entry points (what counts as a user edit)

A "commit event" is any user action that mutates `editor.stack` in a way
that should produce a snapshot in history.js. Plan Task 9 wires canvas
`mouseup` and slider/number `change`. The full set:

| Event | Source location | Effect on stack |
|---|---|---|
| Canvas `mouseup` after drag/scale/rotate | editor.js:179-180 (release of `canvasmmove` listeners) | Drag: `x`, `y` change. Scale: `scalex`, `scaley` change. Right-drag: `rotate` change. Mode must be `"layer"` for the listeners to be wired. |
| Slider / number `change` | editor.js:17-37 (`sliderbgchange`) | `hue`, `saturation`, `brightness`, `alpha`. |
| Wheel scroll | editor.js:129-135 (`document.onwheel`) | `scalex`, `scaley` ±0.025. Mode must be `"layer"`. |
| Clear layer (`x` keypress) | editor.js:302-313 | `stack[stacki] = null`. Confirm dialog. |
| Copy (`c`) / paste (`v`) | editor.js:317-340 | Paste overwrites `stack[stacki]` with a clone of `stack[clipboard]`. |
| Move layer (`a`/`d`) | editor.js:274-279 → `movelayer(±1)` | Swaps adjacent layers. |
| Change emblem (`e`) | editor.js:314-316 → `changemode("picker")` then click icon | The icon's `onclick` (editor.js:453-456) only updates `mode`; it does **not** mutate the stack by itself. The actual emblem-change path inside picker mode is via `e.target.name` and `e.target.src` in `emblempreview` (editor.js:399-407), which mutates `stack[stacki].name/img` directly. |
| Pick icon `onclick` (empty slot) | editor.js:453-456 | For an empty layer slot, `changemode("layer")` is triggered after the user picks. The actual stack mutation happens via `addstack` (line 112) when picker is entered with `!i`. |
| `?load=…` URL | main.js:35-41 → `loaddata()` → `editor.loaddata()` | Replaces the entire stack. |
| `#datatext` change | main.js:85-96 (`loaddata()` from button) | Same as above. |
| `alterbg()` (playercard bg) | main.js:21-32 | Mutates `details.playerbg`. Does NOT touch `editor.stack`, but the spec's `currentState()` includes `details`, so history snapshots it. |

**Plan Task 9 caveat:** The plan currently wires only canvas `mouseup` and
slider/number `change`. The AI tab will not pick up commits from `x`, `c`, `v`,
`a`, `d`, `e`, wheel, URL load, or text load unless hooks.js expands its
listener surface. **Open follow-up:** expand the listener set in Task 9 (or a
post-Task-9 follow-up) to cover all rows in the table above.

## 7. What this audit fixed in the plan

| Plan assumption | Audit result | Action |
|---|---|---|
| `editor.icons[name]` for image lookup (add_layer.js, hooks.js) | ✅ Confirmed at editor.js:357, 364, 404, 422. | None — keep. |
| Layer field set is exactly `[name, x, y, rotate, hue, saturation, brightness, alpha, scalex, scaley]` | ✅ Confirmed at editor.js:362-374 (`addstack`). `canvas` and `ctx` are added by `generatestackcanvas` and stripped before serialisation. | None — `store.js` `KEPT_FIELDS` is correct. |
| `rotate` is in radians | ❌ **It is in degrees.** `editor.js:394` applies `c.rotate * Math.PI / 180`. | Plan's `add_layer.js` already treats `rotate` as a number and the modulo-360 normaliser at plan-line 2020 confirms degree semantics. **No fix needed**, but document explicitly here so future tools don't flip it. |
| Layer previews are `#layer-img-N` | ⚠️ **Both.** `#layer-N` is the container (clickable); `#layer-img-N` is the `<img>` inside. The container has `onclick="editor.selectpreview(N)"`. | E2E selectors in Tasks 33-37 should click `#layer-N` to trigger selection. |
| Layer previews are 1-indexed | ❌ **0-indexed.** `#layer-0` is the human-facing "Layer 1". | Already handled: `add_layer.js` schema uses 1-indexed `position` and converts to `idx = position - 1`. Confirm E2E specs use 1-indexed positions when speaking to the LLM but 0-indexed selectors in DOM. |
| `editor.icons` is populated synchronously on construction | ❌ **Async.** Populated by `checkdone()` after 261 images finish loading; `loadedall()` fires last. | Unit tests must `mockEditor({ icons: {...} })`; the production `add_layer` handler must reject if `ctx.icons[name]` is missing. |
| `editor.draw()` alone redraws the playercard preview | ❌ **`draw()` redraws the canvas only.** The playercard needs `updateimgs()` to reblob. | The plan already calls `window.updateimgs?.()` in both `hooks.js` `__bo2ApplyState` and the `add_layer` handler. **Good.** |
| `editor.addstack(name)` adds at a user-chosen position | ❌ **Always adds at `stack[stacki]`.** | `add_layer.js` is correct to do this manually rather than call `addstack` (which can't target a position). |

## 8. Open follow-ups (for the implementing session)

- **Expand hooks.js listener surface** to cover `x`/`c`/`v`/`a`/`d`/`e` keys,
  wheel, URL load, and text load (see §6 table). Right now Task 9 only wires
  canvas mouseup + slider change.
- **Document in CLAUDE.md** that `editor.icons` is async-populated, so any
  AI tool that needs an icon must read it lazily (Task 16 already does this).

---

## E2E coverage

> Audited 2026-07-11 (Tasks 1-5 of `fix/undo-eject-and-e2e` branch).
> All E2E specs run against a local dev server (`pnpm dev`, port 8080) via Playwright + Chromium (headless).
> Unit tests run via Vitest + jsdom.

| Feature / scenario | Unit | E2E | Manual-only | Notes |
|---|---|---|---|---|
| `updateimgs` never leaves stale `onload` | ✅ hooks.test.js | — | — | P0 fix; unit verifies the defensive clear in `__bo2ApplyState`. |
| `__bo2ApplyState` defensive `#bigemblem.onload` clear | ✅ hooks.test.js | — | — | Belt-and-suspenders alongside the main.js fix. |
| `__bo2RefreshView` repaints layer previews from live stack | ✅ hooks.test.js | — | — | Unit confirms `layer-img-3.src`, `layer-img-0.src`, and `ed.draw()` called. |
| Undo after Escape-exit + re-enter stays in editor (no eject) | — | ✅ undo_eject.spec.js | — | P0 bug scenario; uses AI-stub layer add + Ctrl+Z. |
| Re-entering editor shows saved layers in previewer | — | ✅ undo_eject.spec.js | — | P0 bug scenario; checks `#layer-img-0` non-empty after re-entry. |
| Enter / exit editor toggles visibility | — | ✅ editor_manual.spec.js | — | `#editor` visible / `#playercard` hidden. |
| Clear layer (X key) empties the selected slot | — | ✅ editor_manual.spec.js | — | Dialog auto-accepted; checks `empty.png`. |
| Move layer (D key) swaps to next slot | — | ✅ editor_manual.spec.js | — | Slot 0 → slot 1; verifies both slots. |
| Undo removes a layer add | — | ✅ editor_manual.spec.js | — | Layer added via AI stub (see substitution note below); Ctrl+Z reverts; editor stays open. |
| Save then load round-trips the emblem | — | ✅ save_load.spec.js | — | `savedata()` / `loaddata()` round-trip; slot 0 non-empty after reload. |
| Editing player name updates `window.details` | — | ✅ playercard.spec.js | — | `contenteditable` fill via keyboard. |
| Editing clan tag updates `window.details` | — | ✅ playercard.spec.js | — | Same pattern. |
| AI drawer happy path (add layer via AI) | — | ✅ ai_happy_path.spec.js | — | Pre-existing spec; stubbed OpenAI stream. |
| AI drawer abort | — | ✅ ai_abort.spec.js | — | Pre-existing spec. |
| AI tool error handling | — | ✅ ai_tool_error.spec.js | — | Pre-existing spec. |
| Drawer open/close | — | ✅ drawer.spec.js | — | Pre-existing spec. |
| New chat clears history | — | ✅ new_chat.spec.js | — | Pre-existing spec. |
| Settings panel | — | ✅ settings.spec.js | — | Pre-existing spec. |
| Undo/redo via keyboard (general) | — | ✅ undo.spec.js | — | Pre-existing spec. |
| **Add layer via native picker UI** | — | — | ✅ MANUAL-ONLY | Reason: `#emblems` icon images are inside `#picker` (initially `display:none`). Playwright geometry-checks refuse to click them in headless; the container is revealed by inline JS after `changemode("picker")` but the images remain Playwright-non-actionable. The E2E undo test uses `addLayerViaAi()` as the documented fallback. |
| **Change emblem via native picker** | — | — | ✅ MANUAL-ONLY | Same reason as above: geometry-hidden `#emblems` icons not reliably clickable in headless. |
| **Color slider undo** | — | — | ✅ MANUAL-ONLY | Reason: driving sliders via JS dispatch (`slider.dispatchEvent(new Event('change'))`) and manual stack mutation does not engage the undo history reliably — the undo system does not see the JS-forced change as a committed history entry. Native range-drag is geometry-dependent and not reliable headlessly. Attempted as P2; deleted after confirmed failure (hue value not reverted by Ctrl+Z in two runs). |
| **Canvas drag (layer position)** | — | — | ✅ MANUAL-ONLY | Reason: canvas drag relies on mouse `mousedown`/`mousemove`/`mouseup` over specific canvas pixels; the exact pixel targets depend on the rendered layer position which varies by emblem. Not reliably scriptable headlessly without visual feedback. |
| **Wheel scale (scalex/scaley via scroll)** | — | — | ✅ MANUAL-ONLY | Reason: `document.onwheel` fires on scroll over the canvas in "layer" mode. Playwright `page.mouse.wheel()` can trigger it, but the editor's wheel handler checks `editor.mode === "layer"` and the mode state must be set up correctly with focus; timing is unreliable across runs. |
| **Background URL change (`alterbg`)** | — | — | ✅ MANUAL-ONLY | Reason: uses `prompt()` dialog which Playwright can dismiss, but the background image load is async and visual confirmation requires screenshot diff. |

### Substitution note: picker-add → AI-stub in undo test

The plan (`editor_manual.spec.js`, test 4: "undo removes a layer added via the picker default flow") explicitly documents a fallback: if the native picker sequence is flaky, replace with `addLayerViaAi()`. This fallback was applied because `#emblems img` elements inside `#picker` are not Playwright-actionable in headless. The test still exercises the full undo-of-an-add path end-to-end; only the layer-creation mechanism differs. The substitution is noted inline in the spec and here so coverage is not silently dropped.