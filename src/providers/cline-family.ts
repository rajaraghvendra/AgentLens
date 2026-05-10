import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, dirname, join } from 'path';
import type { DateRange, Message, Session, TokenUsage, ToolUsage } from '../types/index.js';
import { isWithinRange } from '../utils/dates.js';
import { getVSCodeWorkspaceStorageDirCandidates } from '../utils/paths.js';

const CHARS_PER_TOKEN = 4;

const TOOL_NAME_MAP: Record<string, string> = {
  readFile: 'Read',
  read_file: 'Read',
  writeFile: 'Edit',
  write_file: 'Edit',
  editFile: 'Edit',
  edit_file: 'Edit',
  createFile: 'Write',
  create_file: 'Write',
  deleteFile: 'Delete',
  delete_file: 'Delete',
  listDir: 'Glob',
  list_dir: 'Glob',
  openFolders: 'Glob',
  runCommand: 'Bash',
  run_command: 'Bash',
  bash: 'Bash',
  searchFiles: 'Grep',
  search_files: 'Grep',
  findFiles: 'Glob',
  find_files: 'Glob',
  webSearch: 'WebSearch',
  web_search: 'WebSearch',
};

interface ClineEntry {
  id?: string;
  type?: string;
  role?: string;
  text?: string;
  content?: string;
  message?: string;
  timestamp?: string | number;
  ts?: string | number;
  model?: string;
  modelId?: string;
  toolName?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
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

interface PendingApiContext {
  model?: string;
  tokens?: TokenUsage;
  tools?: ToolUsage[];
  timestamp: number;
}

export function normalizeClineFamilyToolName(rawName: string): string {
  return TOOL_NAME_MAP[rawName] ?? rawName;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function extractText(entry: ClineEntry): string {
  if (typeof entry.text === 'string') return entry.text;
  if (typeof entry.content === 'string') return entry.content;
  if (typeof entry.message === 'string') return entry.message;
  return '';
}

function extractTimestamp(entry: ClineEntry): number {
  const raw = entry.timestamp ?? entry.ts;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const parsed = new Date(raw).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function extractUsage(usage: ClineEntry['usage']): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
    cacheRead: usage.cache_read_input_tokens || 0,
    cacheWrite: usage.cache_creation_input_tokens || 0,
  };
}

function extractToolsFromText(text: string): ToolUsage[] {
  const tools: ToolUsage[] = [];
  const regex = /<tool_use>\s*<name>([^<]+)<\/name>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1].trim();
    tools.push({ name: normalizeClineFamilyToolName(name), input: {} });
  }
  return tools;
}

function extractToolUsages(entry: ClineEntry): ToolUsage[] {
  const tools: ToolUsage[] = [];

  if (entry.toolName) {
    tools.push({ name: normalizeClineFamilyToolName(entry.toolName), input: {} });
  }

  if (entry.tool?.name) {
    tools.push({
      name: normalizeClineFamilyToolName(entry.tool.name),
      input: (entry.tool.input as Record<string, unknown>) ?? {},
      output: entry.tool.output,
      outputLength: entry.tool.output?.length ?? 0,
      isError: entry.tool.isError,
    });
  }

  for (const tool of entry.tools ?? []) {
    if (!tool?.name) continue;
    tools.push({
      name: normalizeClineFamilyToolName(tool.name),
      input: (tool.input as Record<string, unknown>) ?? {},
      output: tool.output,
      outputLength: tool.output?.length ?? 0,
      isError: tool.isError,
    });
  }

  for (const tool of extractToolsFromText(extractText(entry))) {
    if (!tools.some((existing) => existing.name === tool.name)) {
      tools.push(tool);
    }
  }

  return tools;
}

function isUserEntry(entry: ClineEntry): boolean {
  const kind = (entry.type || entry.role || '').toLowerCase();
  return kind === 'human' || kind === 'user';
}

function isAssistantEntry(entry: ClineEntry): boolean {
  const kind = (entry.type || entry.role || '').toLowerCase();
  return kind === 'assistant' || kind === 'bot' || kind === 'ai';
}

function isApiReqStarted(entry: ClineEntry): boolean {
  return (entry.type || '').toLowerCase() === 'api_req_started';
}

function inferProjectName(identifier: string): string {
  const parent = basename(dirname(identifier));
  if (parent && parent !== 'tasks' && parent !== 'ui_messages.json') return parent;
  return basename(dirname(dirname(identifier))) || 'default-project';
}

