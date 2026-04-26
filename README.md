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
| Claude Code | Auto-discovered on macOS, Linux, and Windows |
| Claude Desktop | Auto-discovered on macOS, Linux, and Windows |
| Codex | Auto-discovered on macOS, Linux, and Windows |
| Cursor | Auto-discovered on macOS, Linux, and Windows |
| Opencode | Auto-discovered on macOS, Linux, and Windows |
| Pi | Auto-discovered on macOS, Linux, and Windows |
| GitHub Copilot | Auto-discovered on macOS, Linux, and Windows |

AgentLens uses platform-specific local data directories under the hood, so the same CLI commands work across supported operating systems without changing flags.

## Installation

### Global (recommended)
```bash
npm install -g @rajaraghvendra/agentlens
```

This installs the `agentlens` CLI.

If `agentlens` is not found after global install, your npm global bin directory is not on `PATH`.

Check your npm global prefix:
```bash
npm prefix -g
```

If it prints `~/.npm-global`, add this to your shell profile:
```bash
export PATH="$HOME/.npm-global/bin:$PATH"
```

For `zsh` on macOS:
```bash
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Then verify:
```bash
which agentlens
agentlens --help
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
agentlens dashboard      # Start the web dashboard
agentlens tui            # Terminal UI
```

## Web Dashboard

From a global install:

```bash
agentlens dashboard
```

Then open `http://localhost:3000`.

The dashboard now runs from packaged web source plus the target machine's own installed runtime dependencies, so npm resolves the correct native binaries for Windows, Linux, or macOS at install time instead of shipping a host-built web server.

If you installed with `npm install -g`, use:
- `agentlens dashboard`
- `agentlens report`
- `agentlens status`
- `agentlens optimize`
- `agentlens compare`

The `web` command is kept as an alias for `dashboard`.

## VS Code Extension

Install from the packaged `.vsix` file attached to GitHub Releases.

## Publishing

- npm package: [`@rajaraghvendra/agentlens`](https://www.npmjs.com/package/@rajaraghvendra/agentlens)
- VS Code extension: package from [`src/apps/vscode`](/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens/src/apps/vscode) with `npm run package`
- GitHub Actions CD: [`.github/workflows/cd.yml`](/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens/.github/workflows/cd.yml) builds all artifacts, uploads the `.vsix` artifact, and can create a GitHub Release with the `.vsix` attached

## License

MIT
