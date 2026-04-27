import * as vscode from "vscode";
import type { LiveSessionStatus, StatusBarState, BudgetConfig } from "../types/index";

export class StatusBarManager {
  private item: vscode.StatusBarItem;
  private lastState: StatusBarState = "loading";
  private dailyBudget: number = 0;
  private monthlyBudget: number = 0;
  private providerBudgets: Record<string, number> = {};
  private notifiedWarnings: Set<string> = new Set();
  private currentProviderCosts: Record<string, number> = {};
  private notifiedAlerts: Set<string> = new Set();

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = "agentlens.openDashboard";
    this.showLoading();
  }

  updateBudgetSettings(daily: number, monthly: number, providerBudgets: Record<string, number>): void {
    this.dailyBudget = daily;
    this.monthlyBudget = monthly;
    this.providerBudgets = providerBudgets;
  }

  update(status: LiveSessionStatus | null): void {
    if (!status) {
      this.showLoading();
      return;
    }

    // Store provider costs for per-provider budget checking
    this.currentProviderCosts = status.costsByProvider || {};

    const state = this.determineState(status);
    this.lastState = state;

    switch (state) {
      case "loading":
        this.showLoading();
        break;
      case "normal":
        this.showNormal(status);
        break;
      case "warning":
        this.showWarning(status);
        break;
      case "exceeded":
        this.showExceeded(status);
        break;
    }

    this.updateTooltip(status);
    this.checkBudgetNotifications(status);
    this.checkOptimizationNotifications(status);
  }

  private determineState(status: LiveSessionStatus): StatusBarState {
    // Check CLI's own budget exceeded flag
    if (status.isBudgetExceeded) {
      return "exceeded";
    }
    // Check local daily budget
    if (this.dailyBudget > 0 && status.totalCostLocal >= this.dailyBudget) {
      return "exceeded";
    }
    // Check warning threshold
    if (this.dailyBudget > 0 && (status.totalCostLocal / this.dailyBudget) > 0.9) {
      return "warning";
    }
    // Check per-provider budgets
    for (const [provider, cost] of Object.entries(this.currentProviderCosts)) {
      const providerBudget = this.providerBudgets[provider];
      if (providerBudget && providerBudget > 0 && cost >= providerBudget) {
        return "exceeded";
      }
    }
    for (const [provider, cost] of Object.entries(this.currentProviderCosts)) {
      const providerBudget = this.providerBudgets[provider];
      if (providerBudget && providerBudget > 0 && (cost / providerBudget) > 0.9) {
        return "warning";
      }
    }
    return "normal";
  }

  private checkBudgetNotifications(status: LiveSessionStatus): void {
    if (this.dailyBudget <= 0) return;

    const utilization = (status.totalCostLocal / this.dailyBudget) * 100;
    const thresholds = [50, 75, 90, 100];

    for (const threshold of thresholds) {
      if (utilization >= threshold && !this.notifiedWarnings.has(`daily-${threshold}`)) {
        this.notifiedWarnings.add(`daily-${threshold}`);
        
        const message = threshold >= 100 
          ? `Daily budget exceeded! $${status.totalCostLocal.toFixed(2)} / $${this.dailyBudget}`
          : `Daily budget at ${threshold}% ($${status.totalCostLocal.toFixed(2)} / $${this.dailyBudget})`;

        vscode.window.showWarningMessage(`◊ AgentLens: ${message}`);
      }
    }

    // Check per-provider budgets
    for (const [provider, cost] of Object.entries(this.currentProviderCosts)) {
      const providerBudget = this.providerBudgets[provider];
      if (!providerBudget || providerBudget <= 0) continue;

      const util = (cost / providerBudget) * 100;
      const key = `${provider}-${Math.floor(util / 25) * 25}`;
      
      if (util >= 100 && !this.notifiedWarnings.has(key)) {
        this.notifiedWarnings.add(key);
        vscode.window.showWarningMessage(
          `◊ AgentLens: ${provider} budget exceeded! $${cost.toFixed(2)} / $${providerBudget}`
        );
      }
    }
  }

  clearNotifications(): void {
    this.notifiedWarnings.clear();
    this.notifiedAlerts.clear();
  }

  private checkOptimizationNotifications(status: LiveSessionStatus): void {
    if (!status.topAlert || status.topAlert.severity !== "High") return;
    if (this.notifiedAlerts.has(status.topAlert.id)) return;
    this.notifiedAlerts.add(status.topAlert.id);
    const message = status.topAlert.recommendedAction
      ? `${status.topAlert.title}: ${status.topAlert.recommendedAction}`
      : `${status.topAlert.title}: ${status.topAlert.description}`;
    vscode.window.showWarningMessage(`◊ AgentLens: ${message}`);
  }

  private showLoading(): void {
    this.item.text = `$(sync~spin) ◊`;
    this.item.color = undefined;
    this.item.show();
  }

  private showNormal(status: LiveSessionStatus): void {
    const costStr = `${status.currencySymbol}${status.totalCostLocal.toFixed(2)}`;
    this.item.text = `$(flame) ${costStr}`;
    this.item.color = undefined;
    this.item.show();
  }

  private showWarning(status: LiveSessionStatus): void {
    const costStr = `${status.currencySymbol}${status.totalCostLocal.toFixed(2)}`;
    this.item.text = `$(flame) ${costStr}`;
    this.item.color = new vscode.ThemeColor("charts.orange");
    this.item.show();
  }

  private showExceeded(status: LiveSessionStatus): void {
    const costStr = `${status.currencySymbol}${status.totalCostLocal.toFixed(2)}`;
    this.item.text = `$(error) ${costStr}`;
    this.item.color = new vscode.ThemeColor("errorForeground");
    this.item.show();
  }

  private updateTooltip(status: LiveSessionStatus): void {
    const tokensStr = (status.totalTokens / 1000).toFixed(1) + "k";

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**◊ AgentLens**\n\n`);
    tooltip.appendMarkdown(`- Total Cost: $${status.totalCostLocal.toFixed(2)}\n`);
    tooltip.appendMarkdown(`- Tokens: ${tokensStr}\n`);
    if ((status.activeIssuesCount || 0) > 0) {
      tooltip.appendMarkdown(`- Active Issues: ${status.activeIssuesCount}\n`);
    }

    // Show per-provider costs if available
    if (status.costsByProvider && Object.keys(status.costsByProvider).length > 0) {
      tooltip.appendMarkdown(`\n**By Provider:**\n`);
      for (const [provider, cost] of Object.entries(status.costsByProvider)) {
        const budget = this.providerBudgets[provider] || 0;
        const budgetStr = budget > 0 ? ` / $${budget}` : "";
        tooltip.appendMarkdown(`- ${provider}: $${cost.toFixed(2)}${budgetStr}\n`);
      }
    }

    if (this.dailyBudget > 0) {
      const util = ((status.totalCostLocal / this.dailyBudget) * 100).toFixed(1);
      tooltip.appendMarkdown(`\n- Daily Budget: $${this.dailyBudget} (${util}%)\n`);
    }
    if (this.monthlyBudget > 0) {
      tooltip.appendMarkdown(`- Monthly Budget: $${this.monthlyBudget}`);
    }

    if (status.topAlert) {
      tooltip.appendMarkdown(`\n**Top Alert:** ${status.topAlert.title}\n`);
      tooltip.appendMarkdown(`- ${status.topAlert.description}\n`);
    }

    if (status.recommendations && status.recommendations.length > 0) {
      tooltip.appendMarkdown(`\n**Recommendations:**\n`);
      for (const recommendation of status.recommendations.slice(0, 3)) {
        tooltip.appendMarkdown(`- ${recommendation}\n`);
      }
    }

    this.item.tooltip = tooltip;
  }

  show(): void {
    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
