// ─────────────────────────────────────────────────────────────
// AgentLens – Cursor Provider
// ─────────────────────────────────────────────────────────────

import { IProvider } from './base.js';
import type { Session, DateRange, Message, ToolUsage } from '../types/index.js';
import { accessSync, constants, statSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { openReadonly } from '../adapters/sqlite.js';
import { isWithinRange } from '../utils/dates.js';
import { getCursorDataDir, getCursorDataDirCandidates } from '../utils/paths.js';

const CHARS_PER_TOKEN = 4;

// ── Types for Cursor KV Data ────────────────────────────────

type BubbleRow = {
  input_tokens: number | null;
  output_tokens: number | null;
  model: string | null;
  created_at: string | null;
  conversation_id: string | null;
  user_text: string | null;
  text_length: number | null;
  bubble_type: number | null;
  code_blocks: string | null;
};

type AgentKvContent = {
  type?: string;
  text?: string;
  providerOptions?: {
    cursor?: {
      modelName?: string;
      requestId?: string;
    };
  };
};

type CodeBlock = { languageId?: string };

// ── Helper Functions ────────────────────────────────────────

function extractLanguages(codeBlocksJson: string | null): string[] {
  if (!codeBlocksJson) return [];
  try {
    const blocks = JSON.parse(codeBlocksJson) as CodeBlock[];
    if (!Array.isArray(blocks)) return [];
    const langs = new Set<string>();
    for (const block of blocks) {
      if (block.languageId && block.languageId !== 'plaintext') {
        langs.add(block.languageId);
      }
    }
    return [...langs];
  } catch {
    return [];
  }
}

function modelForDisplay(raw: string | null): string {
  if (!raw || raw === 'default') return 'cursor-auto';
  return raw;
}

function extractModelFromContent(content: AgentKvContent[]): string | null {
  for (const c of content) {
    if (c.providerOptions?.cursor?.modelName) {
      return c.providerOptions.cursor.modelName;
    }
  }
  return null;
}

function extractTextLength(content: AgentKvContent[]): number {
  let total = 0;
  for (const c of content) {
    if (c.text) total += c.text.length;
  }
  return total;
}

// ── SQL Queries ─────────────────────────────────────────────

const BUBBLE_QUERY_BASE = `
  SELECT
    json_extract(value, '$.tokenCount.inputTokens') as input_tokens,
    json_extract(value, '$.tokenCount.outputTokens') as output_tokens,
    json_extract(value, '$.modelInfo.modelName') as model,
    json_extract(value, '$.createdAt') as created_at,
    json_extract(value, '$.conversationId') as conversation_id,
    substr(json_extract(value, '$.text'), 1, 500) as user_text,
    length(json_extract(value, '$.text')) as text_length,
    json_extract(value, '$.type') as bubble_type,
    json_extract(value, '$.codeBlocks') as code_blocks
  FROM cursorDiskKV
  WHERE key LIKE 'bubbleId:%'
`;

const AGENTKV_QUERY = `
  SELECT
    key,
    json_extract(value, '$.role') as role,
    json_extract(value, '$.content') as content,
    json_extract(value, '$.providerOptions.cursor.requestId') as request_id,
    length(value) as content_length
  FROM cursorDiskKV
  WHERE key LIKE 'agentKv:blob:%'
    AND hex(substr(value, 1, 1)) = '7B'
  ORDER BY ROWID ASC
`;

const AGENTKV_STORE_QUERY = `
  SELECT
    id as key,
    CAST(data AS TEXT) as value
  FROM blobs
  WHERE CAST(data AS TEXT) LIKE '{"role":%'
  ORDER BY ROWID ASC
`;

const USER_MESSAGES_QUERY = `
  SELECT
    json_extract(value, '$.conversationId') as conversation_id,
    json_extract(value, '$.createdAt') as created_at,
    substr(json_extract(value, '$.text'), 1, 500) as text
  FROM cursorDiskKV
  WHERE key LIKE 'bubbleId:%'
    AND json_extract(value, '$.type') = 1
  ORDER BY ROWID ASC
`;

const USER_MESSAGES_STORE_QUERY = `
  SELECT
    json_extract(CAST(data AS TEXT), '$.conversationId') as conversation_id,
    json_extract(CAST(data AS TEXT), '$.createdAt') as created_at,
    substr(json_extract(CAST(data AS TEXT), '$.text'), 1, 500) as text
  FROM blobs
  WHERE CAST(data AS TEXT) LIKE '{"role":%'
    AND json_extract(CAST(data AS TEXT), '$.type') = 1
  ORDER BY ROWID ASC
`;

export class CursorProvider implements IProvider {
  readonly id = 'cursor';
  readonly name = 'Cursor';

  private getCursorRoots(): string[] {
    return Array.from(new Set([getCursorDataDir(), ...getCursorDataDirCandidates()]));
  }

  private getWorkspaceStoragePaths(): string[] {
    return this.getCursorRoots().map((root) => {
      if (root.endsWith('globalStorage')) return root;
      return join(root, 'User', 'globalStorage');
    });
  }

  isAvailable(): boolean {
    const hasVscdb = this.getWorkspaceStoragePaths().some((path) => this.isReadableDb(join(path, 'state.vscdb')));
    if (hasVscdb) return true;
    
    for (const root of this.getCursorRoots()) {
      const chatsDir = join(root, 'chats');
      if (existsSync(chatsDir)) return true;
    }
    
    return false;
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    const discovered = new Set<string>();
    
    // 1. Standard VS Code storage
    for (const workspaceStoragePath of this.getWorkspaceStoragePaths()) {
      const stateDbPath = join(workspaceStoragePath, 'state.vscdb');
      if (this.isReadableDb(stateDbPath)) {
        const db = await openReadonly(stateDbPath);
        if (!db) continue;
        try {
          // Discover unique conversation IDs
          const rows = db.prepare("SELECT DISTINCT json_extract(value, '$.conversationId') as cid FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").all() as any[];
          for (const row of rows) {
            if (row.cid) discovered.add(`${stateDbPath}::${row.cid}`);
          }
          // Also check agentKv for requestId
          const agentRows = db.prepare("SELECT DISTINCT json_extract(value, '$.providerOptions.cursor.requestId') as rid FROM cursorDiskKV WHERE key LIKE 'agentKv:blob:%'").all() as any[];
          for (const row of agentRows) {
            if (row.rid) discovered.add(`${stateDbPath}::${row.rid}`);
          }
        } catch { /* ignore */ }
        finally { db.close(); }
      }
    }

    // 2. Newer Cursor chats storage (store.db)
    for (const root of this.getCursorRoots()) {
      const chatsDir = join(root, 'chats');
      if (existsSync(chatsDir)) {
        try {
          const folders = readdirSync(chatsDir);
          for (const folder of folders) {
            const folderPath = join(chatsDir, folder);
            if (!statSync(folderPath).isDirectory()) continue;
            
            const subfolders = readdirSync(folderPath);
            for (const sub of subfolders) {
              const subPath = join(folderPath, sub);
              if (!statSync(subPath).isDirectory()) continue;
              
              const storeDbPath = join(subPath, 'store.db');
              if (this.isReadableDb(storeDbPath)) {
                const db = await openReadonly(storeDbPath);
                if (!db) continue;
                try {
                  // Discover unique request IDs in blobs
                  const rows = db.prepare("SELECT DISTINCT json_extract(CAST(data AS TEXT), '$.providerOptions.cursor.requestId') as rid FROM blobs WHERE CAST(data AS TEXT) LIKE '{\"%'").all() as any[];
                  for (const row of rows) {
                    if (row.rid) discovered.add(`${storeDbPath}::${row.rid}`);
                  }
                  // Fallback: if no rid found, use the UUID from path as session ID
                  if (discovered.size === 0) {
                    const uuid = basename(subPath);
                    discovered.add(`${storeDbPath}::${uuid}`);
                  }
                } catch { /* ignore */ }
                finally { db.close(); }
              }
            }
          }
        } catch { /* ignore */ }
      }
    }
    
    return Array.from(discovered);
  }

  async parseSession(identifier: string): Promise<Session> {
    const [dbPath, sessionId] = identifier.split('::');
    const db = await openReadonly(dbPath);
    if (!db) {
      throw new Error('SQLite not available or database could not be opened');
    }

    const messages: Message[] = [];
    let project = 'cursor';

    // Try to infer project from path if it's in ~/.cursor/projects
    if (dbPath.includes('.cursor/projects/')) {
      const parts = dbPath.split('.cursor/projects/')[1].split('/');
      if (parts.length > 0) {
        project = parts[0].replace(/Users-[\w-]+-Documents-/, '');
      }
    }

    try {
      // 1. Detect schema
      let hasVscdbSchema = false;
      let hasStoreSchema = false;
      try {
        db.prepare("SELECT COUNT(*) FROM cursorDiskKV LIMIT 1").get();
        hasVscdbSchema = true;
      } catch {
        try {
          db.prepare("SELECT COUNT(*) FROM blobs LIMIT 1").get();
          hasStoreSchema = true;
        } catch {
          throw new Error('Cursor storage format not recognized');
        }
      }

      if (hasVscdbSchema) {
        this.parseVscdb(db, messages, sessionId);
      } else if (hasStoreSchema) {
        this.parseStoreDb(db, messages, sessionId);
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

  private parseVscdb(db: any, messages: Message[], sessionId?: string) {
    try {
      const query = sessionId 
        ? BUBBLE_QUERY_BASE + ` AND json_extract(value, '$.conversationId') = ? ORDER BY ROWID ASC`
        : BUBBLE_QUERY_BASE + ' ORDER BY ROWID ASC';
      const rows = sessionId 
        ? db.prepare(query).all(sessionId) as BubbleRow[]
        : db.prepare(query).all() as BubbleRow[];
        
      for (const row of rows) {
        let inputTokens = row.input_tokens ?? 0;
        let outputTokens = row.output_tokens ?? 0;
        if (inputTokens === 0 && outputTokens === 0) {
          const textLen = row.text_length ?? 0;
          if (textLen > 0) {
            if (row.bubble_type === 1) inputTokens = Math.ceil(textLen / CHARS_PER_TOKEN);
            else outputTokens = Math.ceil(textLen / CHARS_PER_TOKEN);
          }
        }
        
        messages.push({
          id: row.conversation_id || `bubble-${Date.now()}`,
          role: row.bubble_type === 1 ? 'user' : 'assistant',
          content: row.user_text || '',
          timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
          model: modelForDisplay(row.model),
          tokens: { input: inputTokens, output: outputTokens, cacheRead: 0, cacheWrite: 0 },
        });
      }
    } catch { /* ignore */ }

    const agentQuery = sessionId
      ? AGENTKV_QUERY + ` AND json_extract(value, '$.providerOptions.cursor.requestId') = ?`
      : AGENTKV_QUERY;
    this.parseAgentKv(db, agentQuery, messages, sessionId);
  }

  private parseStoreDb(db: any, messages: Message[], sessionId?: string) {
    const query = sessionId
      ? AGENTKV_STORE_QUERY + ` AND json_extract(CAST(data AS TEXT), '$.providerOptions.cursor.requestId') = ?`
      : AGENTKV_STORE_QUERY;
    this.parseAgentKv(db, query, messages, sessionId);
  }

  private parseAgentKv(db: any, query: string, messages: Message[], sessionId?: string) {
    try {
      const rows = sessionId ? db.prepare(query).all(sessionId) as any[] : db.prepare(query).all() as any[];
      const sessions = new Map<string, { inputChars: number; outputChars: number; model: string | null; userText: string; timestamp: number }>();
      let currentRequestId = 'unknown';

      for (const row of rows) {
        if (!row.value) continue;
        let parsed: any;
        try { parsed = JSON.parse(row.value); } catch { continue; }

        if (!parsed.role || !parsed.content) continue;

        const content = Array.isArray(parsed.content) ? parsed.content : [];
        const requestId = row.request_id || parsed.providerOptions?.cursor?.requestId || currentRequestId;
        currentRequestId = requestId;

        const textLength = parsed.content_length || (typeof parsed.content === 'string' ? parsed.content.length : extractTextLength(content));
        const model = extractModelFromContent(content) || parsed.model;

        const existing = sessions.get(requestId) ?? { inputChars: 0, outputChars: 0, model: null, userText: '', timestamp: Date.now() };
        
        if (parsed.role === 'user') {
          existing.inputChars += textLength;
          if (!existing.userText) {
            const text = content[0]?.text ?? (typeof parsed.content === 'string' ? parsed.content : '');
            const queryMatch = text.match(/<user_query>([\s\S]*?)<\/user_query>/);
            existing.userText = queryMatch ? queryMatch[1].trim().slice(0, 500) : text.slice(0, 500);
          }
        } else if (parsed.role === 'assistant') {
          existing.outputChars += textLength;
          if (model) existing.model = model;
        } else {
          existing.inputChars += textLength;
        }
        
        if (parsed.createdAt) existing.timestamp = parsed.createdAt;
        sessions.set(requestId, existing);
      }

      for (const [requestId, session] of sessions) {
        if (session.inputChars === 0 && session.outputChars === 0) continue;
        messages.push({
          id: `composer-${requestId}`,
          role: 'assistant',
          content: session.userText,
          timestamp: session.timestamp,
          model: modelForDisplay(session.model),
          tokens: {
            input: Math.ceil(session.inputChars / CHARS_PER_TOKEN),
            output: Math.ceil(session.outputChars / CHARS_PER_TOKEN),
            cacheRead: 0,
            cacheWrite: 0,
          },
        });
      }
    } catch { /* ignore */ }
  }

  private isReadableDb(path: string): boolean {
    try {
      accessSync(path, constants.R_OK);
      return existsSync(path);
    } catch {
      return false;
    }
  }

  normalizeToolName(rawName: string): string {
    return rawName;
  }
}
