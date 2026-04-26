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
    // Try workspace paths first
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let cliPath: string;
    
    if (workspaceFolders && workspaceFolders.length > 0) {
      const wsRoot = workspaceFolders[0].uri.fsPath;
      cliPath = path.join(wsRoot, "dist", "apps", "cli", "index.js");
      
      // Check if CLI exists
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(cliPath));
        return cliPath;
      } catch {
        // CLI not built, try to build
        this.outputChannel.appendLine(`CLI not found at ${cliPath}, attempting to build...`);
      }
    }
    
    // Try home directory path
    const homeDir = process.env.HOME || "";
    cliPath = path.join(homeDir, "Documents", "Study", "Python", "LLM", "AgentLens", "dist", "apps", "cli", "index.js");
    
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(cliPath));
      return cliPath;
    } catch {
      // Not found
    }
    
    // Prompt user to install
    const install = await vscode.window.showWarningMessage(
      "◊ AgentLens CLI not found. Would you like to install it?",
      "Install CLI"
    );
    
    if (install) {
      // Open terminal and run install
      const terminal = vscode.window.createTerminal({
        name: "AgentLens Install",
        cwd: workspaceFolders?.[0]?.uri.fsPath || homeDir
      });
      terminal.show();
      terminal.sendText("cd AgentLens && npm install && npm run build");
      
      this.outputChannel.appendLine("Please run 'npm run build' in the AgentLens project folder");
      return null;
    }
    
    return null;
  }

  private execCommand(): Promise<LiveSessionStatus | null> {
    return new Promise(async (resolve) => {
      const nodePath = process.execPath;
      let cliAbsolutePath: string;
      
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const wsRoot = workspaceFolders[0].uri.fsPath;
        cliAbsolutePath = path.join(wsRoot, "dist", "apps", "cli", "index.js");
      } else {
        const homeDir = process.env.HOME || "";
        cliAbsolutePath = path.join(homeDir, "Documents", "Study", "Python", "LLM", "AgentLens", "dist", "apps", "cli", "index.js");
      }

      this.outputChannel.appendLine(`Executing: ${nodePath} ${cliAbsolutePath} status --format json`);

      execFile(
        nodePath,
        [cliAbsolutePath, "status", "--format", "json"],
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
            // Retry with new path
            cliAbsolutePath = cliPath;
            execFile(
              nodePath,
              [cliAbsolutePath, "status", "--format", "json"],
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
