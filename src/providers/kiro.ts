// ─────────────────────────────────────────────────────────────
// AgentLens – Kiro Provider
// ─────────────────────────────────────────────────────────────

import { IProvider } from './base.js';
import type { Session, DateRange, Message, ToolUsage } from '../types/index.js';
import { existsSync, statSync, readdirSync, readFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import config from '../config/env.js';
import { streamJsonlFile } from '../utils/fs-stream.js';
import { isWithinRange } from '../utils/dates.js';
import { getKiroDataDirCandidates, getPathLeaf } from '../utils/paths.js';

// ── Kiro JSONL entry shapes ────────────────────────────────

interface KiroTextContent {
  kind: 'text';
  data: string;
}

interface KiroToolUseContent {
  kind: 'toolUse';
  data: {
    toolUseId: string;
    name: string;
    input: Record<string, unknown>;
    __tool_use_purpose?: string;
  };
}

interface KiroToolResultContent {
  kind: 'toolResult';
  data: {
    toolUseId: string;
    content: Array<{ kind: string; data: string | Record<string, unknown> }>;
    status: 'success' | 'error';
  };
}

type KiroContentItem = KiroTextContent | KiroToolUseContent | KiroToolResultContent;

interface KiroPromptEntry {
  version: string;
  kind: 'Prompt';
  data: {
    message_id: string;
    content: KiroContentItem[];
    meta?: {
      timestamp: number;
    };
  };
}

interface KiroAssistantMessageEntry {
  version: string;
  kind: 'AssistantMessage';
  data: {
    message_id: string;
    content: KiroContentItem[];
  };
}

interface KiroToolResultsEntry {
  version: string;
  kind: 'ToolResults';
  data: {
    message_id: string;
    content: KiroContentItem[];
    results: Record<string, {
      tool: {
        tool_use_purpose?: string;
        kind: {
          BuiltIn: Record<string, unknown>;
        };
      };
      result: {
        Success?: { items: Array<{ Text?: string; Json?: Record<string, unknown> }> };
        Error?: { items: Array<{ Text?: string }> };
      };
    }>;
  };
}

type KiroEntry = KiroPromptEntry | KiroAssistantMessageEntry | KiroToolResultsEntry;

interface KiroSessionMeta {
  session_id: string;
  cwd: string;
  created_at: string;
  updated_at: string;
  title: string;
}

// ── Tool name normalization map ─────────────────────────────

const TOOL_NAME_MAP: Record<string, string> = {
  'read': 'Read',
  'Read': 'Read',
  'readFile': 'Read',
  'read_file': 'Read',
  'write': 'Write',
  'Write': 'Write',
  'writeFile': 'Write',
  'write_file': 'Write',
  'createFile': 'Write',
  'create_file': 'Write',
  'edit': 'Edit',
  'Edit': 'Edit',
  'editFile': 'Edit',
  'edit_file': 'Edit',
  'apply_diff': 'Edit',
  'apply_patch': 'Edit',
  'bash': 'Bash',
  'Bash': 'Bash',
  'shell': 'Bash',
  'run': 'Bash',
  'runCommand': 'Bash',
  'run_command': 'Bash',
  'exec_command': 'Bash',
  'glob': 'Glob',
  'Glob': 'Glob',
  'findFiles': 'Glob',
  'find_files': 'Glob',
  'grep': 'Grep',
  'Grep': 'Grep',
  'search': 'Grep',
  'searchFiles': 'Grep',
  'search_files': 'Grep',
  'todo_list': 'Task',
  'task': 'Task',
  'Task': 'Task',
  'deleteFile': 'Delete',
  'delete_file': 'Delete',
  'listDir': 'Glob',
  'list_dir': 'Glob',
  'openFolders': 'Glob',
  'webSearch': 'WebSearch',
  'web_search': 'WebSearch',
  'spawn_agent': 'Agent',
  'close_agent': 'Agent',
  'wait_agent': 'Agent',
};

function estimateTokensFromContent(content: string): number {
  return Math.ceil(content.length / 4);
}

function extractTextFromToolResultContent(content: Array<{ kind: string; data: string | Record<string, unknown> }>): string {
  return content
    .filter((c): c is { kind: string; data: string } => c.kind === 'text' && typeof c.data === 'string')
    .map(c => c.data)
    .join('\n');
}

function extractToolNameFromBuiltIn(builtIn: Record<string, unknown>): string | null {
  const keys = Object.keys(builtIn);
  if (keys.length === 0) return null;
  return keys[0];
}

export class KiroProvider implements IProvider {
  readonly id = 'kiro';
  readonly name = 'Kiro';

  private sessionsDir = config.kiroDir;

  private getSessionDirs(): string[] {
    return Array.from(new Set([
      this.sessionsDir,
      ...getKiroDataDirCandidates(),
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

    for (const sessionsDir of this.getSessionDirs()) {
      try {
        let sessionGroups: string[];
        try { sessionGroups = readdirSync(sessionsDir); } catch { continue; }

        for (const group of sessionGroups) {
          const groupPath = join(sessionsDir, group);
          try { if (!statSync(groupPath).isDirectory()) continue; } catch { continue; }

          let entries: string[];
          try { entries = readdirSync(groupPath); } catch { continue; }

          for (const entry of entries) {
            const entryPath = join(groupPath, entry);

            try {
              const stat = statSync(entryPath);

              if (stat.isDirectory()) {
                let files: string[];
                try { files = readdirSync(entryPath); } catch { continue; }

                for (const file of files) {
                  if (!file.endsWith('.jsonl') || file.endsWith('.jsonl.swp')) continue;
                  const filePath = join(entryPath, file);
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
              } else if (entry.endsWith('.jsonl') && !entry.endsWith('.jsonl.swp')) {
                try {
                  const stats = statSync(entryPath);
                  if (dateRange) {
                    if (isWithinRange(stats.mtimeMs, dateRange)) {
                      discovered.add(entryPath);
                    }
                  } else {
                    discovered.add(entryPath);
                  }
                } catch {
                  // Skip inaccessible files
                }
              }
            } catch {
              // Skip inaccessible entries
            }
          }
        }
      } catch {
        // Directory doesn't exist or is not readable
      }
    }

    return Array.from(discovered);
  }

  private readSessionMeta(jsonlPath: string): KiroSessionMeta | null {
    try {
      const jsonPath = jsonlPath.replace('.jsonl', '.json');
      if (existsSync(jsonPath)) {
        const raw = readFileSync(jsonPath, 'utf-8');
        return JSON.parse(raw) as KiroSessionMeta;
      }
    } catch {
      // No meta file or invalid JSON
    }
    return null;
  }

  async parseSession(identifier: string): Promise<Session> {
    const messages: Message[] = [];
    let project = basename(dirname(dirname(identifier)));
    let sessionTimestamp = Date.now();
    let pendingTools: Map<string, { name: string; input: Record<string, unknown> }> = new Map();

    // Try to read session metadata from sibling .json file
    const meta = this.readSessionMeta(identifier);
    if (meta) {
      project = getPathLeaf(meta.cwd) || project;
      sessionTimestamp = new Date(meta.created_at).getTime();
    }

    for await (const raw of streamJsonlFile<KiroEntry>(identifier)) {
      if (!raw.kind) continue;

      if (raw.kind === 'Prompt') {
        const prompt = raw as KiroPromptEntry;
        const textContent = prompt.data.content
          .filter((c): c is KiroTextContent => c.kind === 'text')
          .map(c => c.data)
          .join('\n');

        if (textContent) {
          const timestamp = prompt.data.meta?.timestamp
            ? prompt.data.meta.timestamp * 1000 // Convert seconds to ms
            : Date.now();

          messages.push({
            id: prompt.data.message_id || `kiro-prompt-${messages.length}`,
            role: 'user',
            content: textContent,
            timestamp,
            tokens: {
              input: estimateTokensFromContent(textContent),
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
            },
          });
        }
        continue;
      }

      if (raw.kind === 'AssistantMessage') {
        const assistant = raw as KiroAssistantMessageEntry;
        const textContent = assistant.data.content
          .filter((c): c is KiroTextContent => c.kind === 'text')
          .map(c => c.data)
          .join('\n');

        const toolUses = assistant.data.content
          .filter((c): c is KiroToolUseContent => c.kind === 'toolUse');

        // Register pending tool uses
        for (const toolUse of toolUses) {
          pendingTools.set(toolUse.data.toolUseId, {
            name: this.normalizeToolName(toolUse.data.name),
            input: toolUse.data.input,
          });
        }

        const timestamp = Date.now();

        const msg: Message = {
          id: assistant.data.message_id || `kiro-assistant-${messages.length}`,
          role: 'assistant',
          content: textContent,
          timestamp,
          tokens: {
            input: 0,
            output: textContent ? estimateTokensFromContent(textContent) : 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
        };

        // Attach pending tools if there are no tool uses in this message
        // (tools are tracked separately via ToolResults)
        if (toolUses.length === 0 && pendingTools.size > 0) {
          msg.tools = Array.from(pendingTools.values()).map(tool => ({
            name: tool.name,
            input: tool.input,
          }));
          pendingTools.clear();
        }

        messages.push(msg);
        continue;
      }

      if (raw.kind === 'ToolResults') {
        const toolResults = raw as KiroToolResultsEntry;

        // Extract tool usage info from results
        const resultKeys = Object.keys(toolResults.data.results);
        for (const toolUseId of resultKeys) {
          const result = toolResults.data.results[toolUseId];
          const pendingTool = pendingTools.get(toolUseId);

          if (pendingTool) {
            // Remove from pending since we now have results
            pendingTools.delete(toolUseId);
          }

          const toolName = pendingTool?.name ||
            this.normalizeToolName(extractToolNameFromBuiltIn(result.tool.kind.BuiltIn) || toolUseId);

          const isError = result.result.Error !== undefined;
          const output = extractTextFromToolResultContent(toolResults.data.content
            .filter((c): c is KiroToolResultContent => c.kind === 'toolResult')
            .filter(c => c.data.toolUseId === toolUseId)
            .flatMap(c => c.data.content));

          // Add a tool usage marker message
          const timestamp = Date.now();
          messages.push({
            id: `kiro-tool-${toolUseId}`,
            role: 'assistant',
            content: '',
            timestamp,
            tools: [{
              name: toolName,
              input: pendingTool?.input || {},
              output: output || undefined,
              outputLength: output?.length,
              isError,
            }],
          });
        }
        continue;
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
    if (TOOL_NAME_MAP[rawName]) return TOOL_NAME_MAP[rawName];
    const lower = rawName.toLowerCase();
    if (TOOL_NAME_MAP[lower]) return TOOL_NAME_MAP[lower];
    return rawName;
  }
}
