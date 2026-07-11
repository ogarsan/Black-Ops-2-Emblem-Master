# Dependency Inventory

> Audited 2026-07-11 against the fork at HEAD `a87927b`. Updated whenever a dependency
> is added, removed, bumped, or vendored.

## Runtime (ships to users' browsers)

The static app under `docs/` is what GitHub Pages serves. Anything loaded by
`docs/index.html` directly, or imported via `<script type="module">`, ships to the
user.

| Library | Version (pinned) | Source | License | Path / load |
|---|---|---|---|---|
| `base64.js` (dankogai/js-base64) | upstream vendored (no version tag in file) | https://github.com/dankogai/js-base64 | BSD-3-Clause | `docs/js/base64.js`, classic `<script>` tag |
| `pako` (nodeca/pako) | upstream vendored, minified | https://github.com/nodeca/pako | MIT | `docs/js/pako.min.js`, classic `<script>` tag |
| `zod` | `^3.23.0` (exact version pinned at vendor step) | pnpm → bundled by esbuild | MIT | `docs/vendor/zod.min.js`, loaded as ESM `<script type="module">` |

### Resolution for zod

After evaluating, **zod is vendored as a single-file ESM bundle** at
`docs/vendor/zod.min.js` and loaded via a relative `<script type="module">`. Pin the
exact version in this file. Rationale: keeps the app offline-capable, removes third-party
CDN trust at runtime, and avoids a build step on GitHub Pages. The vendor step itself
is part of Task 4 (`pnpm dlx esbuild` against `node_modules/zod/lib/index.mjs`).

## Dev / CI only (not shipped)

These dependencies live in `package.json` under `devDependencies` and are NOT loaded
by `docs/index.html`.

| Package | Pinned version | License | Purpose |
|---|---|---|---|
| `vitest` | `^1.6.0` | MIT | Unit test runner (jsdom environment) |
| `@vitest/coverage-v8` | `^1.6.0` | MIT | Coverage via V8 provider |
| `jsdom` | `^24.0.0` | MIT | Vitest DOM environment |
| `@playwright/test` | `^1.45.0` | Apache-2.0 | E2E browser tests (Chromium only) |
| `gh-pages` | `^6.1.0` | MIT | Deploys `docs/` to the `gh-pages` branch |
| `typescript` | `^5.5.0` | Apache-2.0 | JSDoc `checkJs` type check (`tsc --noEmit --allowJs --checkJs`) |
| `esbuild` | (transient, see Task 4) | MIT | Bundles zod into the vendor file once, then never again |

## Updates and automation

- Dependabot config is added at Task 40 (`.github/dependabot.yml`).
- Runtime vendors (`docs/vendor/`) are NOT auto-merged — a human must regenerate the
  bundle and verify it still loads.
- Dev deps: weekly, patch+minor auto-merge if CI green; majors need a human review.

## Security audit

`pnpm audit --prod` runs at the end of this task and gates Task 5 (project polish).
The 2026-07-11 run reports **"No known vulnerabilities found"** for the current lockfile.