function readEntries(identifier: string): ClineEntry[] {
  try {
    const raw = readFileSync(identifier, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as ClineEntry[];
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { messages?: unknown[] }).messages)) {
      return (parsed as { messages: ClineEntry[] }).messages;
    }
  } catch {
    // ignore
  }
  return [];
}

function enrichAssistantMessage(message: Message, context: PendingApiContext): void {
  if (context.model && !message.model) message.model = context.model;
  if (context.tokens && !message.tokens) message.tokens = context.tokens;
  if (context.tools && context.tools.length > 0 && (!message.tools || message.tools.length === 0)) {
    message.tools = context.tools;
  }
}

export async function parseClineFamilySession(identifier: string, providerId: string): Promise<Session> {
  const entries = readEntries(identifier);
  const project = inferProjectName(identifier);
  const messages: Message[] = [];
  const pending: PendingApiContext[] = [];
  let sessionTimestamp = Date.now();

  for (const entry of entries) {
    const timestamp = extractTimestamp(entry);
    if (messages.length === 0) sessionTimestamp = timestamp;

    if (isApiReqStarted(entry)) {
      const context: PendingApiContext = {
        model: entry.modelId || entry.model,
        tokens: extractUsage(entry.usage),
        tools: extractToolUsages(entry),
        timestamp,
      };
      const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
      if (lastAssistant && (!lastAssistant.tokens || !lastAssistant.model || !lastAssistant.tools?.length)) {
        enrichAssistantMessage(lastAssistant, context);
      } else {
        pending.push(context);
      }
      continue;
    }

    if (isUserEntry(entry)) {
      const content = extractText(entry);
      if (!content.trim()) continue;
      messages.push({
        id: entry.id || `cline-user-${messages.length}`,
        role: 'user',
        content,
        timestamp,
        tokens: { input: estimateTokens(content), output: 0, cacheRead: 0, cacheWrite: 0 },
      });
      continue;
    }

    if (isAssistantEntry(entry)) {
      const content = extractText(entry);
      if (!content.trim()) continue;
      const context = pending.shift();
      const tools = extractToolUsages(entry);
      const message: Message = {
        id: entry.id || `cline-assistant-${messages.length}`,
        role: 'assistant',
        content,
        timestamp,
        model: entry.modelId || entry.model || context?.model,
        tokens: extractUsage(entry.usage) || context?.tokens || { input: estimateTokens(content), output: 0, cacheRead: 0, cacheWrite: 0 },
        tools: tools.length > 0 ? tools : context?.tools,
      };
      messages.push(message);
    }
  }

  const firstTimestamp = messages[0]?.timestamp || sessionTimestamp;
  const lastTimestamp = messages[messages.length - 1]?.timestamp || firstTimestamp;

  return {
    id: identifier,
    provider: providerId,
    project,
    timestamp: firstTimestamp,
    durationMs: lastTimestamp - firstTimestamp,
    messages,
  };
}

function walkForUiMessages(dir: string, keywords: RegExp[], dateRange?: DateRange, depth = 0, results: string[] = []): string[] {
  if (depth > 6) return results;
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkForUiMessages(fullPath, keywords, dateRange, depth + 1, results);
      continue;
    }

    if (!entry.isFile() || entry.name !== 'ui_messages.json') continue;
    const normalized = fullPath.replace(/\\/g, '/').toLowerCase();
    if (!keywords.some((keyword) => keyword.test(normalized))) continue;

    try {
      const stats = statSync(fullPath);
      if (!dateRange || isWithinRange(stats.mtimeMs, dateRange)) {
        results.push(fullPath);
      }
    } catch {
      // ignore unreadable files
    }
  }

  return results;
}

export function discoverClineFamilySessions(keywords: RegExp[], dateRange?: DateRange, explicitRoots: string[] = []): string[] {
  const roots = Array.from(new Set([...explicitRoots.filter(Boolean), ...getVSCodeWorkspaceStorageDirCandidates()]));
  const discovered = new Set<string>();

  for (const root of roots) {
    if (!root || !existsSync(root)) continue;
    for (const file of walkForUiMessages(root, keywords, dateRange)) {
      discovered.add(file);
    }
  }

  return Array.from(discovered);
}

export function hasClineFamilyData(keywords: RegExp[], explicitRoots: string[] = []): boolean {
  return discoverClineFamilySessions(keywords, undefined, explicitRoots).length > 0;
}
