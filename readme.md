# Black-Ops-2-Emblem-Master

> AI-powered emblem composer for Call of Duty: Black Ops II.

A fork of [505e06b2/Black-Ops-2-Emblem-Editor](https://github.com/505e06b2/Black-Ops-2-Emblem-Editor) that adds an **AI tab**: describe the emblem you want in natural language and watch it appear, layer by layer, in the editor.

## Features

- All original editor features (32 layers, 261 emblems, full color/transform controls).
- **AI tab**: chat with an LLM (OpenAI, Groq, Gemini, Anthropic, or any OpenAI-compatible endpoint) that calls tools to add, move, recolor and compose layers.
- **Undo / redo** for both manual edits and AI changes, persisted to `localStorage`.
- **No build step.** Plain ESM, served from `docs/`.

## Quick start

1. Clone the repo.
2. `pnpm install`
3. `pnpm dev` → open http://localhost:8080
4. Click the **AI** tab in the picker.
5. ⚙ Settings → enter your API key → save.
6. Type "make a flaming skull with crossed bones".

## Tests

```bash
pnpm test         # unit (Vitest)
pnpm test:e2e     # Playwright (needs `pnpm dev` running)
pnpm typecheck
```

## License

MIT. See [LICENSE](./LICENSE).

Original editor: © 505e06b2. Vendored libs: see [docs/dependency-inventory.md](./docs/dependency-inventory.md). Upstream API contract for the AI hooks: [docs/upstream-api-notes.md](./docs/upstream-api-notes.md).