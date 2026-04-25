# AgentLens 🔍

**Local-first AI Developer Analytics**

AgentLens parses, classifies, and tracks your AI coding sessions directly from your local disk. It supports multiple providers (Claude Code, Cursor, Codex, Pi, Opencode, GitHub Copilot), calculates exact costs, detects token-wasting patterns, and provides one-shot success rate tracking.

## Features

- 💸 **Exact Cost Tracking:** Uses live LiteLLM pricing data to accurately track input, output, and caching costs.
- 🎯 **Deterministic Activity Classification:** Categorizes session turns into 13 developer tasks (Coding, Debugging, Git Ops, Testing, etc.) without relying on expensive LLM calls.
- ⚡ **One-Shot Rate Tracking:** Measures edit success rate - see where your AI nails it first try vs burns tokens on retries.
- ♻️ **Waste Optimizer:** Detects inefficiencies like uncapped bash output, edit loops, excessive reads, and missing MCP context.
- 🔒 **Zero Egress:** No API dependency for core parsing. Your codebase and session logs never leave your machine.
- 💻 **CLI & TUI Dashboard:** Native terminal output with optional export to CSV/JSON.
- 🌐 **Web Dashboard:** Next.js dashboard with Dashboard/Optimize/Compare tabs.
- 💱 **Multi-Currency:** Display costs in USD, EUR, GBP, JPY, and 160+ currencies.
- 📊 **VS Code Extension:** Live cost tracking in status bar with budget alerts.
- 🔔 **Budget Notifications:** Per-provider and total budget tracking with alerts at 50%, 75%, 90%, 100%.

---

## Installation

### Global npm install
```bash
npm install -g agentlens
```

### Or run without installing
```bash
npx agentlens <command>
```

### From source
```bash
git clone https://github.com/anomalyco/agentlens.git
cd agentlens
npm install
npm run build
```

---

## Quick Start (CLI)

### 1. View Usage Report
```bash
agentlens report                          # Last 7 days
agentlens report -p today                 # Today only
agentlens report -p week                  # Last 7 days
agentlens report -p month                  # This month
agentlens report -p all                   # All time (up to 6 months)
agentlens report -p 30days                # Rolling 30 days
agentlens report --format json              # JSON output
```

### 2. Filter by Provider
```bash
agentlens report --provider claude           # Claude Code only
agentlens report --provider codex           # Codex only
agentlens report --provider cursor           # Cursor only
agentlens report --provider opencode        # OpenCode only
agentlens report --provider pi             # Pi only
agentlens report --provider copilot       # GitHub Copilot only
agentlens report --provider all            # All providers
```

### 3. Filter by Project
```bash
agentlens report --project myapp          # Include projects matching "myapp"
agentlens report --exclude tests         # Exclude projects matching "tests"
agentlens report --project api --project web  # Include multiple
```

### 4. Quick Status
```bash
agentlens status                        # Today + this period
agentlens status -p week
agentlens status --format json
```

### 5. Optimization Scan
```bash
agentlens optimize                    # Scan last 30 days
agentlens optimize -p today           # Scan today only
agentlens optimize -p week           # Scan last 7 days
agentlens optimize --provider claude   # Focus on one provider
agentlens optimize --format json      # JSON output with health grade
```

### 6. Model Comparison
```bash
agentlens compare                   # Compare models by cost
agentlens compare -p week          # Last 7 days
agentlens compare --format json     # JSON output
```

### 7. Export Data
```bash
agentlens export                      # CSV with today, 7 days, 30 days
agentlens export -f json             # JSON export
agentlens export -o output.csv       # Custom output path
```

### 8. List Providers
```bash
agentlens providers                  # Show all supported providers
```

### 9. Currency Setting
```bash
agentlens currency GBP               # Set to British Pounds
agentlens currency EUR             # Set to Euro
agentlens currency                # Show current setting
agentlens currency --reset        # Reset to USD
```

---

## Web Dashboard

Start the Next.js dashboard:
```bash
npm run dashboard
```

Navigate to `http://localhost:3000`

### Dashboard Tab
The main dashboard shows:
- **Total Cost** - Period spending with currency
- **Sessions** - Total sessions and average cost/session
- **Total Tokens** - Input/output tokens processed
- **Cache Efficiency** - Context cache hit rate
- **Active Providers** - Number of providers used
- **Daily Chart** - Cost over time (14-day view)
- **Projects** - Cost breakdown by project
- **Activities** - Distribution of work types
- **Models** - AI models used and costs
- **Tools** - Most used tools
- **Commands** - Most common bash commands
- **Warning Alerts** - Detected inefficiencies displayed as alert banners

![Dashboard](docs/dashboard.png)

### Optimize Tab
View optimization insights and health grade:
- **Health Grade** - Letter grade (A-F) based on inefficiencies
- **Findings** - Detailed issues with severity (High/Medium/Low)
- **Estimated Waste** - Cost of detected inefficiencies
- **Suggestions** - How to fix issues

