# Copilot Instructions for AgentLens

Purpose: Give future Copilot sessions focused, repo-specific context so suggestions and code-gen align with build/test flow, architecture, and key conventions.

---

## Build, test, and lint (commands)
- Install deps: npm install
- Run CLI in dev (no build): npm run dev  # runs tsx src/apps/cli/index.ts
- Build JS artifacts: npm run build       # tsc -> dist/
- Run all tests: npm run test             # vitest run
- Watch tests: npm run test:watch        # vitest
- Run type-check / lint: npm run lint    # tsc --noEmit
- Web dashboard (dev): npm run dashboard (CD into src/apps/web and runs web dev)

Run a single test file (examples Copilot should use):
- npx vitest tests/path/to/your.test.ts
- or: npx vitest path/to/file.test.ts --run

Run single CLI command in dev (useful for generated code):
- npx tsx src/apps/cli/index.ts report --format json

Node engine requirement: node >= 18.0.0

---

## High-level architecture (short)
- CLI & Web Dashboard → Core Engine (src/core/engine.ts)
- Core Engine orchestrates: Provider discovery/parsing → Metrics computation → Pricing & currency conversion → Optimizer (waste analysis)
- Providers implement an IProvider adapter (src/providers/) with: isAvailable(), discoverSessions(), parseSession()
- Metrics (src/core/metrics/) compute per-session, per-activity and per-model cost/token stats
- Optimizer analyzes parsed sessions and emits findings + suggested fixes
- PricingEngine & CurrencyConverter provide pricing and conversion caches used by CoreEngine
- Dataflow: CLI args → CoreEngine.run / runFull → results (metrics, findings, insights)

When generating code, target these entry points: CoreEngine.run / runFull / getQuickStats and provider registry in src/providers/index.ts.

---

## Key repo conventions and patterns (important for Copilot)
- Provider pattern: new data sources must expose IProvider methods and be registered in src/providers/index.ts.
- File-based discovery: Providers read local paths (see environment overrides in src/config/env.ts). Respect AGENTLENS_* env variables.
- Env/config: central config lives in src/config/env.ts. Use AGENTLENS_CACHE_DIR, AGENTLENS_CLAUDE_DIR, AGENTLENS_CURRENCY, AGENTLENS_PERIOD_DAYS, AGENTLENS_MAX_BASH_OUTPUT.
- TypeScript + path aliases: vitest/tsconfig define aliases (e.g. @agentlens/core). Generated imports should follow these aliases when editing src, or use relative imports when changing many files.
- Tests: located under tests/**/*.test.ts and run with Vitest (vitest config uses node environment). Use npx vitest <file> for single-file runs.
- Command-line UX: CLI lives in src/apps/cli/index.ts and prints colored TUI; JSON output flags are provided (use --format json) for machine-readable outputs.
- Metrics/Estimations: cost calculations often use tokens → USD conversion heuristics (see PricingEngine and CoreEngine); avoid changing these without running tests.
- One-shot/activity categories: AgentLens classifies into 13 activity categories (see README/CLAUDE.md). Keep generated classifiers consistent with those labels.
- Avoid adding new runtime deps without also updating package.json and tests; CI relies on tsc (type-check) and vitest.

---

## Files to consult when making changes
- src/apps/cli/index.ts — CLI entry and examples of calling CoreEngine
- src/core/engine.ts — central orchestration (run/runFull/getQuickStats)
- src/providers/ — provider implementations and registry
- src/config/env.ts — centralized env handling and defaults
- src/core/metrics/* — metric computation
- tests/ — unit/integration tests to run locally
- CLAUDE.md — additional developer guidance and architecture notes (already present in repo)

---

## Notes for Copilot sessions
- Prefer small, surgical edits. The codebase uses strict TS and tsc --noEmit for linting; ensure new code compiles.
- When adding provider support: implement IProvider, add to registry, and include tests under tests/ for parsing behavior.
- When changing cost/pricing logic, run npm run test and confirm metrics in CoreEngine still align.
- Use existing CLI flags and JSON output when creating programmatic integrations rather than adding bespoke outputs.

---

References: README.md and CLAUDE.md contain fuller examples and commands. Keep suggestions minimal and aligned with project entry points listed above.
