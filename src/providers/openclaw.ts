import { existsSync, readdirSync, statSync } from 'fs';
import { basename, dirname, join } from 'path';
import { IProvider } from './base.js';
import type { DateRange, Message, Session, ToolUsage } from '../types/index.js';
import { streamJsonlFile } from '../utils/fs-stream.js';
import { isWithinRange } from '../utils/dates.js';
import { getOpenClawAgentDirCandidates } from '../utils/paths.js';

const CHARS_PER_TOKEN = 4;

interface OpenClawEntry {
  id?: string;
  timestamp?: string | number;
  role?: string;
  type?: string;
  content?: string;
  text?: string;
  message?: string;
  tool?: {
    name?: string;
    input?: unknown;
    output?: string;
    isError?: boolean;
  };
  tools?: Array<{
    name?: string;
    input?: unknown;
    output?: string;
    isError?: boolean;
  }>;
}

const TOOL_NAME_MAP: Record<string, string> = {
  read_file: 'Read',
  write_file: 'Write',
  create_file: 'Write',
  edit_file: 'Edit',
  apply_patch: 'Edit',
  delete_file: 'Delete',
  list_dir: 'Glob',
  find_files: 'Glob',
  search_files: 'Grep',
  grep: 'Grep',
  run_command: 'Bash',
  bash: 'Bash',
  web_search: 'WebSearch',
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function extractContent(entry: OpenClawEntry): string {
  return entry.content || entry.text || entry.message || '';
}

function extractTimestamp(entry: OpenClawEntry): number {
  if (typeof entry.timestamp === 'number') return entry.timestamp;
  if (typeof entry.timestamp === 'string') {
    const parsed = new Date(entry.timestamp).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

export class OpenClawProvider implements IProvider {
  readonly id = 'openclaw';
  readonly name = 'OpenClaw';

  private getRoots(): string[] {
    const envRoot = process.env.AGENTLENS_OPENCLAW_DIR?.trim();
    return Array.from(new Set([...(envRoot ? [envRoot] : []), ...getOpenClawAgentDirCandidates()]));
  }

  isAvailable(): boolean {
    return this.getRoots().some((root) => existsSync(root));
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    const discovered = new Set<string>();
    for (const root of this.getRoots()) {
      for (const file of this.findJsonlFiles(root)) {
        try {
          const stats = statSync(file);
          if (!dateRange || isWithinRange(stats.mtimeMs, dateRange)) {
            discovered.add(file);
          }
        } catch {
          // ignore unreadable files
        }
      }
    }
    return Array.from(discovered);
  }

  async parseSession(identifier: string): Promise<Session> {
    const messages: Message[] = [];
    const project = basename(dirname(identifier));
    let sessionTimestamp = Date.now();

    for await (const entry of streamJsonlFile<OpenClawEntry>(identifier)) {
      const role = (entry.role || entry.type || '').toLowerCase();
      if (!role) continue;
      const content = extractContent(entry);
      if (!content.trim()) continue;
      const timestamp = extractTimestamp(entry);
      if (messages.length === 0) sessionTimestamp = timestamp;

      const tools: ToolUsage[] = [];
      if (entry.tool?.name) {
        tools.push({
          name: this.normalizeToolName(entry.tool.name),
          input: (entry.tool.input as Record<string, unknown>) ?? {},
          output: entry.tool.output,
          outputLength: entry.tool.output?.length ?? 0,
          isError: entry.tool.isError,
        });
      }
      for (const tool of entry.tools ?? []) {
        if (!tool?.name) continue;
        tools.push({
          name: this.normalizeToolName(tool.name),
          input: (tool.input as Record<string, unknown>) ?? {},
          output: tool.output,
          outputLength: tool.output?.length ?? 0,
          isError: tool.isError,
        });
      }

      messages.push({
        id: entry.id || `openclaw-${messages.length}`,
        role: role === 'assistant' ? 'assistant' : role === 'system' ? 'system' : 'user',
        content,
        timestamp,
        tokens: { input: estimateTokens(content), output: 0, cacheRead: 0, cacheWrite: 0 },
        tools: tools.length > 0 ? tools : undefined,
      });
    }

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
    return TOOL_NAME_MAP[rawName] ?? rawName;
  }

  private findJsonlFiles(dir: string, depth = 0): string[] {
    if (!dir || !existsSync(dir) || depth > 8) return [];
    const results: string[] = [];
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    } catch {
      return results;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.findJsonlFiles(fullPath, depth + 1));
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
    return results;
  }
}
