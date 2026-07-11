# CLAUDE.md — Black-Ops-2-Emblem-Master

> **Lee este fichero al inicio de cualquier sesión en este proyecto.** Contiene las normas, la arquitectura, el stack y las skills relevantes.

Fork of the upstream Black Ops II emblem editor with an AI-driven tab that composes emblems via LLM tool calls. Vanilla JS, no build step, deployed on GitHub Pages.

Specs live in `/Users/garcio17/Documents/Personal/projects/docs/superpowers/specs/`. Plans live in `/Users/garcio17/Documents/Personal/projects/docs/superpowers/plans/`. **Note:** these are project-external by design — they document the architecture and roadmap but are not part of the deployed site.

---

## Stack

| Capa | Tecnología |
|---|---|
| Lenguaje | JavaScript (ESM donde nuevo, classic scripts donde upstream) |
| Tipo-check | JSDoc + `tsc --noEmit --allowJs --checkJs` |
| Gestor de paquetes | **pnpm** (nunca npm, nunca yarn). Lockfile: `pnpm-lock.yaml` |
| Test runner (unit) | Vitest 1.x + jsdom |
| Test runner (E2E) | Playwright (Chromium) |
| Validación runtime | Zod (vendored en `docs/vendor/zod.min.js`) |
| Deploy | GitHub Pages (`gh-pages`) |
| CI | GitHub Actions |

## Arquitectura y estructura del repo

```
docs/                          # static app served by GitHub Pages
├── index.html                 # upstream HTML + AI tab cell
├── history.js                 # shared undo/redo stack (NEW)
├── store.js                   # serializable snapshot (NEW)
├── hooks.js                   # wires history.js to editor (NEW)
├── dependency-inventory.md    # runtime + dev deps with versions + licenses
├── upstream-api-notes.md      # audit of editor.icons / editor.stack / DOM ids / commit-events
├── vendor/zod.min.js          # vendored zod 3.25.76 (NEW)
├── ai/                        # AI tab (NEW)
│   ├── main.js, panel.js, settings.js, context_note.js,
│   ├── conversation.js, system_prompt.js
│   ├── tools/                 # 8 tools (see §5 of spec)
│   └── adapters/              # 5 adapters (OpenAI/Groq/Gemini/Anthropic/OpenAI-compat)
├── js/                        # upstream code (UNCHANGED)
├── css/                       # upstream + ai.css
└── emblems/, backgrounds/, img/   # upstream assets
test/                          # unit + e2e + fixtures + helpers
.github/workflows/             # ci.yml, pages.yml
.github/dependabot.yml         # dependency update automation
package.json                   # pnpm, "type":"module"
vitest.config.js, playwright.config.js, .gitignore
CLAUDE.md, README.md, LICENSE
```

## Normas y convenciones

### Paquetes y comandos
- **Siempre `pnpm`** — nunca `npm` ni `yarn` directamente.
- `pnpm add <dep>` añade a `package.json` raíz (single package, no pnpm workspaces).

### Tests (TDD estricto)
- **Test que falla → implementación mínima → test que pasa → commit.**
- Unit: `test/unit/**/*.test.js` (Vitest + jsdom).
- E2E: `test/e2e/**/*.spec.js` (Playwright). Red global, sirve `docs/` en `http://localhost:8080`. Providers stub via `page.route()`.
- Antes de cerrar un plan: `pnpm test && pnpm test:e2e && pnpm typecheck` verde.

### Commits
- **Conventional Commits**: `feat:`, `feat(scope):`, `test:`, `chore:`, `fix:`, `docs:`, `refactor:`.
- Atómicos y frecuentes.
- Mensajes en imperativo, presente: `feat(ai): ...` no `feat(ai): added ...`.
- No commitear `node_modules`, `coverage/`, `playwright-report/`.

### Git y GitHub
- Repo: `Black-Ops-2-Emblem-Master` (PUBLIC, opensource).
- `main` es la rama por defecto.
- Antes de `git push`, `pnpm test && pnpm test:e2e` verdes.

## Reglas de dominio (BO2 emblem)

- **32 capas** indexadas 0-31 internamente, 1-32 en la conversación con la IA.
- **261 emblemas** en el catálogo (`type`, `tools`, `ranks`, `gear`, `emblems`); `VALID_EMBLEM_NAMES` se deriva de esto en runtime (read `editor.icons` after `loadedall()`).
- **`editor.icons` se llena asíncronamente** después de cargar 261 PNGs (función `loadedall()` en main.js). Cualquier código que lea `editor.icons[name]` antes de eso fallará — los tests deben mockear.
- **Capas vacías** (`stack[i] === null`) se omiten del snapshot que enviamos al LLM.
- **Tool calls ejecutan mutaciones reales** sobre `editor.stack` y disparan `editor.draw()`, `editor.getusedlayers()`, `updateimgs()`.
- **`rotate` está en grados**, no radianes (ver `editor.js:394`: `c.rotate * Math.PI / 180`).

## Skills y plugins — usar siempre que apliquen

| Skill | Cuándo usarla |
|---|---|
| `superpowers:using-superpowers` | Bootstrap de sesión. |
| `superpowers:brainstorming` | Antes de implementar algo nuevo. |
| `superpowers:writing-plans` | Planificar un cambio de varias tareas. |
| `superpowers:executing-plans` | Ejecutar task por task de un plan (TDD estricto). |
| `superpowers:subagent-driven-development` | Para planes grandes: subagentes en paralelo. |
| `superpowers:test-driven-development` | Reglas TDD. |
| `superpowers:systematic-debugging` | Ante un bug. |
| `superpowers:verification-before-completion` | Antes de marcar algo como hecho. |
| `superpowers:dispatching-parallel-agents` | Cuando hay tareas independientes. |
| `superpowers:using-git-worktrees` | Si aísla código y quieres revisar sin contaminar `main`. |
| `superpowers:requesting-code-review` / `receiving-code-review` | Antes de cerrar un plan. |
| `superpowers:finishing-a-development-branch` | Merge, cleanup, push final. |

`context7`: usar SIEMPRE que vayas a usar una API externa y no estés seguro de su signatura (Vitest, Zod, Playwright, GitHub Actions).

## Comandos frecuentes

```bash
pnpm install                  # install deps
pnpm test                     # unit (Vitest)
pnpm test:watch               # watch mode
pnpm test:coverage            # with coverage
pnpm test:e2e                 # Playwright (needs `pnpm dev` running in another terminal)
pnpm typecheck                # JSDoc checkJs
pnpm dev                      # serve docs/ at http://localhost:8080
pnpm deploy                   # publish to gh-pages branch
```

## Dependency policy

Runtime deps (vendored, exact-pinned) live under `docs/vendor/`. Dev deps are managed by pnpm. See `docs/dependency-inventory.md` for the full list with licenses and exact pinned versions.

Dependabot config (added at Task 40) groups dev deps, weekly, patch+minor auto-merge if CI green; majors need human review. **Runtime deps (vendored) are NOT auto-merged** — a human must regenerate the bundle and verify it still loads.

## Estado actual del proyecto (resumido)

- Phase 0 (bootstrap) en curso: Tasks 1-4 done, Task 5 en ejecución. Commit base: `c544a04`.
- Phase 1 (undo stack): pendiente.
- Phase 2 (AI tab + vertical slice): pendiente.
- Phase 3-8: pendiente.
- Detalle completo en `.superpowers/sdd/progress.md` (gitignored).