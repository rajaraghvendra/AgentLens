import * as vscode from "vscode";
import type { LiveSessionStatus, StatusBarState } from "../types/index";

export class StatusBarManager {
  private item: vscode.StatusBarItem;
  private lastState: StatusBarState = "loading";

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = "agentlens.openDashboard";
    this.showLoading();
  }

  update(status: LiveSessionStatus | null): void {
    if (!status) {
      this.showLoading();
      return;
    }

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
  }

  private determineState(status: LiveSessionStatus): StatusBarState {
    if (status.isBudgetExceeded) {
      return "exceeded";
    }
    if (status.budgetUtilizationPercentage > 90) {
      return "warning";
    }
    return "normal";
  }

  private showLoading(): void {
    this.item.text = `$(sync~spin) AgentLens`;
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
    const budgetStr = status.budgetCapLocal
      ? `${status.currencySymbol}${status.budgetCapLocal.toFixed(2)}`
      : "No budget";
    const providerStr = status.activeProviders.join(", ") || "None";

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**AgentLens**\n\n`);
    tooltip.appendMarkdown(`- Tokens: ${tokensStr}\n`);
    tooltip.appendMarkdown(`- Provider: ${providerStr}\n`);
    tooltip.appendMarkdown(`- Budget: ${budgetStr}\n`);

    if (status.budgetUtilizationPercentage > 0) {
      tooltip.appendMarkdown(
        `- Utilization: ${status.budgetUtilizationPercentage.toFixed(1)}%`
      );
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