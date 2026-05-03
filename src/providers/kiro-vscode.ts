// ─────────────────────────────────────────────────────────────
// AgentLens – Kiro VS Code Extension Provider
// ─────────────────────────────────────────────────────────────

import { IProvider } from './base.js';
import type { Session, DateRange, Message } from '../types/index.js';
import { existsSync, statSync, readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import config from '../config/env.js';
import { isWithinRange } from '../utils/dates.js';
import { getKiroVSCodeAgentDirCandidates, getPathLeaf } from '../utils/paths.js';

// ── Kiro VS Code .chat file shapes ─────────────────────────

interface KiroChatMessage {
  role: 'human' | 'bot' | 'tool';
  content: string;
}

interface KiroChatMetadata {
  modelId?: string;
  modelProvider?: string;
  workflow?: string;
  workflowId?: string;
  startTime?: number;
  endTime?: number;
}

interface KiroChatFile {
  executionId?: string;
  actionId?: string;
  chat: KiroChatMessage[];
  metadata: KiroChatMetadata;
}

interface WorkspaceJson {
  folder?: string;
}

// ── Tool name normalization map ─────────────────────────────

const TOOL_NAME_MAP: Record<string, string> = {
  'readFile': 'Read',
  'read_file': 'Read',
  'writeFile': 'Edit',
  'write_file': 'Edit',
  'editFile': 'Edit',
  'edit_file': 'Edit',
  'createFile': 'Write',
  'create_file': 'Write',
  'deleteFile': 'Delete',
  'delete_file': 'Delete',
  'listDir': 'Glob',
  'list_dir': 'Glob',
  'openFolders': 'Glob',
  'runCommand': 'Bash',
  'run_command': 'Bash',
  'searchFiles': 'Grep',
  'search_files': 'Grep',
  'findFiles': 'Glob',
  'find_files': 'Glob',
  'webSearch': 'WebSearch',
  'web_search': 'WebSearch',
};

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-sonnet-4-5': 'Sonnet 4.5',
  'claude-sonnet-4': 'Sonnet 4',
  'claude-haiku-4-5': 'Haiku 4.5',
  'claude-3-7-sonnet': 'Sonnet 3.7',
  'claude-3-5-sonnet': 'Sonnet 3.5',
  'claude-3-5-haiku': 'Haiku 3.5',
};

const MODEL_DISPLAY_ENTRIES = Object.entries(MODEL_DISPLAY_NAMES).sort((a, b) => b[0].length - a[0].length);

function normalizeModelId(raw: string): string {
  return raw.replace(/(\d+)\.(\d+)/g, '$1-$2');
}

function extractToolNames(content: string): string[] {
  const tools: string[] = [];
  const regex = /<tool_use>\s*<name>([^<]+)<\/name>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1].trim();
    tools.push(TOOL_NAME_MAP[name] ?? name);
  }
  return tools;
}

function estimateTokensFromContent(content: string): number {
  return Math.ceil(content.length / 4);
}

export class KiroVSCodeProvider implements IProvider {
  readonly id = 'kiro-vscode';
  readonly name = 'Kiro (VS Code)';

  private agentDir = config.kiroVSCodeDir;

  private getAgentDirs(): string[] {
    return Array.from(new Set([
      this.agentDir,
      ...getKiroVSCodeAgentDirCandidates(),
    ]));
  }

  isAvailable(): boolean {
    for (const dir of this.getAgentDirs()) {
      try {
        if (existsSync(dir)) return true;
      } catch {
        // continue
      }
    }
    return false;
  }

