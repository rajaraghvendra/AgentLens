import * as vscode from "vscode";
import type { StatusBarConfig, BudgetConfig } from "../types/index";

const DEFAULT_CONFIG: StatusBarConfig & BudgetConfig = {
  pollingInterval: 15,
  cliPath: "agentlens",
  onClickAction: "openDashboard",
  dailyBudget: 0,
  monthlyBudget: 0,
  notifyOnBudgetWarning: true,
  providerBudgets: {},
};

export class ConfigManager {
  private config: StatusBarConfig & BudgetConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): StatusBarConfig & BudgetConfig {
    const workspaceConfig = vscode.workspace.getConfiguration("agentlens");

    const pollingInterval = Math.max(
      5,
      Math.min(
        300,
        workspaceConfig.get<number>("pollingInterval") ?? DEFAULT_CONFIG.pollingInterval
      )
    );

    const cliPath = workspaceConfig.get<string>("cliPath") ?? DEFAULT_CONFIG.cliPath;

    let onClickAction: "openDashboard" | "showOutput" | "none" = "openDashboard";
    const storedAction = workspaceConfig.get<string>("onClickAction");
    if (storedAction === "showOutput" || storedAction === "none") {
      onClickAction = storedAction;
    }

    const dailyBudget = workspaceConfig.get<number>("dailyBudget") ?? DEFAULT_CONFIG.dailyBudget;
    const monthlyBudget = workspaceConfig.get<number>("monthlyBudget") ?? DEFAULT_CONFIG.monthlyBudget;
    const notifyOnBudgetWarning = workspaceConfig.get<boolean>("notifyOnBudgetWarning") ?? DEFAULT_CONFIG.notifyOnBudgetWarning;

    // Load per-provider budgets
    const providerBudgets: Record<string, number> = {};
    const providers = ["claudeCode", "opencode", "codex", "cursor", "copilot", "pi"];
    for (const provider of providers) {
      const budget = workspaceConfig.get<number>(`${provider}Budget`);
      if (budget && budget > 0) {
        providerBudgets[provider] = budget;
      }
    }

    return {
      pollingInterval,
      cliPath,
      onClickAction,
      dailyBudget,
      monthlyBudget,
      notifyOnBudgetWarning,
      providerBudgets,
    };
  }

  get(): StatusBarConfig & BudgetConfig {
    return this.config;
  }

  refresh(): void {
    this.config = this.loadConfig();
  }

  getPollingIntervalMs(): number {
    return this.config.pollingInterval * 1000;
  }

  getDailyBudget(): number {
    return this.config.dailyBudget;
  }

  getMonthlyBudget(): number {
    return this.config.monthlyBudget;
  }

  shouldNotifyOnWarning(): boolean {
    return this.config.notifyOnBudgetWarning;
  }

  getProviderBudget(providerId: string): number {
    return this.config.providerBudgets[providerId] || 0;
  }

  getProviderBudgets(): Record<string, number> {
    return this.config.providerBudgets;
  }
}