```bash
# CLI equivalent
agentlens optimize --format json
```

![Optimize](docs/optimize.png)

### Compare Tab
Model comparison table:
- **Sessions** - Messages per model
- **Total Cost** - Spending per model
- **Cost %** - Percentage of total spend
- **Tokens** - Total tokens per model
- **Avg Cost/Session** - Efficiency metric

```bash
# CLI equivalent
agentlens compare --format json
```

![Compare](docs/compare.png)

### Filtering
Use the period switcher and provider filter at the top of the dashboard to narrow down data:
- Period: Today, 7 days, 30 days
- Provider: All, Claude, Codex, Cursor, etc.

---

## TUI (Terminal UI)

Launch the interactive TUI dashboard:
```bash
agentlens tui
```

### Navigation
- **Arrow Keys** - Navigate between views
- **Tab / Shift+Tab** - Switch panels
- **Enter** - Select/expand
- **c** - Toggle Compare view
- **o** - Toggle Optimize view
- **q** - Quit

### Views
1. **Overview** - Key metrics (cost, sessions, tokens, cache)
2. **Daily** - Cost bar chart over time
3. **Projects** - Project breakdown
4. **Activities** - Work type distribution
5. **Models** - Model usage
6. **Optimize** - Inefficiencies and health grade
7. **Compare** - Model comparison

---

## Supported Providers

| Provider | Data Location | Status |
|----------|-------------|--------|
| Claude Code | `~/.claude/projects/` | ✅ Supported |
| Claude Desktop | `~/Library/Application Support/Claude/local-agent-mode-sessions/` | ✅ Supported |
| Codex (OpenAI) | `~/.codex/sessions/` | ✅ Supported |
| Cursor | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` | ✅ Supported |
| OpenCode | `~/.local/share/opencode/` | ✅ Supported |
| Pi | `~/.pi/agent/sessions/` | ✅ Supported |
| GitHub Copilot | `~/.copilot/session-state/` | ✅ Supported |

---

## Activity Categories (13)

AgentLens classifies each session turn into one of these categories:

| Category | What Triggers It |
|----------|---------------|
| Coding | Edit, Write tools |
| Debugging | Error/fix keywords + tool usage |
| Feature Dev | "add", "create", "implement" keywords |
| Refactoring | "refactor", "rename", "simplify" |
| Testing | pytest, vitest, jest in Bash |
| Exploration | Read, Grep without edits |
| Planning | Plan, design keywords |
| Delegation | Agent tool spawns |
| Git Ops | git push/commit/merge in Bash |
| Build/Deploy | docker, kubectl, npm build |
| Brainstorming | "ideas", "what if", "design" |
| Conversation | No tools, pure text exchange |
| General | Uncategorized |

---

## What It Tracks

- **Cost:** Per session, per model, per activity, and total
- **Tokens:** Input, output, cache read, cache write
- **One-shot Rate:** Percentage of edits that succeed without retries
- **Cache Hit Rate:** Efficiency of context caching
- **Daily Breakdown:** Day-by-day cost over time
- **Models Used:** Which AI models you're spending on
- **Findings:** Inefficiencies like edit loops, uncapped output (in Optimize)
- **Health Grade:** Overall session quality score (A-F)

---

## Budgeting & Notifications

AgentLens supports budgeting and console notifications to help manage daily or monthly AI spend.

- Storage: budgets persist to <AGENTLENS_CACHE_DIR>/budget.json (default: ~/.cache/agentlens).
- Environment: set `AGENTLENS_BUDGET_USD` to provide a global USD budget cap (0 disables). Use `AGENTLENS_CURRENCY` to change the display currency (default: USD).
- CLI commands:
  - `agentlens budget:set --daily 5 --monthly 100 --currency USD` — set budgets
  - `agentlens budget:get` — show current budget values
  - `agentlens budget:reset` — reset budgets to zero
  - `agentlens budget:status [--project <name>]` — show current spend vs budget (daily & monthly)

- Automatic alerts: running `agentlens report` or `agentlens optimize` will print colorized console warnings when spend crosses thresholds (50%, 75%, 90%, 100%) in the configured currency. Alerts respect report/optimize filters (provider/project).

- TUI / Dashboard: when a budget is configured the dashboard shows a "Budget Utilization" metric and the overview includes budget fields.

- Notes: notifications are console-only today. To add external notifications (Slack, webhook, or email), implement a notifier module and call it from the budget-check locations in `src/apps/cli/index.ts` (where `getBudget()` + CoreEngine.run(...) are used). If you'd like, AgentLens can be extended to send HTTP webhook or Slack messages and to support SMTP for email alerts.
---

## Architecture

```
┌──────────────────────────────────────────┐
│             CLI / Web Dashboard / TUI       │
└───────────────────┬──────────────────────┘
                    │
┌───────────────────▼──────────────────────┐
│                 Core Engine              │
│ ┌────────────┐ ┌─────────┐ ┌───────────┐ │
│ │ Classifier│ │ Metrics │ │ Optimizer │ │
│ └────────────┘ └─────────┘ └───────────┘ │
│        [Pricing & Currency Cache]         │
└───────────────────┬──────────────────────┘
                    │
