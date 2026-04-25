import { execFile } from "child_process";
import * as vscode from "vscode";
import type { LiveSessionStatus } from "../types/index";

export class AgentLensClient {
  private cliPath: string;
  private isExecuting: boolean = false;
  private lastStatus: LiveSessionStatus | null = null;
  private outputChannel: vscode.OutputChannel;

  constructor(cliPath: string) {
    this.cliPath = cliPath;
    this.outputChannel = vscode.window.createOutputChannel("AgentLens");
  }

  async getStatus(): Promise<LiveSessionStatus | null> {
    if (this.isExecuting) {
      return this.lastStatus;
    }

    this.isExecuting = true;

    try {
      const result = await this.execCommand();
      
      if (result) {
        this.lastStatus = result;
      }
      
      return result;
    } catch (error) {
      this.logError(error);
      return this.lastStatus;
    } finally {
      this.isExecuting = false;
    }
  }

  private execCommand(): Promise<LiveSessionStatus | null> {
    return new Promise((resolve) => {
      execFile(
        this.cliPath,
        ["status", "--format", "json"],
        { timeout: 10000 },
        (error: Error | null, stdout: string, stderr: string) => {
          if (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
              vscode.window.showErrorMessage(
                "AgentLens CLI is missing. Please run: npm install -g agentlens",
                "Open Terminal"
              ).then((clicked) => {
                if (clicked === "Open Terminal") {
                  vscode.commands.executeCommand("workbench.action.terminal.newTerminal");
                }
              });
              this.outputChannel.appendLine(`CLI not found: ${error.message}`);
            }
            resolve(null);
            return;
          }

          if (stderr) {
            this.outputChannel.appendLine(`stderr: ${stderr}`);
          }

          try {
            const status: LiveSessionStatus = JSON.parse(stdout);
            resolve(status);
          } catch (parseError) {
            this.outputChannel.appendLine(`JSON parse error: ${parseError}`);
            resolve(null);
          }
        }
      );
    });
  }

  private logError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.outputChannel.appendLine(`Error: ${message}`);
  }

  showOutput(): void {
    this.outputChannel.show();
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}