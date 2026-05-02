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
import { getClaudeProjectsDirCandidates } from '../utils/paths.js';

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

// ── Claude Desktop agent-mode session paths ─────────────────
// Claude Desktop stores local-agent-mode-sessions in a
// platform-specific location, separate from ~/.claude/projects.
function getDesktopSessionsDir(): string {
  const home = homedir();
  if (platform() === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Claude', 'local-agent-mode-sessions');
  }
  if (platform() === 'win32') {
    return join(home, 'AppData', 'Roaming', 'Claude', 'local-agent-mode-sessions');
  }
  // Linux
  return join(home, '.config', 'Claude', 'local-agent-mode-sessions');
}

// ── Get Claude config directory (respects CLAUDE_CONFIG_DIR) ─
function getClaudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

export class ClaudeProvider implements IProvider {
  readonly id = 'claude';
  readonly name = 'Claude Code';

  private getProjectRoots(): string[] {
    return Array.from(new Set([
      config.claudeProjectsDir,
      join(getClaudeConfigDir(), 'projects'),
      ...getClaudeProjectsDirCandidates(),
    ]));
  }

  isAvailable(): boolean {
    // Check standard project directories
    for (const root of this.getProjectRoots()) {
      try {
        accessSync(root, constants.R_OK);
        return true;
      } catch {
        // continue
      }
    }

    // Check Claude Desktop agent-mode sessions
    try {
      accessSync(getDesktopSessionsDir(), constants.R_OK);
      return true;
    } catch {
      // continue
    }

    return false;
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    if (!this.isAvailable()) return [];

    const discovered = new Set<string>();

    // ── Standard ~/.claude/projects directories ───────────────
    for (const root of this.getProjectRoots()) {
      try {
        const files = this.findJsonlFiles(root);
        for (const file of files) {
          try {
            const mtimeMs = statSync(file).mtimeMs;
            if (dateRange) {
              if (isWithinRange(mtimeMs, dateRange)) {
                discovered.add(file);
              }
            } else {
              discovered.add(file);
            }
          } catch {
            // Skip inaccessible files
          }
        }
      } catch {
        // Ignore unreadable roots
      }
    }

    // ── Claude Desktop local-agent-mode-sessions ─────────────
    // These are nested: base → <hash> → projects → <project> → *.jsonl
    try {
      const desktopDirs = this.findDesktopProjectDirs(getDesktopSessionsDir());
      for (const dir of desktopDirs) {
        const files = this.findJsonlFiles(dir);
        for (const file of files) {
          try {
            const mtimeMs = statSync(file).mtimeMs;
            if (dateRange) {
              if (isWithinRange(mtimeMs, dateRange)) {
                discovered.add(file);
              }
            } else {
              discovered.add(file);
            }
          } catch {
            // Skip inaccessible files
          }
        }
      }
    } catch {
      // Desktop sessions not available
    }

    return Array.from(discovered);
  }

  async parseSession(identifier: string): Promise<Session> {
    const messages: Message[] = [];
    const project = inferClaudeProjectName(identifier);
    let sessionTimestamp = Date.now();
    let lastModel: string | undefined = undefined;

    for await (const raw of streamJsonlFile<ClaudeEntry>(identifier)) {
      if (!raw.type || !raw.uuid) continue;

      // Handle both old format (type: "human"/"assistant") and new format (type: "user"/"assistant")
      if (raw.type === 'user' || raw.type === 'assistant' || raw.type === 'human') {
        // Determine content based on format
        let content = '';
        if (typeof raw.message?.content === 'string') {
          content = raw.message.content;
        } else if (Array.isArray(raw.message?.content)) {
          content = raw.message.content
            .filter(c => c && typeof c === 'object' && 'text' in c)
            .map(c => (c as { text: string }).text)
            .join('\n');
        } else if (typeof raw.text === 'string') {
          // Old format
          content = raw.text;
        }

        const role = raw.type === 'user' || raw.type === 'human' ? 'user' : 'assistant';
        
        const msg: Message = {
          id: raw.uuid,
          role,
          content,
          timestamp: raw.timestamp ? new Date(raw.timestamp).getTime() : Date.now(),
        };

        if (raw.timestamp) {
          sessionTimestamp = new Date(raw.timestamp).getTime();
        }

        // Handle both old format (usage at root) and new format (usage in message)
        const usage = raw.usage || raw.message?.usage;
        if (usage) {
          msg.tokens = {
            input: usage.input_tokens || 0,
            output: usage.output_tokens || 0,
            cacheRead: usage.cache_read_input_tokens || 0,
            cacheWrite: usage.cache_creation_input_tokens || 0,
          };
        }

        // Handle both old format (model at root) and new format (model in message)
        // Also inherit the last known model from the session if not specified
        let model: string | undefined = raw.model || raw.message?.model;
        if (!model && lastModel) {
          model = lastModel;
        }
        if (model) {
          msg.model = model;
          lastModel = model;
        }

        if (raw.tools && Array.isArray(raw.tools)) {
          msg.tools = raw.tools.map((t): ToolUsage => {
            const inputObj = t.input as Record<string, unknown> || {};
            return {
              name: this.normalizeToolName(t.name || ''),
              input: t.input || t.input_text || {},
              output: (t as Record<string, unknown>).output as string,
              outputLength: (t as Record<string, unknown>).outputLength as number || (inputObj.output as string)?.length || 0,
              isError: inputObj.isError as boolean,
            };
          });
        }

        messages.push(msg);
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
      'exec_command': 'Bash',
      'file_edit': 'Edit',
      'Bash': 'Bash',
      'Edit': 'Edit',
      'Read': 'Read',
      'Write': 'Write',
      'glob': 'Glob',
      'grep': 'Grep',
      'Task': 'Agent',
      'TaskCreate': 'TodoWrite',
      // Additional tool names used in newer Claude versions
      'bash': 'Bash',
      'read': 'Read',
      'write': 'Write',
      'edit': 'Edit',
      'mcp__': 'MCP',
    };
    // Check exact match
    if (map[rawName]) return map[rawName];
    // Check prefix match for MCP tools
    if (rawName.startsWith('mcp__')) return 'MCP';
    return rawName;
  }

  private findJsonlFiles(dir: string): string[] {
    const results: string[] = [];
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.findJsonlFiles(full));
        } else if (entry.name.endsWith('.jsonl')) {
          results.push(full);
        }
      }
    } catch {
      // Ignore
    }
    return results;
  }

  /**
   * Walk the Claude Desktop local-agent-mode-sessions tree to
   * find project directories. Structure:
   *   base/ → <hash>/ → projects/ → <project-name>/
   */
  private findDesktopProjectDirs(base: string, depth = 0): string[] {
    if (depth > 8) return [];
    const results: string[] = [];
    try {
      const entries = readdirSync(base, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = join(base, entry.name);
        if (!entry.isDirectory()) continue;

        if (entry.name === 'projects') {
          // Found the projects dir — enumerate project subdirs
          try {
            const projectEntries = readdirSync(full, { withFileTypes: true });
            for (const pe of projectEntries) {
              if (pe.isDirectory()) {
                results.push(join(full, pe.name));
              }
            }
          } catch {
            // Ignore
          }
        } else {
          results.push(...this.findDesktopProjectDirs(full, depth + 1));
        }
      }
    } catch {
      // Ignore
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
