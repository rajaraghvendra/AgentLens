// ─────────────────────────────────────────────────────────────
// AgentLens – Claude Code Provider
// ─────────────────────────────────────────────────────────────

import { accessSync, constants, statSync, readdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { homedir, platform } from 'os';
import { IProvider } from './base.js';
import type { Session, Message, DateRange, ToolUsage } from '../types/index.js';
import { streamJsonlFile } from '../utils/fs-stream.js';
import { isWithinRange } from '../utils/dates.js';
import config from '../config/env.js';
import { getClaudeProjectsDirCandidates, splitPathList } from '../utils/paths.js';

interface ClaudeEntry {
  type?: string;
  uuid?: string;
  timestamp?: string;
  text?: string;
  message?: {
    role?: string;
    content?: string | Array<{ type?: string; text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    model?: string;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model?: string;
  tools?: Array<{
    name?: string;
    input?: Record<string, unknown>;
    input_text?: string;
  }>;
}

function getDesktopSessionsDir(): string {
  const home = homedir();
  if (platform() === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Claude', 'local-agent-mode-sessions');
  }
  if (platform() === 'win32') {
    return join(home, 'AppData', 'Roaming', 'Claude', 'local-agent-mode-sessions');
  }
  return join(home, '.config', 'Claude', 'local-agent-mode-sessions');
}

function getClaudeConfigRoots(): string[] {
  const multi = process.env.CLAUDE_CONFIG_DIRS?.trim();
  if (multi) {
    return Array.from(new Set(splitPathList(multi)));
  }

  const single = process.env.CLAUDE_CONFIG_DIR?.trim();
  return [single || join(homedir(), '.claude')];
}

export class ClaudeProvider implements IProvider {
  readonly id = 'claude';
  readonly name = 'Claude Code';

  private getProjectRoots(): string[] {
    const hasMultiConfig = Boolean(process.env.CLAUDE_CONFIG_DIRS?.trim());
    const configRoots = getClaudeConfigRoots().map((root) => join(root, 'projects'));
    const fallbackRoots = hasMultiConfig ? [] : [config.claudeProjectsDir, ...getClaudeProjectsDirCandidates()];
    return Array.from(new Set([...configRoots, ...fallbackRoots]));
  }

  isAvailable(): boolean {
    for (const root of this.getProjectRoots()) {
      try {
        accessSync(root, constants.R_OK);
        return true;
      } catch {
        // continue
      }
    }

    try {
      accessSync(getDesktopSessionsDir(), constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    if (!this.isAvailable()) return [];

    const discovered = new Set<string>();

    for (const root of this.getProjectRoots()) {
      try {
        const files = this.findJsonlFiles(root);
        for (const file of files) {
          try {
            const mtimeMs = statSync(file).mtimeMs;
            if (!dateRange || isWithinRange(mtimeMs, dateRange)) {
              discovered.add(file);
            }
          } catch {
            // skip inaccessible files
          }
        }
      } catch {
        // ignore unreadable roots
      }
    }

    try {
      const desktopDirs = this.findDesktopProjectDirs(getDesktopSessionsDir());
      for (const dir of desktopDirs) {
        const files = this.findJsonlFiles(dir);
        for (const file of files) {
          try {
            const mtimeMs = statSync(file).mtimeMs;
            if (!dateRange || isWithinRange(mtimeMs, dateRange)) {
              discovered.add(file);
            }
          } catch {
            // skip inaccessible files
          }
        }
      }
    } catch {
      // desktop sessions not available
    }

    return Array.from(discovered);
  }

  async parseSession(identifier: string): Promise<Session> {
    const messages: Message[] = [];
    const project = inferClaudeProjectName(identifier);
    let sessionTimestamp = Date.now();
    let lastModel: string | undefined;

    for await (const raw of streamJsonlFile<ClaudeEntry>(identifier)) {
      if (!raw.type || !raw.uuid) continue;

      if (raw.type === 'user' || raw.type === 'assistant' || raw.type === 'human') {
        let content = '';
        if (typeof raw.message?.content === 'string') {
          content = raw.message.content;
        } else if (Array.isArray(raw.message?.content)) {
          content = raw.message.content
            .filter((chunk) => chunk && typeof chunk === 'object' && 'text' in chunk)
            .map((chunk) => (chunk as { text: string }).text)
            .join('\n');
        } else if (typeof raw.text === 'string') {
          content = raw.text;
        }

        const role = raw.type === 'assistant' ? 'assistant' : 'user';
        const message: Message = {
          id: raw.uuid,
          role,
          content,
          timestamp: raw.timestamp ? new Date(raw.timestamp).getTime() : Date.now(),
        };

        if (raw.timestamp) {
          sessionTimestamp = new Date(raw.timestamp).getTime();
        }

        const usage = raw.usage || raw.message?.usage;
        if (usage) {
          message.tokens = {
            input: usage.input_tokens || 0,
            output: usage.output_tokens || 0,
            cacheRead: usage.cache_read_input_tokens || 0,
            cacheWrite: usage.cache_creation_input_tokens || 0,
          };
        }

        let model: string | undefined = raw.model || raw.message?.model;
        if (!model && lastModel) {
          model = lastModel;
        }
        if (model) {
          message.model = model;
          lastModel = model;
        }

        if (raw.tools && Array.isArray(raw.tools)) {
          message.tools = raw.tools.map((tool): ToolUsage => {
            const inputObj = (tool.input as Record<string, unknown>) || {};
            return {
              name: this.normalizeToolName(tool.name || ''),
              input: tool.input || tool.input_text || {},
              output: (tool as Record<string, unknown>).output as string,
              outputLength: ((tool as Record<string, unknown>).outputLength as number) || (inputObj.output as string)?.length || 0,
              isError: inputObj.isError as boolean,
            };
          });
        }

        messages.push(message);
      }
    }

    messages.sort((a, b) => a.timestamp - b.timestamp);

    const firstTimestamp = messages[0]?.timestamp || sessionTimestamp;
    const lastTimestamp = messages[messages.length - 1]?.timestamp || firstTimestamp;

    return {
      id: identifier,
      provider: this.id,
      project,
      timestamp: firstTimestamp,
      durationMs: lastTimestamp - firstTimestamp,
      messages,
    };
  }

  normalizeToolName(rawName: string): string {
    const map: Record<string, string> = {
      exec_command: 'Bash',
      file_edit: 'Edit',
      Bash: 'Bash',
      Edit: 'Edit',
      Read: 'Read',
      Write: 'Write',
      glob: 'Glob',
      grep: 'Grep',
      Task: 'Agent',
      TaskCreate: 'TodoWrite',
      bash: 'Bash',
      read: 'Read',
      write: 'Write',
      edit: 'Edit',
      mcp__: 'MCP',
    };
    if (map[rawName]) return map[rawName];
    if (rawName.startsWith('mcp__')) return 'MCP';
    return rawName;
  }

  private findJsonlFiles(dir: string): string[] {
    const results: string[] = [];
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.findJsonlFiles(fullPath));
        } else if (entry.name.endsWith('.jsonl')) {
          results.push(fullPath);
        }
      }
    } catch {
      // ignore unreadable directories
    }
    return results;
  }

  private findDesktopProjectDirs(base: string, depth = 0): string[] {
    if (depth > 8) return [];
    const results: string[] = [];
    try {
      const entries = readdirSync(base, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const fullPath = join(base, entry.name);
        if (!entry.isDirectory()) continue;

        if (entry.name === 'projects') {
          try {
            const projectEntries = readdirSync(fullPath, { withFileTypes: true });
            for (const projectEntry of projectEntries) {
              if (projectEntry.isDirectory()) {
                results.push(join(fullPath, projectEntry.name));
              }
            }
          } catch {
            // ignore unreadable dirs
          }
        } else {
          results.push(...this.findDesktopProjectDirs(fullPath, depth + 1));
        }
      }
    } catch {
      // ignore unreadable directories
    }
    return results;
  }
}

export function inferClaudeProjectName(identifier: string): string {
  const normalized = identifier.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const projectsIndex = parts.lastIndexOf('projects');

  if (projectsIndex >= 0 && projectsIndex < parts.length - 1) {
    return parts[projectsIndex + 1];
  }

  const parent = basename(dirname(identifier));
  if (parent === 'subagents') {
    return basename(dirname(dirname(identifier)));
  }

  return parent;
}
