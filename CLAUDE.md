# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AgentLens is a local-first AI developer analytics tool that parses, classifies, and tracks AI coding sessions directly from your local disk. It supports multiple providers (Claude Code, Cursor, Codex, Pi, Opencode, GitHub Copilot), calculates exact costs, detects token-wasting patterns, and provides one-shot success rate tracking.

## Development Commands

To develop in this codebase, use these npm scripts:

```bash
npm run dev           # Run CLI in dev mode (ts-node)
npm run build         # Compile TypeScript to JavaScript in dist/
npm run test          # Run all tests with Vitest
npm run test:watch    # Run tests in watch mode
npm run lint          # TypeScript compilation check
npm run dashboard     # Start Next.js web dashboard
```

## Architecture Overview

The codebase follows a modular architecture with these key components:

1. **Core Engine** (`src/core/engine.ts`): Main orchestrator that loads sessions, computes metrics, and runs analysis
2. **Providers** (`src/providers/`): Adapter pattern implementations for each AI platform (Claude, Cursor, Codex, etc.)
3. **Metrics** (`src/core/metrics/`): Computes cost, token usage, activity classification metrics
4. **Optimizer** (`src/core/optimizer/`): Detects inefficiencies and generates insights
5. **CLI Application** (`src/apps/cli/`): Command-line interface using Commander.js
6. **Configuration** (`src/config/env.ts`): Centralized configuration management

Data flows through the system as follows:
- CLI commands → Core Engine
- Core Engine → Provider discovery/parse → Session data
- Session data → Metrics computation → Aggregated statistics
- Session data + Metrics → Optimizer → Findings and insights

## Key Files and Directories

- `src/apps/cli/index.ts`: Main CLI entry point with all commands
- `src/core/engine.ts`: Core orchestration logic
- `src/providers/`: Provider implementations for each AI platform
- `src/config/env.ts`: Configuration and environment variables
- `tests/`: Unit and integration tests
- `package.json`: Dependencies and scripts

## Testing

Tests are written with Vitest and can be run with:
```bash
npm run test          # Run all tests once
npm run test:watch    # Run tests in watch mode
```

Test files follow the pattern `*.test.ts` and are organized to mirror the source structure.

## Building and Deployment

To build for production:
```bash
npm run build         # Compiles TypeScript to dist/
```

The built files are placed in the `dist/` directory and can be published to npm.

## Provider Integration Pattern

Each provider follows the `IProvider` interface with methods for:
- `isAvailable()`: Check if provider data exists locally
- `discoverSessions()`: Find session files in provider's data directory
- `parseSession()`: Parse a session file into standardized Session objects

Adding support for new providers requires implementing this interface and registering in `src/providers/index.ts`.