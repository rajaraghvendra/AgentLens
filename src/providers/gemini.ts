// ─────────────────────────────────────────────────────────────
// AgentLens – Gemini CLI Provider
// ─────────────────────────────────────────────────────────────

import { IProvider } from './base.js';
import type { Session, DateRange, Message, ToolUsage } from '../types/index.js';
import { existsSync, statSync, readdirSync, readFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import config from '../config/env.js';
import { streamJsonlFile } from '../utils/fs-stream.js';
import { isWithinRange } from '../utils/dates.js';
import { getGeminiDataDirCandidates, getPathLeaf } from '../utils/paths.js';

// ── Gemini CLI session shapes ──────────────────────────────

interface GeminiTokenUsage {
  input?: number;
  output?: number;
  cached?: number;
  thoughts?: number;
  tool?: number;
  total?: number;
}

interface GeminiToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status?: string;
  displayName?: string;
}

interface GeminiMessageEntry {
  id: string;
  timestamp: string;
  type: 'user' | 'gemini' | 'info';
  content: string | Array<{ text: string }>;
  tokens?: GeminiTokenUsage;
  model?: string;
  toolCalls?: GeminiToolCall[];
  thoughts?: unknown[];
}

interface GeminiSessionHeader {
  sessionId: string;
  projectHash?: string;
  startTime: string;
  lastUpdated?: string;
  kind?: string;
}

// ── Tool name normalization map ─────────────────────────────

const TOOL_NAME_MAP: Record<string, string> = {
  'read_file': 'Read',
  'ReadFile': 'Read',
  'read': 'Read',
  'Read': 'Read',
  'write_file': 'Write',
  'WriteFile': 'Write',
  'create_file': 'Write',
  'CreateFile': 'Write',
  'write': 'Write',
  'Write': 'Write',
  'edit_file': 'Edit',
  'EditFile': 'Edit',
  'edit': 'Edit',
  'Edit': 'Edit',
  'apply_diff': 'Edit',
  'apply_patch': 'Edit',
  'delete_file': 'Delete',
  'DeleteFile': 'Delete',
  'list_dir': 'Glob',
  'ListDir': 'Glob',
  'openFolders': 'Glob',
  'grep_search': 'Grep',
  'SearchText': 'Grep',
  'search_files': 'Grep',
  'find_files': 'Glob',
  'FindFiles': 'Glob',
  'run_command': 'Bash',
  'Shell': 'Bash',
  'bash': 'Bash',
  'Bash': 'Bash',
  'shell': 'Bash',
  'run': 'Bash',
  'web_search': 'WebSearch',
  'WebSearch': 'WebSearch',
  'todo_list': 'Task',
  'task': 'Task',
  'Task': 'Task',
  'spawn_agent': 'Agent',
  'close_agent': 'Agent',
};

function estimateTokensFromContent(content: string): number {
  return Math.ceil(content.length / 4);
}

function extractTextContent(content: string | Array<{ text: string }>): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(c => c.text).join('\n');
  }
  return '';
}

function extractToolNamesFromContent(content: string): string[] {
  const tools: string[] = [];
  const regex = /<tool_use>\s*<name>([^<]+)<\/name>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1].trim();
    tools.push(TOOL_NAME_MAP[name] ?? name);
  }
  return tools;
}

export class GeminiProvider implements IProvider {
  readonly id = 'gemini';
  readonly name = 'Gemini CLI';

  private sessionsDir = config.geminiDir;

  private getSessionDirs(): string[] {
    return Array.from(new Set([
      this.sessionsDir,
      ...getGeminiDataDirCandidates(),
    ]));
  }