┌───────────────────▼──────────────────────┐
│          Provider Plugin Registry          │
│  (Strategy Pattern: Claude, Cursor...)    │
└───────────────────┬──────────────────────┘
                    │
┌───────────────────▼──────────────────────┐
│             Local File System             │
│    (~/.claude/, state.vscdb, etc.)       │
└──────────────────────────────────────────┘
```

---

## Development Commands

```bash
npm run dev           # Run CLI in dev mode (ts-node)
npm run build        # Compile TypeScript
npm run test          # Run tests
npm run test:watch    # Watch mode
npm run lint          # TypeScript check
npm run dashboard    # Start Next.js web dashboard
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTLENS_CACHE_DIR` | Cache directory | `~/.cache/agentlens` |
| `AGENTLENS_CLAUDE_DIR` | Claude data directory | `~/.claude` |
| `AGENTLENS_CODEX_DIR` | Codex data directory | `~/.codex` |
| `AGENTLENS_CURRENCY` | Display currency | `USD` |
| `AGENTLENS_PERIOD_DAYS` | Default period | `7` |
| `AGENTLENS_MAX_BASH_OUTPUT` | Max bash output chars | `5000` |

---

## API Endpoints

When running the web dashboard (`npm run dashboard`):

| Endpoint | Description |
|----------|-------------|
| `GET /api/report` | Full report with metrics, daily, projects, activities, models, tools, commands, findings, insights |
| `GET /api/status` | Quick stats (today + period) |
| `GET /api/providers` | Provider availability and session counts |
| `GET /api/optimize` | Optimization insights, findings, health grade |
| `GET /api/compare` | Model comparison data |

Query parameters:
- `period` - 7, 30, or number of days
- `provider` - claude, codex, cursor, etc.

---

## VS Code Extension

Install by dragging `agentlens-0.1.0.vsix` into VS Code Extensions panel or double-click the file.

### Prerequisites
The VS Code extension requires the AgentLens CLI to fetch data. You have two options:

#### Option 1: Open AgentLens Project in VS Code (Recommended)
1. Open the AgentLens project folder in VS Code (`File → Open Folder`)
2. The extension will automatically find the CLI at `dist/apps/cli/index.js`
3. Run `npm run build` if the `dist` folder doesn't exist

#### Option 2: Install CLI Globally
```bash
npm install -g agentlens
```
Then configure the path in VS Code settings:
```json
"agentlens.cliPath": "agentlens"
```

### Commands
- `agentlens.openDashboard` - Open web dashboard
- `agentlens.showOutput` - Show output channel
- `agentlens.setBudget` - Set budgets via quick pick

### Settings (settings.json)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `agentlens.pollingInterval` | number | 15 | Polling interval in seconds (5-300) |
| `agentlens.cliPath` | string | agentlens | Path to CLI binary |
| `agentlens.onClickAction` | enum | openDashboard | Action on click |
| `agentlens.dailyBudget` | number | 0 | Daily total budget in USD (0=off) |
| `agentlens.monthlyBudget` | number | 0 | Monthly total budget in USD (0=off) |
| `agentlens.notifyOnBudgetWarning` | boolean | true | Show budget notifications |
| `agentlens.claudeCodeBudget` | number | 0 | Claude Code daily budget |
| `agentlens.opencodeBudget` | number | 0 | OpenCode daily budget |
| `agentlens.codexBudget` | number | 0 | Codex daily budget |
| `agentlens.cursorBudget` | number | 0 | Cursor daily budget |
| `agentlens.copilotBudget` | number | 0 | Copilot daily budget |

### Budget Notifications
- Status bar icons: `$(flame)` (normal), `$(flame)` orange (90%), `$(error)` red (exceeded)
- Notifications at 50%, 75%, 90%, 100% thresholds
- Tooltip shows: Total cost, tokens, provider costs, budget utilization

### Packaging
```bash
cd src/apps/vscode
npm run build
npx vsce package
```

---

## Publishing to npm

### 1. Update package.json
Ensure your `package.json` has the correct details:

```json
{
  "name": "agentlens",
  "version": "0.1.0",
  "description": "Local-first AI developer analytics",
  "main": "dist/apps/cli/index.js",
  "bin": {
    "agentlens": "dist/apps/cli/index.js"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/agentlens.git"
  },
  "keywords": ["ai", "analytics", "claude", "cursor", "codex"],
  "author": "Your Name",
  "license": "MIT"
}
```

### 2. Login to npm
```bash
npm login
```

### 3. Publish
```bash
npm publish
```

### 4. Or publish with access (for scoped packages)
```bash
npm publish --access public
```

### Using a scoped package name (@your-scope/agentlens):
First update package.json:
```json
{
  "name": "@your-scope/agentlens",
  ...
}
```

Then publish:
```bash
npm publish --access public
```

---

## License

MIT