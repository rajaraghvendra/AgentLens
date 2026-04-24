// ─────────────────────────────────────────────────────────────
// AgentLens – Codex Provider
// ─────────────────────────────────────────────────────────────

import { IProvider } from './base.js';
import type { Session, DateRange, Message, ToolUsage } from '../types/index.js';
import { existsSync, statSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import config from '../config/env.js';
import { streamJsonlFile } from '../utils/fs-stream.js';
import { isWithinRange } from '../utils/dates.js';

interface CodexEntry {
  timestamp?: string;
  type?: string;
  payload?: {
    id?: string;
    type?: string;
    role?: string;
    cwd?: string;
    content?: Array<{ type?: string; text?: string }>;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_tokens?: number;
      cache_write_tokens?: number;
    };
    tokens?: {
      input?: number;
      output?: number;
    };
    tools?: Array<{
      name?: string;
      input?: Record<string, unknown>;
      output?: string;
    }>;
  };
}

export class CodexProvider implements IProvider {
  readonly id = 'codex';
  readonly name = 'Codex CLI';

  private sessionsDir = join(config.codexDir, 'sessions');

  isAvailable(): boolean {
    try {
      return existsSync(this.sessionsDir);
    } catch {
      return false;
    }
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    if (!this.isAvailable()) return [];

    const discovered: string[] = [];
    
    try {
      const years = readdirSync(this.sessionsDir);
      
      for (const year of years) {
        const yearPath = join(this.sessionsDir, year);
        if (!statSync(yearPath).isDirectory()) continue;
        
        const months = readdirSync(yearPath);
        for (const month of months) {
          const monthPath = join(yearPath, month);
          if (!statSync(monthPath).isDirectory()) continue;
          
          const days = readdirSync(monthPath);
          for (const day of days) {
            const dayPath = join(monthPath, day);
            if (!statSync(dayPath).isDirectory()) continue;
            
            const files = readdirSync(dayPath);
            for (const file of files) {
              if (!file.startsWith('rollout-') || !file.endsWith('.jsonl')) continue;
              
              const filePath = join(dayPath, file);
              
              try {
                const stats = statSync(filePath);
                
                if (dateRange) {
                  if (isWithinRange(stats.mtimeMs, dateRange)) {
                    discovered.push(filePath);
                  }
                } else {
                  discovered.push(filePath);
                }
              } catch {
                // Skip inaccessible files
              }
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist or is not readable
    }

    return discovered;
  }

  async parseSession(identifier: string): Promise<Session> {
    const messages: Message[] = [];
    let project = basename(identifier, '.jsonl').replace(/^rollout-/, '');
    let sessionTimestamp = Date.now();
    
    for await (const raw of streamJsonlFile<CodexEntry>(identifier)) {
      if (!raw.type) continue;
      
      if (raw.type === 'session_meta' && raw.payload) {
        if (raw.payload.cwd) {
          const parts = raw.payload.cwd.split('/');
          project = parts[parts.length - 1] || project;
        }
        if (raw.timestamp) {
          sessionTimestamp = new Date(raw.timestamp).getTime();
        }
        continue;
      }
      
      if (raw.type === 'response_item' && raw.payload) {
        const p = raw.payload;
        
        if (p.type !== 'message') continue;
        
        const content = p.content
          ?.filter((c): c is { type: string; text: string } => c && typeof c === 'object' && 'text' in c)
          .map(c => c.text)
          .join('\n') || '';
        
        let inputTokens = 0;
        let outputTokens = 0;
        
        if (p.usage) {
          inputTokens = p.usage.input_tokens || 0;
          outputTokens = p.usage.output_tokens || 0;
        } else if (p.tokens) {
          inputTokens = p.tokens.input || 0;
          outputTokens = p.tokens.output || 0;
        }

        const msg: Message = {
          id: p.id || `codex-${messages.length}`,
          role: p.role === 'developer' ? 'assistant' : (p.role === 'user' ? 'user' : 'assistant'),
          content: content,
          timestamp: raw.timestamp ? new Date(raw.timestamp).getTime() : Date.now(),
          model: p.model || 'gpt-5.4',
          tokens: {
            input: inputTokens > 0 ? inputTokens : Math.ceil(content.length / 4),
            output: outputTokens > 0 ? outputTokens : 0,
            cacheRead: p.usage?.cache_read_tokens || 0,
            cacheWrite: p.usage?.cache_write_tokens || 0,
          },
        };

        if (p.tools && Array.isArray(p.tools)) {
          msg.tools = p.tools.map((t): ToolUsage => ({
            name: this.normalizeToolName(t.name || ''),
            input: t.input || {},
            outputLength: t.output?.length,
          }));
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
      'Bash': 'Bash',
      'bash': 'Bash',
      'run_command': 'Bash',
      'shell': 'Bash',
      'exec_command': 'Bash',
      'Edit': 'Edit',
      'edit': 'Edit',
      'edit_file': 'Edit',
      'Write': 'Write',
      'write': 'Write',
      'write_to_file': 'Write',
      'Read': 'Read',
      'read': 'Read',
      'view_file': 'Read',
      'ReadFile': 'Read',
      'Glob': 'Glob',
      'glob': 'Glob',
      'Grep': 'Grep',
      'grep': 'Grep',
    };
    return map[rawName] || rawName;
  }
}
