// ─────────────────────────────────────────────────────────────
// AgentLens – Claude Code Provider
// ─────────────────────────────────────────────────────────────

import { accessSync, constants, statSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { IProvider } from './base.js';
import type { Session, Message, DateRange, ToolUsage } from '../types/index.js';
import { streamJsonlFile } from '../utils/fs-stream.js';
import { isWithinRange } from '../utils/dates.js';
import config from '../config/env.js';

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

export class ClaudeProvider implements IProvider {
  readonly id = 'claude';
  readonly name = 'Claude Code';

  isAvailable(): boolean {
    try {
      accessSync(config.claudeProjectsDir, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    if (!this.isAvailable()) return [];

    const discovered: string[] = [];
    try {
      const projects = readdirSync(config.claudeProjectsDir);
      for (const projectDir of projects) {
        const fullPath = join(config.claudeProjectsDir, projectDir);
        try {
          if (!statSync(fullPath).isDirectory()) continue;
          const files = this.findJsonlFiles(fullPath);
          for (const file of files) {
            try {
              const mtimeMs = statSync(file).mtimeMs;
              if (dateRange) {
                if (isWithinRange(mtimeMs, dateRange)) {
                  discovered.push(file);
                }
              } else {
                discovered.push(file);
              }
            } catch {
              // Skip inaccessible files
            }
          }
        } catch {
          // Ignore unreadable project directories
        }
      }
    } catch {
      // Ignore if dir reading fails
    }

    return discovered;
  }

  async parseSession(identifier: string): Promise<Session> {
    const messages: Message[] = [];
    const project = basename(join(identifier, '..'));
    let sessionTimestamp = Date.now();

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
        const model = raw.model || raw.message?.model;
        if (model) {
          msg.model = model;
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
    };
    return map[rawName] || rawName;
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
}
