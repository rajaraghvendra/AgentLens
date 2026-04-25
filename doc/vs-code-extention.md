Introduction
1.1 Purpose
This document specifies the low-level requirements for the AgentLens VS Code Extension. The extension acts as a lightweight, real-time client that interfaces with the local AgentLens CLI to display AI token cost and budget tracking directly within the developer's IDE status bar.

1.2 Scope
The extension will be integrated into the existing AgentLens monorepo under apps/vscode/. It will not perform data parsing or SQLite queries itself. Instead, it will securely execute the local AgentLens CLI, parse the JSON output, and manage the VS Code Status Bar UI.

2. Functional Requirements
2.1 Initialization & Activation
FR-1: The extension must activate automatically upon opening a VS Code workspace ("activationEvents": ["*"] or dynamically based on supported language files).

FR-2: On activation, the extension must verify the existence of the agentlens CLI tool in the user's PATH or at the path defined in agentlens.cliPath.

FR-3: If the CLI is missing, the extension must display a standard VS Code error notification: "AgentLens CLI is missing. Please run npm install -g agentlens" with an actionable button to open the terminal.

2.2 Data Fetching (Polling Mechanism)
FR-4: The extension must establish a polling loop using setInterval based on the user-configured agentlens.pollingInterval.

FR-5: The polling mechanism must execute the CLI command agentlens status --live --format json via Node's child_process.execFile to prevent shell injection.

FR-6: The extension must implement a concurrency lock (debounce/throttle) ensuring a new polling request is not spawned if the previous request is still executing.

2.3 Status Bar UI Management
FR-7: The extension must register a StatusBarItem aligned to the right side of the status bar.

FR-8: During the initial load, the status bar must display a loading state: $(sync~spin) AgentLens.

FR-9: Upon successful data retrieval, the status bar text must update to display the live daily cost, e.g., $(flame) $1.42.

FR-10: If the isBudgetExceeded flag in the CLI payload is true, the extension must apply new vscode.ThemeColor('errorForeground') to the status bar item to turn it red.

FR-11: If the budget is near exhaustion (e.g., >90% but not exceeded), the extension must apply new vscode.ThemeColor('charts.orange') or a standard warning color.

2.4 User Interactions
FR-12: Hovering over the status bar item must display a vscode.MarkdownString tooltip containing:

Total Tokens processed today.

Current active Provider.

Daily Budget Cap (if configured).

