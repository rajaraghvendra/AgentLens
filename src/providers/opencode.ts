// ─────────────────────────────────────────────────────────────
// AgentLens – Opencode Provider (SQLite)
// ─────────────────────────────────────────────────────────────

import { IProvider } from './base.js';
import type { Session, DateRange, Message, ToolUsage } from '../types/index.js';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { openReadonly } from '../adapters/sqlite.js';
import { getOpencodeDataDir, getOpencodeDataDirCandidates, getPathLeaf } from '../utils/paths.js';

// ── Message-level JSON shapes ───────────────────────────────

interface OpencodeMessageData {
  role: string;
  time?: { created: number; completed?: number };
  parentID?: string;
  agent?: string;
  mode?: string;
  modelID?: string;
  providerID?: string;
  model?: { providerID: string; modelID: string };
  path?: { cwd?: string; root?: string } | string;
  cost?: number;
  tokens?: {
    total?: number;
    input: number;
    output: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
    // Flat fallback layout used by some older versions
    cacheRead?: number;
    cacheWrite?: number;
  };
  finish?: string | { reason: string };
  summary?: {
    diffs?: Array<{
      file: string;
      additions?: number;
      deletions?: number;
      status?: string;
    }>;
  };
  variant?: string;
  content?: string;
  text?: string;
}

// ── Part-level JSON shapes ──────────────────────────────────

interface OpencodePartBase {
  type: string;
}

interface OpencodeTextPart extends OpencodePartBase {
  type: 'text';
  text: string;
  time?: { start?: number; end?: number };
}

interface OpencodeToolPart extends OpencodePartBase {
  type: 'tool';
  callID: string;
  tool: string;
  state: {
    status: string;
    input?: Record<string, unknown>;
    output?: string;
    title?: string;
    metadata?: {
      output?: string;
      exit?: number;
      description?: string;
      truncated?: boolean;
      preview?: string;
      loaded?: unknown[];
    };
    time?: { start?: number; end?: number };
  };
}

interface OpencodeFilePart extends OpencodePartBase {
  type: 'file';
  mime?: string;
  filename?: string;
  url?: string;
  source?: {
    type?: string;
    path?: string;
    text?: { value?: string; start?: number; end?: number };
  };
}

interface OpencodePatchPart extends OpencodePartBase {
  type: 'patch';
  hash?: string;
  files?: string[];
}

interface OpencodeReasoningPart extends OpencodePartBase {
  type: 'reasoning';
  text?: string;
  time?: { start?: number; end?: number };
}

type OpencodePart =
  | OpencodeTextPart
  | OpencodeToolPart
  | OpencodeFilePart
  | OpencodePatchPart
  | OpencodeReasoningPart
  | OpencodePartBase; // catch-all for step-start, step-finish, agent, etc.

// ── Tool name normalization map ─────────────────────────────

const TOOL_NAME_MAP: Record<string, string> = {
  'bash': 'Bash',
  'read': 'Read',
  'write': 'Write',
  'edit': 'Edit',
  'glob': 'Glob',
  'grep': 'Grep',
  'codesearch': 'Grep',
  'webfetch': 'WebFetch',
  'websearch': 'WebSearch',
  'fetch': 'WebFetch',
  'search': 'WebSearch',
  'task': 'Agent',
  'todowrite': 'TodoWrite',
  'todo': 'TodoWrite',
  'apply_patch': 'Edit',
  'patch': 'Edit',
  'question': 'Question',
  'skill': 'Skill',
  'invalid': 'Invalid',
};

// ── Timestamp normalization ─────────────────────────────────
// OpenCode may store timestamps in seconds or milliseconds;
// normalize to milliseconds for consistency with other providers.
function normalizeTimestamp(raw: number): number {
  return raw < 1e12 ? raw * 1000 : raw;
}

