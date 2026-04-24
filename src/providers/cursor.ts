// ─────────────────────────────────────────────────────────────
// AgentLens – Cursor Provider
// ─────────────────────────────────────────────────────────────

import { IProvider } from './base.js';
import type { Session, DateRange, Message, ToolUsage } from '../types/index.js';
import { accessSync, constants, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { openReadonly } from '../adapters/sqlite.js';
import { isWithinRange } from '../utils/dates.js';

export class CursorProvider implements IProvider {
  readonly id = 'cursor';
  readonly name = 'Cursor';

  private storagePath = join(homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage');

  isAvailable(): boolean {
    try {
      accessSync(this.storagePath, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    if (!this.isAvailable()) return [];

    const discovered: string[] = [];

    try {
      const workspaces = readdirSync(this.storagePath, { withFileTypes: true });
      
      for (const workspace of workspaces) {
        if (!workspace.isDirectory()) continue;
        
        const workspacePath = join(this.storagePath, workspace.name);
        const stateDbPath = join(workspacePath, 'state.vscdb');
        
        try {
          accessSync(stateDbPath, constants.R_OK);
          const stats = statSync(stateDbPath);
          
          if (dateRange) {
            if (isWithinRange(stats.mtimeMs, dateRange)) {
              discovered.push(stateDbPath);
            }
          } else {
            discovered.push(stateDbPath);
          }
        } catch {
          // Skip if state.vscdb doesn't exist
        }
      }
    } catch {
      // Directory not accessible
    }

    return discovered;
  }

  async parseSession(identifier: string): Promise<Session> {
    const db = await openReadonly(identifier);
    
    if (!db) {
      throw new Error('SQLite not available or database could not be opened');
    }

    const messages: Message[] = [];
    let project = 'unknown';

    try {
      const workspacePath = join(identifier, '..');
      project = this.extractProjectName(workspacePath);

      const rows = db.prepare(`
        SELECT key, value FROM ItemTable 
        WHERE key LIKE '%chat%' OR key LIKE '%message%' OR key LIKE '%session%'
      `).all() as Array<{ key: string; value: string }>;

      for (const row of rows) {
        try {
          const data = JSON.parse(row.value);
          const parsed = this.parseCursorData(data, row.key);
          if (parsed) {
            messages.push(...parsed);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    } finally {
      db.close();
    }

    messages.sort((a, b) => a.timestamp - b.timestamp);

    const firstTimestamp = messages[0]?.timestamp || Date.now();
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

  private extractProjectName(workspacePath: string): string {
    try {
      const entries = readdirSync(workspacePath, { withFileTypes: true });
      const folder = entries.find(e => e.isDirectory() && e.name !== 'workspaceStorage');
      if (folder) {
        return folder.name;
      }
    } catch {
      // Ignore
    }
    return 'unknown';
  }

  private parseCursorData(data: unknown, key: string): Message[] {
    const messages: Message[] = [];
    
    if (!data) return messages;

    const normalized = Array.isArray(data) ? data : [data];
    
    for (const item of normalized) {
      if (typeof item !== 'object' || item === null) continue;
      
      const record = item as Record<string, unknown>;
      
      const msg: Message = {
        id: (record.id as string) || (record.uuid as string) || `cursor-${Date.now()}-${messages.length}`,
        role: this.normalizeRole(record.role as string),
        content: (record.content as string) || (record.text as string) || (record.message as string) || '',
        timestamp: this.parseTimestamp(record.timestamp as number | string | undefined),
      };

      if (record.model) {
        msg.model = record.model as string;
      }

      if (record.usage || record.tokens) {
        const usage = record.usage || record.tokens;
        msg.tokens = {
          input: (usage as any)?.input_tokens || (usage as any)?.input || 0,
          output: (usage as any)?.output_tokens || (usage as any)?.output || 0,
          cacheRead: (usage as any)?.cache_read_tokens || 0,
          cacheWrite: (usage as any)?.cache_write_tokens || 0,
        };
      }

      if (record.tools && Array.isArray(record.tools)) {
        msg.tools = (record.tools as any[]).map((t): ToolUsage => ({
          name: this.normalizeToolName(t.name || t.tool || ''),
          input: t.input || t.args || '',
          outputLength: t.output?.length,
          isError: t.error || t.isError,
        }));
      }

      messages.push(msg);
    }

    return messages;
  }

  private normalizeRole(role: string | undefined): 'user' | 'assistant' | 'system' {
    if (!role) return 'user';
    const r = role.toLowerCase();
    if (r === 'user' || r === 'human') return 'user';
    if (r === 'assistant' || r === 'ai' || r === 'gpt') return 'assistant';
    return 'system';
  }

  private parseTimestamp(ts: number | string | undefined): number {
    if (!ts) return Date.now();
    if (typeof ts === 'number') return ts;
    if (typeof ts === 'string') {
      const parsed = Date.parse(ts);
      return isNaN(parsed) ? Date.now() : parsed;
    }
    return Date.now();
  }

  normalizeToolName(rawName: string): string {
    const map: Record<string, string> = {
      'ShellCommand': 'Bash',
      'Bash': 'Bash',
      'bash': 'Bash',
      'EditFile': 'Edit',
      'Edit': 'Edit',
      'edit': 'Edit',
      'CreateFile': 'Write',
      'WriteFile': 'Write',
      'Write': 'Write',
      'write': 'Write',
      'ReadFile': 'Read',
      'Read': 'Read',
      'read': 'Read',
    };
    return map[rawName] || rawName;
  }
}