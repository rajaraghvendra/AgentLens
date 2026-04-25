import * as vscode from "vscode";
import { StatusBarManager } from "./managers/StatusBarManager";
import { ConfigManager } from "./managers/ConfigManager";
import { AgentLensClient } from "./services/AgentLensClient";

let statusBarManager: StatusBarManager;
let configManager: ConfigManager;
let agentLensClient: AgentLensClient;
let pollingInterval: NodeJS.Timeout | null = null;

function startPolling(): void {
  stopPolling();

  const intervalMs = configManager.getPollingIntervalMs();
  
  pollingInterval = setInterval(async () => {
    const status = await agentLensClient.getStatus();
    statusBarManager.update(status);
  }, intervalMs);

  (async () => {
    const status = await agentLensClient.getStatus();
    statusBarManager.update(status);
  })();
}

function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

function openDashboard(): void {
  vscode.env.openExternal(vscode.Uri.parse("http://localhost:3000"));
}

function showOutput(): void {
  agentLensClient.showOutput();
}

async function setBudget(): Promise<void> {
  const options: vscode.QuickPickItem[] = [
    { label: "Total Daily Budget", description: `Current: $${configManager.getDailyBudget()}` },
    { label: "Total Monthly Budget", description: `Current: $${configManager.getMonthlyBudget()}` },
    { label: "Claude Code Daily", description: `Current: $${configManager.getProviderBudget('claudeCode')}` },
    { label: "OpenCode Daily", description: `Current: $${configManager.getProviderBudget('opencode')}` },
    { label: "Codex Daily", description: `Current: $${configManager.getProviderBudget('codex')}` },
    { label: "Cursor Daily", description: `Current: $${configManager.getProviderBudget('cursor')}` },
    { label: "Copilot Daily", description: `Current: $${configManager.getProviderBudget('copilot')}` },
  ];

  const selected = await vscode.window.showQuickPick(options, {
    placeHolder: "Select budget to set",
  });

  if (!selected) return;

  const settingMap: Record<string, string> = {
    "Total Daily Budget": "dailyBudget",
    "Total Monthly Budget": "monthlyBudget",
    "Claude Code Daily": "claudeCodeBudget",
    "OpenCode Daily": "opencodeBudget",
    "Codex Daily": "codexBudget",
    "Cursor Daily": "cursorBudget",
    "Copilot Daily": "copilotBudget",
  };

  const settingKey = settingMap[selected.label];
  if (!settingKey) return;

  const currentValue = settingKey.includes("dailyBudget") || settingKey.includes("monthlyBudget")
    ? configManager.getDailyBudget()
    : configManager.getProviderBudget(settingKey.replace("Budget", ""));

  const value = await vscode.window.showInputBox({
    prompt: "Enter budget amount (USD)",
    placeHolder: "0 to disable",
    value: String(currentValue || ""),
  });

  if (value === undefined) return;

  const amount = parseFloat(value) || 0;
  const config = vscode.workspace.getConfiguration("agentlens");
  await config.update(settingKey, amount, true);

  configManager.refresh();
  statusBarManager.updateBudgetSettings(
    configManager.getDailyBudget(),
    configManager.getMonthlyBudget(),
    (configManager as any).providerBudgets || {}
  );
  statusBarManager.clearNotifications();

  vscode.window.showInformationMessage(`◊ AgentLens: ${selected.label} set to $${amount}`);
}

export function activate(context: vscode.ExtensionContext): void {
  configManager = new ConfigManager();
  agentLensClient = new AgentLensClient(configManager.get().cliPath);
  statusBarManager = new StatusBarManager();

  statusBarManager.updateBudgetSettings(
    configManager.getDailyBudget(),
    configManager.getMonthlyBudget(),
    configManager.getProviderBudgets()
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentlens.openDashboard", openDashboard),
    vscode.commands.registerCommand("agentlens.showOutput", showOutput),
    vscode.commands.registerCommand("agentlens.setBudget", setBudget)
  );

  startPolling();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("agentlens")) {
        configManager.refresh();
        statusBarManager.updateBudgetSettings(
          configManager.getDailyBudget(),
          configManager.getMonthlyBudget(),
          configManager.getProviderBudgets()
        );
        startPolling();
      }
    })
  );

  context.subscriptions.push({
    dispose: () => {
      stopPolling();
      statusBarManager.dispose();
      agentLensClient.dispose();
    },
  });
}

export function deactivate(): void {
  stopPolling();
  statusBarManager?.dispose();
  agentLensClient?.dispose();
}