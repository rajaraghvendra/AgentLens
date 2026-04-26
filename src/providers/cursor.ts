// ─────────────────────────────────────────────────────────────
// AgentLens – Cursor Provider
// ─────────────────────────────────────────────────────────────

import { IProvider } from './base.js';
import type { Session, DateRange, Message, ToolUsage } from '../types/index.js';
import { accessSync, constants, statSync, readdirSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { openReadonly } from '../adapters/sqlite.js';
import { isWithinRange } from '../utils/dates.js';
import { getCursorDataDir } from '../utils/paths.js';

export class CursorProvider implements IProvider {
  readonly id = 'cursor';
  readonly name = 'Cursor';

  private cursorDataDir = getCursorDataDir();
  private workspaceStoragePath = join(this.cursorDataDir, 'User', 'workspaceStorage');
  private chatsStoragePath = join(this.cursorDataDir, 'chats');

  isAvailable(): boolean {
    return this.isReadableDir(this.workspaceStoragePath) || this.isReadableDir(this.chatsStoragePath);
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    if (!this.isAvailable()) return [];

    const discovered: string[] = [];
    this.discoverWorkspaceSessions(discovered, dateRange);
    this.discoverChatStoreSessions(discovered, dateRange);
    return discovered;
  }

  private discoverWorkspaceSessions(discovered: string[], dateRange?: DateRange): void {
    if (!this.isReadableDir(this.workspaceStoragePath)) return;
    try {
      const workspaces = readdirSync(this.workspaceStoragePath, { withFileTypes: true });
      
      for (const workspace of workspaces) {
        if (!workspace.isDirectory()) continue;
        
        const workspacePath = join(this.workspaceStoragePath, workspace.name);
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
  }

  private discoverChatStoreSessions(discovered: string[], dateRange?: DateRange): void {
    if (!this.isReadableDir(this.chatsStoragePath)) return;

    const stack = [this.chatsStoragePath];
    while (stack.length > 0) {
      const current = stack.pop()!;
      let entries: Array<{ isDirectory: () => boolean; isFile: () => boolean; name: string }>;
      try {
        entries = readdirSync(current, { withFileTypes: true }) as Array<{ isDirectory: () => boolean; isFile: () => boolean; name: string }>;
      } catch {
        continue;
      }

      for (const entry of entries) {
        const full = join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }

        if (entry.isFile() && entry.name === 'store.db') {
          try {
            const stats = statSync(full);
            if (!dateRange || isWithinRange(stats.mtimeMs, dateRange)) {
              discovered.push(full);
            }
          } catch {
            // ignore unreadable db
          }
        }
      }
    }
  }

  async parseSession(identifier: string): Promise<Session> {
    if (identifier.endsWith('store.db')) {
      return this.parseCursorChatSession(identifier);
    }

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

  private async parseCursorChatSession(identifier: string): Promise<Session> {
    const db = await openReadonly(identifier);
    if (!db) {
      throw new Error('SQLite not available or database could not be opened');
    }

    const messages: Message[] = [];
    let sessionStart = Date.now();
    let idx = 0;
    const project = basename(dirname(identifier));

    try {
      const rows = db.prepare(`SELECT data FROM blobs WHERE length(data) > 0`).all() as Array<{ data: Buffer | string }>;
      for (const row of rows) {
        const raw = typeof row.data === 'string' ? row.data : Buffer.from(row.data).toString('utf8');
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          continue;
        }

        const role = this.normalizeRole(parsed.role as string | undefined);
        const content = this.normalizeContent(parsed.content);
        if (!content && role === 'system') continue;

        const timestamp = this.parseTimestamp(
          (parsed.timestamp as string | number | undefined) ??
          (parsed.createdAt as string | number | undefined),
        );
        sessionStart = Math.min(sessionStart, timestamp);

        const msg: Message = {
          id: String(parsed.id ?? `cursor-chat-${idx++}`),
          role,
          content,
          timestamp,
        };

        if (typeof parsed.model === 'string') {
          msg.model = parsed.model;
        }

        if (parsed.tokens && typeof parsed.tokens === 'object') {
          const usage = parsed.tokens as Record<string, unknown>;
          msg.tokens = {
            input: Number(usage.input_tokens ?? usage.input ?? 0),
            output: Number(usage.output_tokens ?? usage.output ?? 0),
            cacheRead: Number(usage.cache_read_tokens ?? usage.cacheRead ?? 0),
            cacheWrite: Number(usage.cache_write_tokens ?? usage.cacheWrite ?? 0),
          };
        } else if (content) {
          const estimatedTokens = Math.ceil(content.length / 4);
          msg.tokens = {
            input: role === 'user' ? estimatedTokens : 0,
            output: role === 'assistant' ? estimatedTokens : 0,
            cacheRead: 0,
            cacheWrite: 0,
          };
        }

        messages.push(msg);
      }
    } finally {
      db.close();
    }

    messages.sort((a, b) => a.timestamp - b.timestamp);
    const firstTimestamp = messages[0]?.timestamp || sessionStart;
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

  private normalizeContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'text' in (item as Record<string, unknown>)) {
            return String((item as Record<string, unknown>).text ?? '');
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    return '';
  }

  private isReadableDir(path: string): boolean {
    try {
      accessSync(path, constants.R_OK);
      return existsSync(path);
    } catch {
      return false;
    }
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
      } else if (msg.content) {
        const estimatedTokens = Math.ceil(msg.content.length / 4);
        msg.tokens = {
          input: msg.role === 'user' ? estimatedTokens : 0,
          output: msg.role === 'assistant' ? estimatedTokens : 0,
          cacheRead: 0,
          cacheWrite: 0,
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