// ── DB file discovery ───────────────────────────────────────
// OpenCode can produce multiple database files (e.g. opencode.db,
// opencode-shard-*.db). Scan the data directory for all matching
// files, matching CodeBurn's behaviour.
function findDbFilesInDir(dir: string): string[] {
  try {
    const entries = readdirSync(dir);
    return entries
      .filter((f) => f.startsWith('opencode') && f.endsWith('.db'))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

// ── Schema validation ───────────────────────────────────────
// Guard against opening a database that doesn't have the expected
// opencode schema (e.g. a corrupt or incompatible version).
function validateSchema(db: { prepare(sql: string): { get(...p: unknown[]): unknown } }): boolean {
  try {
    db.prepare("SELECT COUNT(*) as cnt FROM session LIMIT 1").get();
    db.prepare("SELECT COUNT(*) as cnt FROM message LIMIT 1").get();
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────

export class OpencodeProvider implements IProvider {
  readonly id = 'opencode';
  readonly name = 'Opencode (Deepmind)';

  /**
   * Collect all candidate DB file paths from every data-dir candidate.
   * Deduplicates and returns only existing files.
   */
  private getDbPaths(): string[] {
    const candidates = new Set<string>();

    // Primary data dir
    const primaryDir = getOpencodeDataDir();
    for (const f of findDbFilesInDir(primaryDir)) {
      candidates.add(f);
    }

    // All additional candidate dirs
    for (const dir of getOpencodeDataDirCandidates()) {
      for (const f of findDbFilesInDir(dir)) {
        candidates.add(f);
      }
    }

    // Filter to files that actually exist (findDbFilesInDir already
    // reads the directory, but guard against race conditions).
    return Array.from(candidates).filter((p) => existsSync(p));
  }

  isAvailable(): boolean {
    return this.getDbPaths().length > 0;
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    if (!this.isAvailable()) return [];

    const discovered = new Set<string>();

    for (const dbPath of this.getDbPaths()) {
      const db = await openReadonly(dbPath);
      if (!db) continue;

      try {
        if (!validateSchema(db)) continue;

        // Filter out archived sessions to avoid deleted data.
        // We do NOT filter out sub-agent sessions (parent_id) because
        // sub-agent messages are isolated to their own session records.
        const rows = db.prepare(`
          SELECT id, project_id, time_created 
          FROM session 
          WHERE time_archived IS NULL
          ORDER BY time_created DESC
          LIMIT 1000
        `).all() as Array<{ id: string; project_id: string; time_created: number }>;

        for (const row of rows) {
          const ts = normalizeTimestamp(row.time_created);
          if (dateRange) {
            if (ts >= dateRange.from && ts <= dateRange.to) {
              discovered.add(`${dbPath}::${row.id}`);
            }
          } else {
            discovered.add(`${dbPath}::${row.id}`);
          }
        }
      } catch {
        // Query error — skip this DB
      } finally {
        db.close();
      }
    }

    return Array.from(discovered);
  }

  async parseSession(identifier: string): Promise<Session> {
    // We use '::' as the separator between dbPath and sessionId.
    // This is safe on Windows because '::' never appears in file
    // paths (unlike single ':', which is the drive letter separator).
    const separatorIdx = identifier.indexOf('::');
    let dbPath: string;
    let sessionId: string;
    if (separatorIdx >= 0) {
      dbPath = identifier.substring(0, separatorIdx);
      sessionId = identifier.substring(separatorIdx + 2);
    } else {
      // Fallback: assume it's just a session ID
      const paths = this.getDbPaths();
      dbPath = paths[0] || join(getOpencodeDataDir(), 'opencode.db');
      sessionId = identifier;
    }

    const db = await openReadonly(dbPath);
    if (!db) {
      throw new Error('Cannot open Opencode database');
    }

    const messages: Message[] = [];
    let project = 'opencode-workspace';
    let sessionTimestamp = Date.now();

    try {
      if (!validateSchema(db)) {
        throw new Error('OpenCode storage format not recognized');
      }

      // ── 1. Session metadata ─────────────────────────────────
      const sessionRow = db.prepare(`
        SELECT time_created, directory, title FROM session WHERE id = ?
      `).get(sessionId) as { time_created: number; directory: string; title: string } | undefined;
      
      if (sessionRow) {
        sessionTimestamp = normalizeTimestamp(sessionRow.time_created);
        // Use directory as project, fallback to title
        if (sessionRow.directory) {
          project = getPathLeaf(sessionRow.directory) || sessionRow.title || 'opencode';
        } else {
          project = sessionRow.title || 'opencode';
        }
      }

      // ── 2. Fetch all message rows for this session ──────────
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

      // ── 3. Fetch ALL parts for this session in one query ────
      //    The part table has an index on (session_id) so this is
      //    efficient even for large sessions.
      const partRows = db.prepare(`
        SELECT message_id, data
        FROM part
        WHERE session_id = ?
        ORDER BY time_created ASC
      `).all(sessionId) as Array<{
        message_id: string;
        data: string;
      }>;

      // Group parts by message_id for O(1) lookup
      const partsByMessage = new Map<string, OpencodePart[]>();
      for (const pr of partRows) {
        if (!pr.data) continue;
        try {
          const parsed = JSON.parse(pr.data) as OpencodePart;
          const existing = partsByMessage.get(pr.message_id) || [];
          existing.push(parsed);
          partsByMessage.set(pr.message_id, existing);
        } catch {
          // Skip invalid part data
        }
      }

      // ── 4. Build Message objects ────────────────────────────
      let msgCounter = 0;
      for (const row of messageRows) {
        if (!row.data) continue;
        
        try {
          const msgData: OpencodeMessageData = JSON.parse(row.data);
          const role = msgData.role;
          
          if (role !== 'user' && role !== 'assistant') continue;
          
          const timestamp = normalizeTimestamp(msgData.time?.created || row.time_created);
          const parts = partsByMessage.get(row.id) || [];

          // ── Content: assemble from text parts ───────────────
          let content = '';
          const textParts = parts.filter((p): p is OpencodeTextPart => p.type === 'text' && !!(p as OpencodeTextPart).text);
          if (textParts.length > 0) {
            content = textParts.map(tp => tp.text).join('\n');
          }

          // Fallback: if no text parts, try summary diffs or path
          if (!content) {
            if (msgData.summary?.diffs && Array.isArray(msgData.summary.diffs)) {
              const fileNames = msgData.summary.diffs.map(d => d.file).filter(Boolean);
              content = `[${msgData.summary.diffs.length} file changes: ${fileNames.join(', ')}]`;
            } else if (typeof msgData.path === 'string') {
              content = msgData.path;
            }
          }

          // ── Tokens ──────────────────────────────────────────
          let inputTokens = 0;
          let outputTokens = 0;
          let cacheReadTokens = 0;
          let cacheWriteTokens = 0;
          
          if (msgData.tokens) {
            inputTokens = msgData.tokens.input || 0;
            outputTokens = msgData.tokens.output || 0;
            // OpenCode stores cache under a nested `cache` object
            cacheReadTokens = msgData.tokens.cache?.read || msgData.tokens.cacheRead || 0;
            cacheWriteTokens = msgData.tokens.cache?.write || msgData.tokens.cacheWrite || 0;
          }

          // Skip assistant messages with zero tokens and zero cost
          // (these are typically system/internal messages)
          if (role === 'assistant') {
            const allZero = inputTokens === 0 && outputTokens === 0 &&
                            cacheReadTokens === 0 && cacheWriteTokens === 0;
            if (allZero && (msgData.cost ?? 0) === 0) continue;
          }

          // ── Model ───────────────────────────────────────────
          let modelName = 'opencode';
          if (msgData.model?.modelID) {
            modelName = msgData.model.modelID;
          } else if (msgData.modelID) {
            modelName = msgData.modelID;
          }

          // ── Tools: extract from parts with type "tool" ──────
          const toolParts = parts.filter((p): p is OpencodeToolPart => p.type === 'tool');
          const tools: ToolUsage[] = [];
          for (const tp of toolParts) {
            const toolInput = tp.state?.input || {};
            const toolOutput = tp.state?.output || tp.state?.metadata?.output || '';
            const isError = tp.state?.status === 'error' ||
                            (tp.state?.metadata?.exit !== undefined && tp.state.metadata.exit !== 0);

            tools.push({
              name: this.normalizeToolName(tp.tool || ''),
              input: toolInput,
              output: typeof toolOutput === 'string' ? toolOutput : String(toolOutput),
              outputLength: typeof toolOutput === 'string' ? toolOutput.length : 0,
              isError,
            });
          }

          // ── File parts: treat attached files as implicit tool uses
          const fileParts = parts.filter((p): p is OpencodeFilePart => p.type === 'file');
          for (const fp of fileParts) {
            const filePath = fp.source?.path || fp.url || fp.filename || '';
            tools.push({
              name: 'Read',
              input: { filePath },
              output: `Attached file: ${fp.filename || filePath}`,
              outputLength: 0,
              isError: false,
            });
          }

          const msg: Message = {
            id: `opencode-${sessionId}-${msgCounter++}`,
            role: role === 'user' ? 'user' : 'assistant',
            content,
            timestamp,
            model: modelName,
            tokens: {
              input: inputTokens,
              output: outputTokens,
              cacheRead: cacheReadTokens,
              cacheWrite: cacheWriteTokens,
            },
          };

          if (tools.length > 0) {
            msg.tools = tools;
          }

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
    // Try exact match first (opencode uses lowercase tool names)
    if (TOOL_NAME_MAP[rawName]) return TOOL_NAME_MAP[rawName];
    // Try lowercase match
    const lower = rawName.toLowerCase();
    if (TOOL_NAME_MAP[lower]) return TOOL_NAME_MAP[lower];
    // Heuristic fallback for unknown tool names
    if (lower.includes('write') || lower.includes('edit') || lower.includes('patch')) return 'Edit';
    if (lower.includes('command') || lower.includes('bash')) return 'Bash';
    if (lower.includes('read') || lower.includes('file')) return 'Read';
    if (lower.includes('search') || lower.includes('grep')) return 'Grep';
    if (lower.includes('browser')) return 'Browser';
    return rawName.trim();
  }
}
