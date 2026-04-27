# AgentLens

**Local-first AI developer analytics for Claude Code, Cursor, Codex, OpenCode, Pi, and GitHub Copilot.**

AgentLens parses your local AI coding session history, computes cost and token usage, surfaces retry loops and waste patterns, and gives you CLI, TUI, web, and VS Code views over the same dataset.

[![GitHub](https://img.shields.io/badge/GitHub-rajaraghvendra%2FAgentLens-blue.svg)](https://github.com/rajaraghvendra/AgentLens)
[![npm](https://img.shields.io/badge/npm-@rajaraghvendra%2Fagentlens-orange.svg)](https://www.npmjs.com/~rajaraghvendra)

## What It Does

- **Cross-provider analytics** for Claude Code, Cursor, Codex, OpenCode, Pi, and GitHub Copilot.
- **Exact token accounting** for input, output, cache read, and cache write where provider data supports it.
- **Cost tracking** with pricing lookup, currency conversion, and provider/model breakdowns.
- **Deterministic activity classification** across coding, debugging, git ops, testing, planning, delegation, and more.
- **One-shot and retry-loop detection** to show where agents got it right first time and where they burned tokens.
- **Optimizer findings** for waste patterns such as edit loops, excessive reads, missing context, and noisy shell usage.
- **Multiple interfaces**:
  - `agentlens report`, `status`, `compare`, `optimize`
  - `agentlens tui`
  - `agentlens dashboard`
  - VS Code extension with status-bar cost visibility
- **Local-first execution**. Core parsing runs against local provider data on your machine.

## Screenshots

### Web Dashboard

![AgentLens dashboard](assets/screenshots/dashboard.svg)

### Compare View

![AgentLens compare view](assets/screenshots/compare.svg)

### Terminal UI

![AgentLens TUI](assets/screenshots/tui.svg)

## Installation

### Global Install
```bash
npm install -g @rajaraghvendra/agentlens
```

This installs the `agentlens` CLI and the packaged dashboard runtime.

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

### Run Without Installing
```bash
npx @rajaraghvendra/agentlens <command>
```

### From Source
```bash
git clone https://github.com/rajaraghvendra/AgentLens.git
cd AgentLens
npm install
npm run build
```

## Quick Start

```bash
agentlens report                 # Detailed usage report (last 7 days)
agentlens report -p today        # Today only
agentlens report --provider codex
agentlens status                 # Quick budget/cost snapshot
agentlens optimize               # Optimization findings
agentlens compare                # Model comparison
agentlens dashboard              # Web dashboard on localhost:3000
agentlens dashboard --port 3128
agentlens tui                    # Terminal UI
```

## Supported Providers

| Provider | Discovery |
|----------|-----------|
| Claude Code | Auto-discovered on macOS, Linux, and Windows |
| Claude Desktop | Auto-discovered on macOS, Linux, and Windows |
| Codex | Auto-discovered on macOS, Linux, and Windows |
| Cursor | Auto-discovered on macOS, Linux, and Windows |
| OpenCode | Auto-discovered on macOS, Linux, and Windows |
| Pi | Auto-discovered on macOS, Linux, and Windows |
| GitHub Copilot | Auto-discovered on macOS, Linux, and Windows |

AgentLens uses platform-specific local data directories internally, so the same commands work across supported operating systems without changing flags.

## Interfaces

### CLI

- `agentlens report`
- `agentlens status`
- `agentlens compare`
- `agentlens optimize`
- `agentlens providers`
- `agentlens budget:set`, `budget:status`, `budget:reset`

### TUI

```bash
agentlens tui
```

Use the keyboard shortcuts shown in the footer to switch period and provider.

### Web Dashboard

From a global install:

```bash
agentlens dashboard
```

Then open `http://localhost:3000`.

The dashboard now runs from packaged web source plus the target machine's own installed runtime dependencies, so npm resolves the correct native binaries for Windows, Linux, or macOS at install time instead of shipping a host-built web server.

The `web` command is kept as an alias for `dashboard`.

## VS Code Extension

Install from the packaged `.vsix` attached to GitHub Releases:

1. Download the latest `.vsix` from Releases.
2. Open VS Code.
3. Open Extensions.
4. Use `...` -> `Install from VSIX...`
5. Select the downloaded file.

The extension surfaces live status-bar cost tracking and can open the AgentLens dashboard.

## Publishing

- npm package: [`@rajaraghvendra/agentlens`](https://www.npmjs.com/package/@rajaraghvendra/agentlens)
- VS Code extension: package from [`src/apps/vscode`](/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens/src/apps/vscode) with `npm run package`
- GitHub Actions CD: [`.github/workflows/cd.yml`](/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens/.github/workflows/cd.yml) builds all artifacts, uploads the `.vsix` artifact, and can create a GitHub Release with the `.vsix` attached

## Development

```bash
npm install
npm run build
npm run test
npm run dashboard
```

Key project entry points:

- [CLI](/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens/src/apps/cli/index.ts)
- [TUI](/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens/src/apps/tui/index.ts)
- [Web app](/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens/src/apps/web/app/page.tsx)
- [VS Code extension](/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens/src/apps/vscode/src/extension.ts)

## License

MIT
