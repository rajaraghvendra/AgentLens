# AgentLens Documentation

Detailed documentation for all AgentLens features, commands, and configurations.

---

## CLI Commands

### report — View Usage Report
```bash
agentlens report                          # Last 7 days
agentlens report -p today                 # Today only
agentlens report -p week                  # Last 7 days
agentlens report -p month                 # This month
agentlens report -p all                   # All time (up to 6 months)
agentlens report -p 30days                # Rolling 30 days
agentlens report --format json            # JSON output
agentlens report --provider claude         # Filter by provider
agentlens report --project myapp          # Filter by project
agentlens report --exclude tests           # Exclude project
```

### status — Quick Status
```bash
agentlens status                        # Today + this period
agentlens status -p week
agentlens status --format json
```

### optimize — Optimization Scan
```bash
agentlens optimize                    # Scan last 30 days
agentlens optimize -p today           # Scan today only
agentlens optimize -p week            # Scan last 7 days
agentlens optimize --provider claude # Focus on one provider
agentlens optimize --format json     # JSON output with health grade
```

### compare — Model Comparison
```bash
agentlens compare                   # Compare models by cost
agentlens compare -p week         # Last 7 days
agentlens compare --format json    # JSON output
```

### export — Export Data
```bash
agentlens export                     # CSV with today, 7 days, 30 days
agentlens export -f json            # JSON export
agentlens export -o output.csv      # Custom output path
```

### providers — List Providers
```bash
agentlens providers                # Show all supported providers
```

### currency — Currency Setting
```bash
agentlens currency GBP              # Set to British Pounds
agentlens currency EUR          # Set to Euro
agentlens currency              # Show current setting
agentlens currency --reset      # Reset to USD
```

### budget — Budget Commands
```bash
agentlens budget:set --daily 5 --monthly 100  # Set budgets
agentlens budget:get                     # Show budgets
agentlens budget:reset                   # Reset budgets
agentlens budget:status                # Show vs budget
```

### tui — Terminal UI
```bash
agentlens tui                       # Open interactive dashboard
```

---

## Activity Categories (13)

AgentLens classifies each session turn into one of these categories:

| Category | What Triggers It |
|---------|---------------|
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

- Storage: budgets persist to `<AGENTLENS_CACHE_DIR>/budget.json` (default: `~/.cache/agentlens`).
- Environment: set `AGENTLENS_BUDGET_USD` to provide a global USD budget cap (0 disables). Use `AGENTLENS_CURRENCY` to change the display currency (default: USD).
- CLI commands:
  - `agentlens budget:set --daily 5 --monthly 100 --currency USD` — set budgets
  - `agentlens budget:get` — show current budget values
  - `agentlens budget:reset` — reset budgets to zero
  - `agentlens budget:status [--project <name>]` — show current spend vs budget (daily & monthly)

- Automatic alerts: running `agentlens report` or `agentlens optimize` will print colorized console warnings when spend crosses thresholds (50%, 75%, 90%, 100%) in the configured currency. Alerts respect report/optimize filters (provider/project).

- TUI / Dashboard: when a budget is configured the dashboard shows a "Budget Utilization" metric and the overview includes budget fields.

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
│  (Strategy Pattern: Claude, Cursor...)     │
└───────────────────┬──────────────────────┘
                    │
┌───────────────────▼──────────────────────┐
│             Local File System                 │
│    (~/.claude/, state.vscdb, etc.)         │
└──────────────────────────────────────────┘
```

---

## Development Commands

```bash
npm run dev           # Run CLI in dev mode (tsx)
npm run build         # Compile TypeScript
npm run build:all     # Build CLI + Web
npm run test         # Run tests
npm run test:watch   # Watch mode
npm run lint        # TypeScript check
npm run dashboard   # Start Next.js web dashboard
```

---

## Web Dashboard API Endpoints

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

### Installation
Install by dragging `agentlens-0.1.0.vsix` into VS Code Extensions panel or double-click the file.

### Prerequisites
The VS Code extension requires the AgentLens CLI to fetch data. You have two options:

#### Option 1: Open AgentLens Project in VS Code (Recommended)
1. Open the AgentLens project folder in VS Code (`File → Open Folder`)
2. The extension will automatically find the CLI at `dist/apps/cli/index.js`
3. Run `npm run build` if the `dist` folder doesn't exist

#### Option 2: Install CLI Globally
```bash
npm install -g @rajaraghvendra/agentlens
```

If `agentlens` is not found after install, add your npm global bin directory to `PATH`.

Check the prefix:
```bash
npm prefix -g
```

If it resolves to `~/.npm-global`, add:
```bash
export PATH="$HOME/.npm-global/bin:$PATH"
```

For `zsh`:
```bash
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Verify:
```bash
which agentlens
agentlens --help
```

