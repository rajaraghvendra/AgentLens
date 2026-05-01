# AGENTS.md

Guidance for OpenCode sessions working in this repository.

## Commands

```bash
npm run dev              # Run CLI via tsx (not ts-node)
npm run build            # tsc → dist/ (runs sync:version first)
npm run build:all       # Full build: core + web dashboard + dashboard-runtime
npm test                # Vitest run (vitest run)
npx vitest run tests/path/to/file.test.ts  # Single test file
npm run lint            # TypeScript type check (tsc --noEmit), NOT a linter
```

## Architecture

Monorepo with separate package contexts:
- **Root**: CLI (`src/apps/cli/`), core engine, providers, metrics, optimizer
- **`src/apps/web/`**: Next.js 15 dashboard (own package.json, private)
- **`src/apps/tui/`**: Terminal UI via Ink/React (own package.json, private)
- **`src/apps/vscode/`**: VS Code extension (own package.json, private)

Path aliases (root `tsconfig.json`):
- `@agentlens/core-types` → `src/core-types/`
- `@agentlens/core-engine` → `src/core-engine/`
- `@agentlens/providers` → `src/providers/public.ts`
- `@agentlens/local-runtime` → `src/local-runtime/`
- `@agentlens/core/*` → `src/core/*`
- `@agentlens/config` → `src/config/env.ts`

Web app's `tsconfig.json` points aliases to `dist/` (built output), not `src/`.

## Gotchas

- **`npm run lint` is type-checking only** — no ESLint configured at root
- **Next.js 15 has breaking changes** — web app uses undocumented APIs; read `node_modules/next/dist/docs/` before editing `src/apps/web/`
- **Version managed via `VERSION` file** — `npm run sync:version` propagates to all sub-package.json/lock files
- **Web dashboard dev**: `npm run dashboard:dev` (runs `next dev` in `src/apps/web/`)
- **TUI dev**: `npm run tui` (uses tsx directly)

## Provider Pattern

Implement `IProvider` interface (`src/providers/index.ts`):
- `isAvailable()` / `discoverSessions()` / `parseSession()`
- Register new providers in `src/providers/index.ts`