  private readWorkspaceProject(workspaceDir: string): string {
    try {
      const raw = readFileSync(join(workspaceDir, 'workspace.json'), 'utf-8');
      const data = JSON.parse(raw) as WorkspaceJson;
      if (data.folder) {
        const url = data.folder.replace(/^file:\/\//, '');
        return getPathLeaf(decodeURIComponent(url));
      }
    } catch {
      // No workspace.json or invalid
    }
    return basename(workspaceDir);
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    if (!this.isAvailable()) return [];

    const discovered = new Set<string>();

    for (const agentDir of this.getAgentDirs()) {
      try {
        // Workspace dirs are 32-char hex hashes
        let workspaceDirs: string[];
        try {
          const entries = readdirSync(agentDir, { withFileTypes: true });
          workspaceDirs = entries
            .filter(e => e.isDirectory() && /^[a-f0-9]{32}$/.test(e.name))
            .map(e => e.name);
        } catch { continue; }

        for (const wsHash of workspaceDirs) {
          const wsPath = join(agentDir, wsHash);

          let files: string[];
          try { files = readdirSync(wsPath); } catch { continue; }

          for (const file of files) {
            if (!file.endsWith('.chat')) continue;

            const filePath = join(wsPath, file);

            try {
              const stats = statSync(filePath);
              if (dateRange) {
                if (isWithinRange(stats.mtimeMs, dateRange)) {
                  discovered.add(filePath);
                }
              } else {
                discovered.add(filePath);
              }
            } catch {
              // Skip inaccessible files
            }
          }
        }
      } catch {
        // Directory doesn't exist or is not readable
      }
    }

    return Array.from(discovered);
  }

  async parseSession(identifier: string): Promise<Session> {
    const messages: Message[] = [];
    let project = 'default-project';
    let sessionTimestamp = Date.now();
    let sessionModel = 'kiro-auto';

    // Derive project from parent directory
    const parentDir = basename(join(identifier, '..'));
    project = parentDir;

    let raw: string;
    try {
      raw = readFileSync(identifier, 'utf-8');
    } catch {
      return {
        id: identifier,
        provider: this.id,
        project,
        timestamp: sessionTimestamp,
        durationMs: 0,
        messages: [],
      };
    }

    let data: KiroChatFile;
    try {
      data = JSON.parse(raw) as KiroChatFile;
    } catch {
      return {
        id: identifier,
        provider: this.id,
        project,
        timestamp: sessionTimestamp,
        durationMs: 0,
        messages: [],
      };
    }

    if (!data.chat || !data.metadata) {
      return {
        id: identifier,
        provider: this.id,
        project,
        timestamp: sessionTimestamp,
        durationMs: 0,
        messages: [],
      };
    }

    // Extract metadata
    if (data.metadata.modelId) {
      sessionModel = normalizeModelId(data.metadata.modelId);
      if (sessionModel === 'auto' || !sessionModel) sessionModel = 'kiro-auto';
    }

    if (data.metadata.startTime) {
      const tsDate = new Date(data.metadata.startTime);
      if (!isNaN(tsDate.getTime()) && tsDate.getTime() >= 1_000_000_000_000) {
        sessionTimestamp = tsDate.getTime();
      }
    }

    // Try to get project name from workspace.json
    const workspaceDir = join(this.agentDir, parentDir);
    if (existsSync(workspaceDir)) {
      const wsProject = this.readWorkspaceProject(workspaceDir);
      if (wsProject !== parentDir) {
        project = wsProject;
      }
    }

    // Parse chat messages
    let pendingUserMessage = '';
    const allTools: string[] = [];

    for (const msg of data.chat) {
      if (msg.role === 'human') {
        if (msg.content.startsWith('<identity>')) continue;

        pendingUserMessage = msg.content.slice(0, 500);

        messages.push({
          id: `kiro-vscode-human-${messages.length}`,
          role: 'user',
          content: msg.content,
          timestamp: sessionTimestamp + messages.length * 1000,
          tokens: {
            input: estimateTokensFromContent(msg.content),
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
        });
      }

      if (msg.role === 'bot') {
        const tools = extractToolNames(msg.content);
        allTools.push(...tools);

        messages.push({
          id: `kiro-vscode-bot-${messages.length}`,
          role: 'assistant',
          content: msg.content
            .replace(/<tool_use>[\s\S]*?<\/tool_use>/g, '')
            .trim(),
          timestamp: sessionTimestamp + messages.length * 1000,
          model: sessionModel,
          tokens: {
            input: 0,
            output: estimateTokensFromContent(msg.content),
            cacheRead: 0,
            cacheWrite: 0,
          },
          tools: tools.length > 0 ? tools.map(name => ({
            name,
            input: {},
          })) : undefined,
        });
      }
    }

    // Deduplicate tools
    const uniqueTools = [...new Set(allTools)];

    messages.sort((a, b) => a.timestamp - b.timestamp);

    const firstTimestamp = messages[0]?.timestamp || sessionTimestamp;
    const lastTimestamp = messages[messages.length - 1]?.timestamp || firstTimestamp;
    const durationMs = data.metadata.endTime && data.metadata.startTime
      ? data.metadata.endTime - data.metadata.startTime
      : lastTimestamp - firstTimestamp;

    return {
      id: identifier,
      provider: this.id,
      project,
      timestamp: firstTimestamp,
      durationMs,
      messages,
    };
  }

  normalizeToolName(rawName: string): string {
    if (TOOL_NAME_MAP[rawName]) return TOOL_NAME_MAP[rawName];
    const lower = rawName.toLowerCase();
    if (TOOL_NAME_MAP[lower]) return TOOL_NAME_MAP[lower];
    return rawName;
  }

  getModelDisplayName(model: string): string {
    if (model === 'kiro-auto') return 'Kiro (auto)';
    for (const [key, name] of MODEL_DISPLAY_ENTRIES) {
      if (model === key || model.startsWith(key + '-')) return name;
    }
    return model;
  }
}