FR-13: Clicking the status bar item must execute a registered command (agentlens.openDashboard) which either opens the AgentLens Web Dashboard (http://localhost:3000) in the default browser or displays the full CLI output in a VS Code Output Channel.

3. External Interface Requirements
3.1 CLI Payload Contract (JSON)
The extension depends on strict adherence to the following JSON schema outputted by the AgentLens core via stdout.

JSON
{
  "period": "today",
  "totalCostLocal": 1.42,
  "currencySymbol": "$",
  "totalTokens": 145000,
  "budgetCapLocal": 5.00,
  "isBudgetExceeded": false,
  "budgetUtilizationPercentage": 28.4,
  "activeProviders": ["Cursor", "Claude"]
}
3.2 VS Code API Dependencies
The extension will strictly utilize the following VS Code APIs:

vscode.window.createStatusBarItem

vscode.window.showErrorMessage

vscode.workspace.getConfiguration

vscode.commands.registerCommand

4. Configuration & Settings
The extension must contribute the following settings to the VS Code settings.json via the contributes.configuration block in package.json.

Setting Key	Type	Default	Description
agentlens.pollingInterval	number	15	Polling interval in seconds to fetch live costs. Minimum allowed: 5.
agentlens.cliPath	string	agentlens	Absolute path to the AgentLens binary (useful if global npm packages aren't in the IDE's environment PATH).
agentlens.onClickAction	enum	openDashboard	Action when clicking the status bar: openDashboard, showOutput, or none.
5. Non-Functional Requirements (NFRs)
5.1 Performance
NFR-1: The execution of the CLI via the extension must not block the VS Code extension host (Main Thread).

NFR-2: CPU overhead must be negligible (< 1% utilization). The extension relies on the CLI's internal file-stat caching to prevent heavy SQLite parsing during every poll.

5.2 Security & Privacy
NFR-3: The extension must not make any outbound HTTP network requests. All data is retrieved entirely through local IPC (Inter-Process Communication) with the CLI.

NFR-4: Execution of local binaries must strictly avoid child_process.exec to prevent arbitrary command injection, utilizing execFile or spawn with explicitly defined arguments instead.

5.3 Resilience
NFR-5: If the CLI returns malformed JSON, the extension must silently catch the parse error, retain the last known state on the status bar, and log the error to a dedicated VS Code Output Channel for debugging.

6. Packaging & Deployment Requirements
PKG-1: The extension must be packaged into a .vsix file using the @vscode/vsce CLI.

PKG-2: The extension must specify "engines": { "vscode": "^1.80.0" } (or appropriate recent version) in its manifest.

PKG-3: The codebase must utilize npm workspaces, importing strictly typed interfaces from the @agentlens/core workspace to ensure schema parity between the CLI and the IDE extension.


Architecture Overview
The VS Code extension will run a lightweight polling loop (or file watcher) that interfaces with the globally installed AgentLens CLI.

Core Strategy: The extension executes a highly optimized, headless command (e.g., agentlens status --live --format json) at a set interval. It parses the JSON payload and updates the VS Code Status Bar Item. If the cost exceeds the daily budget (read from the same JSON payload or local cache), the extension updates the status bar's color and icon.

2. Directory Structure (VS Code Extension)
Plaintext
agentlens-vscode/
├── package.json               # Extension manifest, commands, configuration
├── src/
│   ├── extension.ts           # Activation entry point
│   ├── managers/
│   │   ├── StatusBarManager.ts # UI logic for the status bar
│   │   └── ConfigManager.ts    # Reads user settings (interval, custom path)
│   ├── services/
│   │   └── AgentLensClient.ts  # Executes CLI commands, handles parsing & errors
│   └── types/
│       └── index.ts           # TypeScript interfaces for the JSON payload
3. Component Design
A. Data Models (types/index.ts)
The extension needs a strict contract for what it expects from the AgentLens CLI.

TypeScript
export interface LiveSessionStatus {
  period: "today";
  totalCostUSD: number;
  totalTokens: number;
  budgetCapUSD: number | null; 
  isBudgetExceeded: boolean;
  activeProvider: string; // e.g., "Cursor", "Claude"
}
B. AgentLens Client (services/AgentLensClient.ts)
Responsible for spawning the child process to call the CLI.

Execution: Uses child_process.execFile for safer execution (avoids shell injection).

Caching: Implements a localized debounce/throttle to ensure the extension never spawns a new CLI process if the previous one is still running.

Error Handling: Silently catches "command not found" errors and prompts the user to install AgentLens globally if missing.

C. Status Bar Manager (managers/StatusBarManager.ts)
Manages the VS Code StatusBarItem API.

States:

Loading: $(sync~spin) AgentLens

Normal: $(flame) $1.42 (Default text color)

Warning (Near Budget): $(flame) $4.50 (Yellow/Orange text)

Exceeded: $(alert) $5.50 (Red errorForeground color)

Tooltip: Hovering over the status bar item should reveal a richer breakdown (e.g., "Tokens: 145k | Provider: Cursor").

Action: Clicking the status bar item triggers the agentlens.openDashboard command, launching the web dashboard or showing a summary in a VS Code output channel.

D. Config Manager (managers/ConfigManager.ts)
Reads settings defined in package.json under the agentlens namespace.

agentlens.pollingInterval: Defaults to 15 (seconds).

agentlens.cliPath: Allows users to specify an exact binary path if npx or global agentlens isn't in their IDE's PATH environment.

4. Execution Flow
Activation event: The extension activates on * (startup) or when a supported workspace (Node, Python, etc.) is opened.

Initialization: extension.ts initializes the StatusBarManager and AgentLensClient.

Polling Loop:

setInterval fires every X seconds.

AgentLensClient executes agentlens status --live --format json.

The CLI quickly reads the local logs, calculates the delta, checks the budget cache, and returns the JSON.

UI Update: * If isBudgetExceeded is true, the StatusBarManager applies new vscode.ThemeColor('errorForeground') to the item.

Updates the text to $(flame) $XX.XX.

5. Required Changes to AgentLens Core (Bridge)
To make this seamless, the core CLI needs a dedicated "fast path" command specifically designed for IDE polling.

Feature Addition to Core: Add agentlens status --live

Optimization: Instead of scanning all 30 days of data, --live should only scan the files modified today.

Performance Target: Execution time must be < 200ms to prevent CPU spiking during IDE polling.

Output: strictly standard output JSON matching the LiveSessionStatus interface.

6. Performance & Security Considerations
CPU Overhead: Repeatedly parsing SQLite databases (like Cursor's state.vscdb) every 10 seconds can spin up user laptop fans. The AgentLens core must utilize file-stat checking (checking mtime of the database) and immediately return the cached cost if the file hasn't changed since the last poll.

PATH Issues: VS Code extensions often launch in environments where NVM (Node Version Manager) or custom PATHs aren't fully loaded. The extension must gracefully handle ENOENT (file not found) and provide a settings UI for the user to paste their exact agentlens binary path.
1. Codebase Structure (The Monorepo Approach)
You will add the extension as a new "app" alongside your existing ones. By using npm workspaces, the extension can directly import TypeScript interfaces from your core engine, ensuring your data models are always perfectly in sync.

Plaintext
agentlens/
├── package.json               # Root package (defines workspaces)
├── core/                      # Core logic, types, and interfaces
│   ├── package.json           # Name: @agentlens/core
│   └── src/types/index.ts     # Shared JSON payload interfaces
├── apps/
│   ├── cli/                   # Name: agentlens
│   ├── web/                   # Name: @agentlens/web
│   ├── tui/                   # Name: @agentlens/tui
│   └── vscode/                # Name: agentlens-vscode (NEW!)
│       ├── package.json       # Extension manifest
│       └── src/extension.ts   # Imports LiveSessionStatus from @agentlens/core
To enable this natively in npm, just add this to your root package.json:

JSON
{
  "name": "agentlens-monorepo",
  "private": true,
  "workspaces": [
    "core",
    "apps/*"
  ]
}
2. How to Release the VS Code Extension
Releasing a VS Code extension requires a different pipeline than publishing an npm package. Microsoft manages the VS Code extension marketplace via Azure DevOps.

Step A: Prerequisites & Account Setup
Install the official VS Code Extension CLI globally:

Bash
npm install -g @vscode/vsce
Create a Publisher account:

Go to the Visual Studio Marketplace publisher management page.

Log in with a Microsoft account and create a publisher name (e.g., anomalyco).

Generate a Personal Access Token (PAT) in Azure DevOps (vsce needs this to publish on your behalf).

Step B: Configure the Extension's package.json
Inside apps/vscode/package.json, you need specific VS Code metadata:

JSON
{
  "name": "agentlens",
  "displayName": "AgentLens: AI Cost Tracker",
  "description": "Live AI token and cost tracking in your status bar.",
  "version": "0.1.0",
  "publisher": "anomalyco",
  "engines": {
    "vscode": "^1.80.0"
  },
  "icon": "assets/icon.png",
  "scripts": {
    "vscode:prepublish": "npm run build"
  }
}
Step C: Local Testing (The .vsix file)
Before publishing to the world, you can package the extension into a single executable file to test locally.

Bash
cd apps/vscode
vsce package
This generates a file like agentlens-0.1.0.vsix. You can drag and drop this file directly into your VS Code Extensions panel to install and test it.

Step D: Publishing to the Marketplace
Once you are happy with the local test, log in via the CLI and publish:

Bash
# Login (it will prompt for your PAT)
vsce login anomalyco

# Publish to the live marketplace
vsce publish
3. Unified Release Strategy (The CI/CD Flow)
Because the extension depends on the CLI, you must ensure the user has the CLI installed. Your release flow should look like this:

Code Changes: You update the CLI and the extension in the same branch.

Publish CLI First: Run npm publish in apps/cli so the newest version of agentlens is live on the npm registry.

Publish Extension Second: Run vsce publish in apps/vscode.

Note for the extension logic: Since the extension is just a UI layer, you should add a check on startup. If the extension tries to run agentlens status --live and fails, it should show a VS Code notification: "AgentLens CLI is missing or outdated. Please run npm install -g agentlens@latest."
