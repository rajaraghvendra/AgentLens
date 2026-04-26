# AgentLens 🔍

**Local-first AI Developer Analytics**

AgentLens parses, classifies, and tracks your AI coding sessions directly from your local disk. It supports multiple providers (Claude Code, Cursor, Codex, Pi, Opencode, GitHub Copilot), calculates exact costs, detects token-wasting patterns, and provides one-shot success rate tracking.

[![GitHub](https://img.shields.io/badge/GitHub-rajaraghvendra%2FAgentLens-blue.svg)](https://github.com/rajaraghvendra/AgentLens)
[![npm](https://img.shields.io/badge/npm-@rajaraghvendra%2Fagentlens-orange.svg)](https://www.npmjs.com/~rajaraghvendra)

## Features

- 💸 **Exact Cost Tracking** — Uses live LiteLLM pricing data to accurately track input, output, and caching costs.
- 🎯 **Deterministic Activity Classification** — Categorizes session turns into 13 developer tasks (Coding, Debugging, Git Ops, Testing, etc.) without relying on expensive LLM calls.
- ⚡ **One-Shot Rate Tracking** — Measures edit success rate — see where your AI nails it first try vs burns tokens on retries.
- ♻️ **Waste Optimizer** — Detects inefficiencies like uncapped bash output, edit loops, excessive reads, and missing MCP context.
- 🔒 **Zero Egress** — No API dependency for core parsing. Your codebase and session logs never leave your machine.
- 💻 **CLI & TUI Dashboard** — Native terminal output with optional export to CSV/JSON.
- 🌐 **Web Dashboard** — Next.js dashboard with Dashboard/Optimize/Compare tabs.
- 💱 **Multi-Currency** — Display costs in USD, EUR, GBP, JPY, and 160+ currencies.
- 📊 **VS Code Extension** — Live cost tracking in status bar with budget alerts.
- 🔔 **Budget Notifications** — Per-provider and total budget tracking with alerts at 50%, 75%, 90%, 100%.

## Supported Providers

| Provider | Data Location |
|----------|---------------|
| Claude Code | `~/.claude/projects/` |
| Claude Desktop | `~/Library/Application Support/Claude/` |
| Codex | `~/.codex/sessions/` |
| Cursor | `~/Library/Application Support/Cursor/User/globalStorage/` |
| Opencode | `~/.local/share/opencode/` |
| Pi | `~/.pi/agent/sessions/` |
| GitHub Copilot | `~/.copilot/session-state/` |

## Installation

### Global (recommended)
```bash
npm install -g @rajaraghvendra/agentlens
```

### Or run without installing
```bash
npx @rajaraghvendra/agentlens <command>
```

### From source
```bash
git clone https://github.com/rajaraghvendra/AgentLens.git
cd AgentLens
npm install
npm run build
```

## Quick Start

```bash
agentlens report          # View usage report (last 7 days)
agentlens report -p today # Today only
agentlens status         # Quick status
agentlens optimize       # Scan inefficiencies
agentlens compare        # Compare models
agentlens tui           # Terminal UI
```

## Web Dashboard

```bash
npm run dashboard
# Open http://localhost:3000
```

## VS Code Extension

Install from [VS Code Marketplace](https://marketplace.visualstudio.com) or use the `.vsix` file from releases.

## Publishing

- npm package: [`@rajaraghvendra/agentlens`](https://www.npmjs.com/package/@rajaraghvendra/agentlens)
- VS Code extension: publish from [`src/apps/vscode`](/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens/src/apps/vscode) with `npm run publish`
- GitHub Actions CD: [`.github/workflows/cd.yml`](/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens/.github/workflows/cd.yml) builds all artifacts, uploads the `.vsix`, and optionally publishes to npmjs and the VS Code Marketplace

## License

MIT
