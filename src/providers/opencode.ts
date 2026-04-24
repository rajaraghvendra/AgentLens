// ─────────────────────────────────────────────────────────────
// AgentLens – Opencode Provider (SQLite)
// ─────────────────────────────────────────────────────────────

import { IProvider } from './base.js';
import type { Session, DateRange, Message, ToolUsage } from '../types/index.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { openReadonly } from '../adapters/sqlite.js';

interface OpencodeMessageData {
  role: string;
  time?: { created: number };
  agent?: string;
  model?: { providerID: string; modelID: string };
  modelID?: string;
  providerID?: string;
  variant?: string;
  summary?: { diffs?: unknown[] };
  mode?: string;
  path?: string;
  cost?: number;
  tokens?: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
  finish?: { reason: string };
  content?: string;
  text?: string;
}

export class OpencodeProvider implements IProvider {
  readonly id = 'opencode';
  readonly name = 'Opencode (Deepmind)';

  private dbPath = join(homedir(), '.local', 'share', 'opencode', 'opencode.db');

  isAvailable(): boolean {
    return existsSync(this.dbPath);
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    if (!this.isAvailable()) return [];

    const discovered: string[] = [];
    const db = await openReadonly(this.dbPath);
    
    if (!db) return discovered;

    try {
      const rows = db.prepare(`
        SELECT id, project_id, time_created 
        FROM session 
        ORDER BY time_created DESC
        LIMIT 1000
      `).all() as Array<{ id: string; project_id: string; time_created: number }>;

      for (const row of rows) {
        if (dateRange) {
          const ts = row.time_created;
          const inRange = ts >= dateRange.from && ts <= dateRange.to;
          if (inRange) {
            discovered.push(row.id);
          }
        } else {
          discovered.push(row.id);
        }
      }
    } catch {
      // Query error
    } finally {
      db.close();
    }

    return discovered;
  }

  async parseSession(identifier: string): Promise<Session> {
    const db = await openReadonly(this.dbPath);
    if (!db) {
      throw new Error('Cannot open Opencode database');
    }

    const messages: Message[] = [];
    let project = 'opencode-workspace';
    let sessionTimestamp = Date.now();

    try {
      const sessionId = identifier;
      
      const projectRows = db.prepare(`
        SELECT p.name FROM project p
        JOIN session s ON s.project_id = p.id
        WHERE s.id = ?
      `).get(sessionId) as { name: string } | undefined;
      
      if (projectRows) {
        project = projectRows.name;
      }

      const sessionRows = db.prepare(`
        SELECT time_created FROM session WHERE id = ?
      `).get(sessionId) as { time_created: number } | undefined;
      
      if (sessionRows) {
        sessionTimestamp = sessionRows.time_created;
      }

      const messageRows = db.prepare(`
        SELECT id, data, time_created
        FROM message 
        WHERE session_id = ?
        ORDER BY time_created ASC
      `).all(sessionId) as Array<{
        id: string;
        data: string;
        time_created: number;
      }>;

      let msgCounter = 0;
      for (const row of messageRows) {
        if (!row.data) continue;
        
        try {
          const msgData: OpencodeMessageData = JSON.parse(row.data);
          const role = msgData.role;
          
          if (role !== 'user' && role !== 'assistant') continue;
          
          const timestamp = msgData.time?.created || row.time_created;
          
          let content = '';
          if (msgData.summary?.diffs && Array.isArray(msgData.summary.diffs)) {
            content = `[${msgData.summary.diffs.length} file changes]`;
          } else if (msgData.path) {
            content = msgData.path;
          }

          let inputTokens = 0;
          let outputTokens = 0;
          let modelName = 'opencode';
          
          if (msgData.tokens) {
            inputTokens = msgData.tokens.input || 0;
            outputTokens = msgData.tokens.output || 0;
          }
          
          if (msgData.model?.modelID) {
            modelName = msgData.model.modelID;
          } else if (msgData.modelID) {
            modelName = msgData.modelID;
          }

          const msg: Message = {
            id: `opencode-${sessionId}-${msgCounter++}`,
            role: role === 'user' ? 'user' : 'assistant',
            content: content,
            timestamp: timestamp,
            model: modelName,
            tokens: {
              input: inputTokens,
              output: outputTokens,
              cacheRead: msgData.tokens?.cacheRead || 0,
              cacheWrite: msgData.tokens?.cacheWrite || 0,
            },
          };
          messages.push(msg);
        } catch {
          // Skip invalid message data
        }
      }

    } catch (err) {
      // Query error
    } finally {
      db.close();
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
    if (rawName.includes('write') || rawName.includes('edit')) return 'Edit';
    if (rawName.includes('command') || rawName.includes('bash')) return 'Bash';
    if (rawName.includes('read') || rawName.includes('file')) return 'Read';
    if (rawName.includes('search') || rawName.includes('grep')) return 'Grep';
    if (rawName.includes('browser')) return 'Browser';
    return rawName.trim();
  }
}