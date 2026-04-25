import * as vscode from "vscode";
import type { StatusBarConfig } from "../types/index";

const DEFAULT_CONFIG: StatusBarConfig = {
  pollingInterval: 15,
  cliPath: "agentlens",
  onClickAction: "openDashboard",
};

export class ConfigManager {
  private config: StatusBarConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): StatusBarConfig {
    const workspaceConfig = vscode.workspace.getConfiguration("agentlens");

    const pollingInterval = Math.max(
      5,
      Math.min(
        300,
        workspaceConfig.get<number>("pollingInterval") ?? DEFAULT_CONFIG.pollingInterval
      )
    );

    const cliPath =
      workspaceConfig.get<string>("cliPath") ?? DEFAULT_CONFIG.cliPath;

    let onClickAction: "openDashboard" | "showOutput" | "none" = "openDashboard";
    const storedAction = workspaceConfig.get<string>("onClickAction");
    if (storedAction === "showOutput" || storedAction === "none") {
      onClickAction = storedAction;
    }

    return {
      pollingInterval,
      cliPath,
      onClickAction,
    };
  }

  get(): StatusBarConfig {
    return this.config;
  }

  refresh(): void {
    this.config = this.loadConfig();
  }

  getPollingIntervalMs(): number {
    return this.config.pollingInterval * 1000;
  }
}