  isAvailable(): boolean {
    for (const dir of this.getSessionDirs()) {
      try {
        if (existsSync(dir)) return true;
      } catch {
        // continue
      }
    }
    return false;
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    if (!this.isAvailable()) return [];

    const discovered = new Set<string>();

    for (const tmpDir of this.getSessionDirs()) {
      try {
        // tmpDir is like ~/.gemini/tmp
        // Look for project subdirectories
        let projectDirs: string[];
        try {
          const entries = readdirSync(tmpDir, { withFileTypes: true });
          projectDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
        } catch { continue; }

        for (const project of projectDirs) {
          const chatsDir = join(tmpDir, project, 'chats');
          try { if (!statSync(chatsDir).isDirectory()) continue; } catch { continue; }

          let files: string[];
          try { files = readdirSync(chatsDir); } catch { continue; }

          for (const file of files) {
            if (!file.startsWith('session-') || (!file.endsWith('.json') && !file.endsWith('.jsonl'))) continue;

            const filePath = join(chatsDir, file);

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

  private parseSingleJson(raw: string): GeminiSessionHeader & { messages: GeminiMessageEntry[] } | null {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.messages && parsed.sessionId) {
        return parsed;
      }
    } catch {
      // Not single JSON
    }
    return null;
  }

  private parseJsonl(raw: string): (GeminiSessionHeader & { messages: GeminiMessageEntry[] }) | null {
    const lines = raw.split('\n').filter(l => l.trim());
    if (lines.length === 0) return null;

    let sessionId = '';
    let startTime = '';
    let projectHash: string | undefined;
    let lastUpdated: string | undefined;
    let kind: string | undefined;
    const messages: GeminiMessageEntry[] = [];

    for (const line of lines) {
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }

      // Skip $set entries (MongoDB update format)
      if (obj['$set'] !== undefined) continue;

      if (obj['sessionId'] && obj['startTime'] && !sessionId) {
        sessionId = obj['sessionId'] as string;
        startTime = obj['startTime'] as string;
        projectHash = obj['projectHash'] as string | undefined;
        lastUpdated = obj['lastUpdated'] as string | undefined;
        kind = obj['kind'] as string | undefined;
      } else if (obj['id'] && obj['type']) {
        messages.push(obj as unknown as GeminiMessageEntry);
      }
    }

    if (!sessionId) return null;

    return { sessionId, projectHash, startTime, lastUpdated, kind, messages };
  }

  async parseSession(identifier: string): Promise<Session> {
    const messages: Message[] = [];
    let project = 'default-project';
    let sessionTimestamp = Date.now();
    let sessionModel = 'gemini-auto';

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

    // Try single JSON first (Gemini CLI <=0.38), then JSONL (>=0.39)
    let data = this.parseSingleJson(raw);
    if (!data) {
      data = this.parseJsonl(raw);
    }

    if (!data || !data.messages || !data.sessionId) {
      return {
        id: identifier,
        provider: this.id,
        project,
        timestamp: sessionTimestamp,
        durationMs: 0,
        messages: [],
      };
    }

    // Extract project from filename if not available
    project = basename(dirname(dirname(dirname(identifier))));
    if (data.projectHash && data.projectHash !== project) {
      project = data.projectHash;
    }

    // Parse session timestamp
    if (data.startTime) {
      const tsDate = new Date(data.startTime);
      if (!isNaN(tsDate.getTime()) && tsDate.getTime() >= 1_000_000_000_000) {
        sessionTimestamp = tsDate.getTime();
      }
    }

    // Process messages
    let cumulativeInput = 0;
    let cumulativeOutput = 0;
    let cumulativeCached = 0;
    let cumulativeThoughts = 0;
    const allTools: ToolUsage[] = [];
    let lastUserTimestamp = sessionTimestamp;

    for (const msg of data.messages) {
      if (msg.type === 'user') {
        const textContent = extractTextContent(msg.content);
        if (textContent.startsWith('<identity>')) continue;

        lastUserTimestamp = new Date(msg.timestamp).getTime() || lastUserTimestamp + 1000;

        messages.push({
          id: msg.id || `gemini-user-${messages.length}`,
          role: 'user',
          content: textContent,
          timestamp: lastUserTimestamp,
          tokens: {
            input: msg.tokens?.input ? msg.tokens.input - (msg.tokens.cached ?? 0) : 0,
            output: 0,
            cacheRead: msg.tokens?.cached ?? 0,
            cacheWrite: 0,
          },
        });
        continue;
      }

      if (msg.type === 'gemini') {
        const textContent = typeof msg.content === 'string'
          ? msg.content.replace(/<tool_use>[\s\S]*?<\/tool_use>/g, '').trim()
          : extractTextContent(msg.content);

        if (msg.model) {
          sessionModel = msg.model;
        }

        // Accumulate token counts
        if (msg.tokens) {
          cumulativeInput += msg.tokens.input ?? 0;
          cumulativeOutput += (msg.tokens.output ?? 0) + (msg.tokens.thoughts ?? 0);
          cumulativeCached += msg.tokens.cached ?? 0;
          cumulativeThoughts += msg.tokens.thoughts ?? 0;
        }

        // Extract tool calls
        const toolUsages: ToolUsage[] = [];

        // From structured toolCalls array
        if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
          for (const tc of msg.toolCalls) {
            const mappedName = this.normalizeToolName(tc.displayName ?? '') || this.normalizeToolName(tc.name);
            const cmd = (typeof tc.args?.command === 'string') ? tc.args.command.split(/\s+/)[0] : '';

            toolUsages.push({
              name: mappedName,
              input: tc.args ?? {},
              output: tc.status === 'error' ? undefined : '',
              isError: tc.status === 'error',
            });

            if (mappedName === 'Bash' && cmd) {
              allTools.push({ name: 'Bash', input: { command: cmd } });
            }
          }
        }

        // From content XML tags
        const contentTools = extractToolNamesFromContent(typeof msg.content === 'string' ? msg.content : '');
        for (const toolName of contentTools) {
          if (!toolUsages.find(t => t.name === toolName)) {
            toolUsages.push({ name: toolName, input: {} });
          }
        }

        const msgTimestamp = new Date(msg.timestamp).getTime() || sessionTimestamp + messages.length * 1000;

        messages.push({
          id: msg.id || `gemini-gemini-${messages.length}`,
          role: 'assistant',
          content: textContent,
          timestamp: msgTimestamp,
          model: sessionModel,
          tokens: msg.tokens ? {
            input: msg.tokens.input ? msg.tokens.input - (msg.tokens.cached ?? 0) : 0,
            output: (msg.tokens.output ?? 0) + (msg.tokens.thoughts ?? 0),
            cacheRead: msg.tokens.cached ?? 0,
            cacheWrite: 0,
          } : {
            input: 0,
            output: textContent ? estimateTokensFromContent(textContent) : 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
          tools: toolUsages.length > 0 ? toolUsages : undefined,
        });
        continue;
      }
    }

    messages.sort((a, b) => a.timestamp - b.timestamp);

    const firstTimestamp = messages[0]?.timestamp || sessionTimestamp;
    const lastTimestamp = messages[messages.length - 1]?.timestamp || firstTimestamp;

    // Calculate duration from session metadata if available
    let durationMs = lastTimestamp - firstTimestamp;
    if (data.startTime && data.lastUpdated) {
      const start = new Date(data.startTime).getTime();
      const end = new Date(data.lastUpdated).getTime();
      if (!isNaN(start) && !isNaN(end) && end > start) {
        durationMs = end - start;
      }
    }

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
}