Then configure the path in VS Code settings:
```json
"agentlens.cliPath": "agentlens"
```

### Commands
- `agentlens.openDashboard` - Open web dashboard
- `agentlens.showOutput` - Show output channel
- `agentlens.setBudget` - Set budgets via quick pick

The extension now resolves the CLI in this order:
1. `agentlens.cliPath` if configured
2. the current workspace build at `dist/apps/cli/index.js`
3. `agentlens` from `PATH`

### Settings (settings.json)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `agentlens.pollingInterval` | number | 15 | Polling interval in seconds (5-300) |
| `agentlens.cliPath` | string | agentlens | Path to CLI binary |
| `agentlens.onClickAction` | enum | openDashboard | Action on click |
| `agentlens.dailyBudget` | number | 0 | Daily total budget in USD (0=off) |
| `agentlens.monthlyBudget` | number | 0 | Monthly total budget in USD (0=off) |
| `agentlens.notifyOnBudgetWarning` | boolean | true | Show notification when budget threshold reached |
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
npm run package
```

---

## TUI (Terminal UI)

Launch the interactive TUI dashboard:
```bash
agentlens tui
```

The packaged npm install now runs the compiled TUI entrypoint directly instead of depending on `tsx` or a source checkout.

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

## CI/CD

### GitHub Actions

| Workflow | Trigger | Description |
|----------|---------|-------------|
| **CI** | Push to `main` / PR | Runs build, test, lint automatically |
| **CD** | Manual dispatch | Builds CLI, web, and VS Code extension, uploads `.vsix`, and optionally publishes npm / creates a GitHub Release with the `.vsix` attached |

### Running CD Manually

1. Go to [Actions → CD (Manual)](https://github.com/rajaraghvendra/AgentLens/actions/workflows/cd.yml)
2. Click **Run workflow**
3. Select options:
   - `publish_npm`: Publish `@rajaraghvendra/agentlens` to [npmjs.com](https://www.npmjs.com/package/@rajaraghvendra/agentlens)
   - `publish_vsix_release`: Create a GitHub Release and attach the packaged `.vsix`
4. Click **Run workflow**

If both publish toggles are left unchecked, the workflow still builds everything and uploads the packaged `.vsix` as a workflow artifact.

### Required GitHub Secrets

- `NPM_TOKEN`: npm automation token with publish access to `@rajaraghvendra/agentlens`

### Running CI Locally
```bash
# Build
npm run build
npm run build:all

# Test
npm run test
npm run lint
```

---

## Publishing

### Update package.json
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
    "url": "https://github.com/rajaraghvendra/AgentLens.git"
  },
  "keywords": ["ai", "analytics", "claude", "cursor", "codex"],
  "author": "Your Name",
  "license": "MIT"
}
```

### Publish to npm
```bash
npm login
npm publish
```

Published package:
- [`@rajaraghvendra/agentlens` on npmjs.com](https://www.npmjs.com/package/@rajaraghvendra/agentlens)

Note:
- npm provenance via `npm publish --provenance` only works from public GitHub repositories
- if this repository is private, publish without `--provenance`

### Package VS Code Extension
```bash
cd src/apps/vscode
npm run package
```

The packaged file will be created as:
- `src/apps/vscode/agentlens-<version>.vsix`

### Release VSIX on GitHub

Use the `CD (Manual)` workflow and enable:
- `publish_vsix_release = true`

That workflow will create a GitHub Release and attach the packaged `.vsix`.

### Install in VS Code

1. Download the `.vsix` file from the GitHub Release
2. Open VS Code
3. Open the Extensions view
4. Click the `...` menu in the top-right of the Extensions panel
5. Choose `Install from VSIX...`
6. Select the downloaded `.vsix`

---

## Screenshots

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

### Optimize Tab
View optimization insights and health grade:
- **Health Grade** - Letter grade (A-F) based on inefficiencies
- **Findings** - Detailed issues with severity (High/Medium/Low)
- **Estimated Waste** - Cost of detected inefficiencies
- **Suggestions** - How to fix issues

### Compare Tab
Model comparison table:
- **Sessions** - Messages per model
- **Total Cost** - Spending per model
- **Cost %** - Percentage of total spend
- **Tokens** - Total tokens per model
- **Avg Cost/Session** - Efficiency metric

---

## License

MIT
