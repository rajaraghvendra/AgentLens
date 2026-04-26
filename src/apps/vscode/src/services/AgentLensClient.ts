import { execFile } from "child_process";
import * as vscode from "vscode";
import * as path from "path";
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

  private getWorkspaceCliPath(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    return path.join(workspaceFolders[0].uri.fsPath, "dist", "apps", "cli", "index.js");
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
      return true;
    } catch {
      return false;
    }
  }

  private async resolveCLICommand(): Promise<{ command: string; args: string[] } | null> {
    if (this.cliPath.trim()) {
      if (path.isAbsolute(this.cliPath)) {
        if (await this.pathExists(this.cliPath)) {
          return { command: process.execPath, args: [this.cliPath] };
        }
      } else {
        return { command: this.cliPath, args: [] };
      }
    }

    const workspaceCliPath = this.getWorkspaceCliPath();
    if (workspaceCliPath && await this.pathExists(workspaceCliPath)) {
      return { command: process.execPath, args: [workspaceCliPath] };
    }

    return { command: "agentlens", args: [] };
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

  private async ensureCLI(): Promise<string | null> {
    if (this.cliPath.trim()) {
      if (path.isAbsolute(this.cliPath) && await this.pathExists(this.cliPath)) {
        return this.cliPath;
      }

      if (!path.isAbsolute(this.cliPath)) {
        return this.cliPath;
      }
    }

    const workspaceCliPath = this.getWorkspaceCliPath();
    if (workspaceCliPath && await this.pathExists(workspaceCliPath)) {
      return workspaceCliPath;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const install = await vscode.window.showWarningMessage(
      "◊ AgentLens CLI not found. Would you like to install it?",
      "Install CLI"
    );
    
    if (install) {
      // Open terminal and run install
      const terminal = vscode.window.createTerminal({
        name: "AgentLens Install",
        cwd: workspaceFolders?.[0]?.uri.fsPath
      });
      terminal.show();
      terminal.sendText("npm install -g @rajaraghvendra/agentlens");
      
      this.outputChannel.appendLine("Install AgentLens globally or configure agentlens.cliPath in extension settings.");
      return null;
    }
    
    return null;
  }

  private execCommand(): Promise<LiveSessionStatus | null> {
    return new Promise(async (resolve) => {
      let cliCommand = await this.resolveCLICommand();
      if (!cliCommand) {
        resolve(null);
        return;
      }

      this.outputChannel.appendLine(`Executing: ${cliCommand.command} ${[...cliCommand.args, "status", "--format", "json"].join(" ")}`);

      execFile(
        cliCommand.command,
        [...cliCommand.args, "status", "--format", "json"],
        { timeout: 10000 },
        async (error: Error | null, stdout: string, stderr: string) => {
          if (error) {
            // Try to ensure CLI is available
            const cliPath = await this.ensureCLI();
            if (!cliPath) {
              this.outputChannel.appendLine(`Error: ${error.message}`);
              vscode.window.showErrorMessage(
                `AgentLens error: ${error.message}`,
                "View Logs"
              ).then((clicked) => {
                if (clicked === "View Logs") {
                  this.outputChannel.show();
                }
              });
              resolve(null);
              return;
            }
            cliCommand = path.isAbsolute(cliPath)
              ? { command: process.execPath, args: [cliPath] }
              : { command: cliPath, args: [] };
            execFile(
              cliCommand.command,
              [...cliCommand.args, "status", "--format", "json"],
              { timeout: 10000 },
              (retryError: Error | null, retryStdout: string) => {
                if (retryError) {
                  this.outputChannel.appendLine(`Error: ${retryError.message}`);
                  resolve(null);
                  return;
                }
                try {
                  const status: LiveSessionStatus = JSON.parse(retryStdout);
                  this.outputChannel.appendLine(`Success: $${status.totalCostLocal}`);
                  resolve(status);
                } catch {
                  resolve(null);
                }
              }
            );
            return;
          }

          if (stderr && !stdout) {
            this.outputChannel.appendLine(`stderr: ${stderr}`);
          }

          if (!stdout) {
            this.outputChannel.appendLine("No output from CLI");
            resolve(null);
            return;
          }

          try {
            const status: LiveSessionStatus = JSON.parse(stdout);
            this.outputChannel.appendLine(`Success: $${status.totalCostLocal}`);
            resolve(status);
          } catch (parseError) {
            this.outputChannel.appendLine(`JSON parse error: ${parseError}`);
            this.outputChannel.appendLine(`Raw output: ${stdout.substring(0, 200)}`);
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
