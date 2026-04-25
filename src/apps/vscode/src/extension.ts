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

  // Immediate first fetch
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

export function activate(context: vscode.ExtensionContext): void {
  // Initialize managers
  configManager = new ConfigManager();
  agentLensClient = new AgentLensClient(configManager.get().cliPath);
  statusBarManager = new StatusBarManager();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("agentlens.openDashboard", openDashboard),
    vscode.commands.registerCommand("agentlens.showOutput", showOutput)
  );

  // Start polling
  startPolling();

  // Watch for config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("agentlens")) {
        configManager.refresh();
        startPolling();
      }
    })
  );

  // Cleanup on deactivate
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