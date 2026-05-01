import { IProvider } from './base.js';
import type { Session, DateRange, Message, ToolUsage, TokenUsage } from '../types/index.js';
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { homedir, platform } from 'os';
import { isWithinRange } from '../utils/dates.js';
import { getCopilotDataDir, getCopilotDataDirCandidates, getPathLeaf } from '../utils/paths.js';

// ── Tool name normalization map ─────────────────────────────

const TOOL_NAME_MAP: Record<string, string> = {
  'view': 'View',
  'create': 'Write',
  'create_file': 'Write',
  'edit': 'Edit',
  'edit_file': 'Edit',
  'replace_string_in_file': 'Edit',
  'write_file': 'Edit',
  'delete_file': 'Delete',
  'bash': 'Bash',
  'run_in_terminal': 'Bash',
  'kill_terminal': 'Bash',
  'ask_user': 'Ask',
  'report_intent': 'Report',
  'search': 'Search',
  'search_files': 'Grep',
  'file_search': 'Grep',
  'find_files': 'Glob',
  'list_directory': 'LS',
  'list_dir': 'LS',
  'grep': 'Grep',
  'read_file': 'Read',
  'web_search': 'WebSearch',
  'fetch_webpage': 'WebFetch',
  'github_repo': 'GitHub',
  'memory': 'Memory',
};

interface CopilotEvent {
  type: string;
  timestamp?: string;
  id?: string;
  parentId?: string | null;
  data: Record<string, unknown>;
}

// ── VS Code workspace storage directories (cross-platform) ──

function getVSCodeWorkspaceStorageDirs(): string[] {
  const home = homedir();
  const p = platform();

  if (p === 'darwin') {
    return [
      join(home, 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage'),
      join(home, 'Library', 'Application Support', 'Code - Insiders', 'User', 'workspaceStorage'),
    ];
  }

  if (p === 'win32') {
    return [
      join(home, 'AppData', 'Roaming', 'Code', 'User', 'workspaceStorage'),
      join(home, 'AppData', 'Roaming', 'Code - Insiders', 'User', 'workspaceStorage'),
    ];
  }

  // Linux
  return [
    join(home, '.config', 'Code', 'User', 'workspaceStorage'),
    join(home, '.config', 'Code - Insiders', 'User', 'workspaceStorage'),
    join(home, '.vscode-server', 'data', 'User', 'workspaceStorage'),
  ];
}

// ── Detect transcript format (VS Code Copilot Agent) ────────

function isTranscriptFormat(firstLine: string): boolean {
  try {
    const event = JSON.parse(firstLine);
    return event.type === 'session.start' && event.data?.producer === 'copilot-agent';
  } catch {
    return false;
  }
}

// ── Read workspace.json to infer project name ───────────────

function readWorkspaceProject(workspaceDir: string): string {
  try {
    const raw = readFileSync(join(workspaceDir, 'workspace.json'), 'utf-8');
    const data = JSON.parse(raw) as { folder?: string };
    if (data.folder) {
      const url = data.folder.replace(/^file:\/\//, '');
      return basename(decodeURIComponent(url));
    }
  } catch {
    // Ignore
  }
  return basename(workspaceDir);
}

export class CopilotProvider implements IProvider {
  readonly id = 'copilot';
  readonly name = 'GitHub Copilot';

  private sessionStateDir = getCopilotDataDir();
  private getSessionStateDirs(): string[] {
    return Array.from(new Set([this.sessionStateDir, ...getCopilotDataDirCandidates()]));
  }

  isAvailable(): boolean {
    // Check legacy session-state dirs
    for (const dir of this.getSessionStateDirs()) {
      try {
        if (existsSync(dir)) return true;
      } catch {
        // continue
      }
    }

    // Check VS Code workspace storage for transcript files
    for (const wsDir of getVSCodeWorkspaceStorageDirs()) {
      try {
        if (existsSync(wsDir)) return true;
      } catch {
        // continue
      }
    }

    return false;
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    if (!this.isAvailable()) return [];

    const discovered = new Set<string>();

    // ── Legacy: ~/.copilot/session-state/<id>/events.jsonl ────
    for (const root of this.getSessionStateDirs()) {
      try {
        const dirs = readdirSync(root);

        for (const dir of dirs) {
          const eventsPath = join(root, dir, 'events.jsonl');
          try {
            const stats = statSync(eventsPath);
            if (dateRange) {
              if (isWithinRange(stats.mtimeMs, dateRange)) {
                discovered.add(eventsPath);
              }
            } else {
              discovered.add(eventsPath);
            }
          } catch {
            // Not a valid session dir
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    // ── VS Code transcripts: workspaceStorage/<hash>/GitHub.copilot-chat/transcripts/*.jsonl
    for (const wsStorageDir of getVSCodeWorkspaceStorageDirs()) {
      try {
        if (!existsSync(wsStorageDir)) continue;
        const workspaceDirs = readdirSync(wsStorageDir);

        for (const wsDir of workspaceDirs) {
          const transcriptsDir = join(wsStorageDir, wsDir, 'GitHub.copilot-chat', 'transcripts');
          if (!existsSync(transcriptsDir)) continue;

          try {
            const files = readdirSync(transcriptsDir);
            for (const file of files) {
              if (!file.endsWith('.jsonl')) continue;
              const filePath = join(transcriptsDir, file);
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
                // Skip inaccessible file
              }
            }
          } catch {
            // Skip unreadable transcripts dir
          }
        }
      } catch {
        // Skip unreadable workspace storage
      }
    }

    return Array.from(discovered);
  }

  async parseSession(identifier: string): Promise<Session> {
    const messages: Message[] = [];
    let project = basename(join(identifier, '..'));
    let sessionId = project;
    let messageIdCounter = 0;
    let toolIdCounter = 0;
    let currentModel = 'gpt-5-mini';
    let sessionStart = Date.now();

    try {
      const content = readFileSync(identifier, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      if (lines.length === 0) {
        return this.emptySession(identifier, project, sessionStart);
      }

      // Detect format: transcript (VS Code Copilot Agent) vs legacy
      if (isTranscriptFormat(lines[0])) {
        return this.parseTranscriptSession(identifier, lines);
      }

      // ── Legacy format parsing ──────────────────────────────

      const toolByCallId = new Map<string, ToolUsage>();

      for (const line of lines) {
        let event: CopilotEvent;
        try {
          event = JSON.parse(line) as CopilotEvent;
        } catch {
          continue;
        }

        const ts = event.timestamp ? new Date(event.timestamp).getTime() : sessionStart;

        if (event.type === 'session.start') {
          sessionStart = ts;
          const data = event.data as Record<string, unknown>;
          if (typeof data.sessionId === 'string') sessionId = data.sessionId;
          const context = data.context as Record<string, unknown> | undefined;
          if (context && typeof context.cwd === 'string') {
            const cwd: string = context.cwd;
            const segments = cwd.split(/[\\/]+/).filter(Boolean);
            project = segments.slice(-2).join('/') || getPathLeaf(cwd) || project;
          }
        }

        if (event.type === 'session.model_change') {
          const data = event.data as Record<string, unknown>;
          if (typeof data.model === 'string') currentModel = data.model;
          if (typeof data.newModel === 'string') currentModel = data.newModel;
        }

        if (event.type === 'user.message') {
          const data = event.data as Record<string, unknown>;
          if (typeof data.content === 'string') {
            const charCount = data.content.length;
            const estimatedTokens = Math.ceil(charCount / 4);
            messages.push({
              id: `copilot-${sessionId}-${messageIdCounter++}`,
              role: 'user',
              content: data.content,
              timestamp: ts,
              model: currentModel,
              tokens: {
                input: estimatedTokens,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
              },
            });
          }
        }

        if (event.type === 'assistant.message') {
          const data = event.data as Record<string, unknown>;
          const toolRequests = (data.toolRequests as Array<Record<string, unknown>>) || [];
          const messageTools: ToolUsage[] = [];

          for (const req of toolRequests) {
            const reqName = (req.name as string) || 'unknown';
            const reqArgs = (req.arguments as Record<string, unknown>) || {};
            const reqCallId = (req.toolCallId as string) || `call-${toolIdCounter}`;

            const tool: ToolUsage = {
              name: this.normalizeToolName(reqName),
              input: reqArgs,
            };
            messageTools.push(tool);
            toolByCallId.set(reqCallId, tool);
            toolIdCounter++;
          }

          let content = (typeof data.content === 'string' ? data.content : '') || '';
          if (toolRequests.length > 0 && !content) {
            content = toolRequests.map(r => `[${r.name}]`).join(', ');
          }

          const outputTokens = typeof data.outputTokens === 'number' ? data.outputTokens : Math.ceil(content.length / 4);
          const inputTokens = Math.ceil(content.length / 4);

          messages.push({
            id: `copilot-${sessionId}-${messageIdCounter++}`,
            role: 'assistant',
            content,
            timestamp: ts,
            model: currentModel,
            tools: messageTools.length > 0 ? messageTools : undefined,
            tokens: {
              input: inputTokens,
              output: outputTokens,
              cacheRead: 0,
              cacheWrite: 0,
            },
          });
        }

        if (event.type === 'tool.execution_start') {
          const data = event.data as Record<string, unknown>;
          const toolName = (typeof data.toolName === 'string' ? data.toolName : data.name as string) || 'unknown';
          const toolArgs = (data.arguments as Record<string, unknown>) || {};
          const toolCallId = (data.toolCallId as string) || `start-${toolIdCounter}`;

          if (!toolByCallId.has(toolCallId)) {
            const tool: ToolUsage = {
              name: this.normalizeToolName(toolName),
              input: toolArgs,
            };
            toolByCallId.set(toolCallId, tool);
            toolIdCounter++;
          }
        }

        if (event.type === 'tool.execution_complete') {
          const data = event.data as Record<string, unknown>;
          const toolCallId = data.toolCallId as string;
          const success = data.success !== false;
          const result = (data.result as Record<string, unknown>) || {};
          const resultContent = (typeof result.content === 'string' ? result.content : '') || '';
          const error = (data.error as Record<string, unknown>) || {};

          const tool = toolCallId ? toolByCallId.get(toolCallId) : undefined;
          if (tool) {
            tool.output = resultContent;
            tool.outputLength = resultContent.length;
            tool.isError = !success;
            if (typeof error.message === 'string') {
              (tool as unknown as Record<string, unknown>).error = error.message;
            }
          }
        }
      }
    } catch {
      // File read error
    }

    messages.sort((a, b) => a.timestamp - b.timestamp);

    const firstTimestamp = messages[0]?.timestamp || sessionStart;
    const lastMsgTimestamp = messages[messages.length - 1]?.timestamp || firstTimestamp;

    return {
      id: identifier,
      provider: this.id,
      project,
      timestamp: firstTimestamp,
      durationMs: lastMsgTimestamp - firstTimestamp,
      messages,
    };
  }

  /**
   * Parse VS Code Copilot Agent transcript format.
   * Transcript files start with session.start { producer: 'copilot-agent' }
   * and contain user.message / assistant.message events with tool requests.
   */
  private parseTranscriptSession(identifier: string, lines: string[]): Session {
    const messages: Message[] = [];
    let sessionId = basename(identifier, '.jsonl');
    let project = sessionId;
    let messageIdCounter = 0;
    let pendingUserMessage = '';

    // Infer project from workspace.json if this is in workspaceStorage
    const wsDir = dirname(dirname(dirname(identifier)));
    if (basename(dirname(dirname(identifier))) === 'GitHub.copilot-chat') {
      project = readWorkspaceProject(wsDir);
    }

    // Parse all events to infer model from tool-call IDs
    const events: CopilotEvent[] = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line) as CopilotEvent);
      } catch {
        continue;
      }
    }

    const model = this.inferModelFromToolCallIds(events);

    for (const event of events) {
      const ts = event.timestamp ? new Date(event.timestamp).getTime() : Date.now();

      if (event.type === 'session.start') {
        const data = event.data as { sessionId?: string };
        if (data.sessionId) sessionId = data.sessionId;
      }

      if (event.type === 'user.message') {
        const data = event.data as { content?: string };
        pendingUserMessage = (data.content ?? '').slice(0, 500);

        const charCount = pendingUserMessage.length;
        messages.push({
          id: `copilot-${sessionId}-${messageIdCounter++}`,
          role: 'user',
          content: pendingUserMessage,
          timestamp: ts,
          model,
          tokens: {
            input: Math.ceil(charCount / 4),
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
        });
        continue;
      }

      if (event.type === 'assistant.message') {
        const data = event.data as {
          messageId: string;
          content?: string;
          reasoningText?: string;
          toolRequests?: Array<{ toolCallId?: string; name?: string; arguments?: string; type?: string }>;
          outputTokens?: number;
        };

        const contentText = data.content ?? '';
        const reasoningText = data.reasoningText ?? '';
        const toolRequests = data.toolRequests ?? [];

        if (contentText.length === 0 && reasoningText.length === 0 && toolRequests.length === 0) continue;

        let outputTokens = data.outputTokens ?? 0;
        let reasoningTokens = 0;
        if (outputTokens === 0) {
          outputTokens = Math.ceil(contentText.length / 4);
          reasoningTokens = Math.ceil(reasoningText.length / 4);
        }

        const inputTokens = Math.ceil(pendingUserMessage.length / 4);

        const tools: ToolUsage[] = toolRequests
          .filter(t => t.name)
          .map(t => ({
            name: this.normalizeToolName(t.name!),
            input: t.arguments ? { raw: t.arguments } : {},
          }));

        messages.push({
          id: `copilot-${sessionId}-${messageIdCounter++}`,
          role: 'assistant',
          content: contentText,
          timestamp: ts,
          model,
          tools: tools.length > 0 ? tools : undefined,
          tokens: {
            input: inputTokens,
            output: outputTokens + reasoningTokens,
            cacheRead: 0,
            cacheWrite: 0,
          },
        });

        pendingUserMessage = '';
      }
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

  /**
   * Infer the model from tool-call ID prefixes in assistant messages.
   * Anthropic uses 'toolu_bdrk_', 'toolu_vrtx_', 'tooluse_' prefixes;
   * OpenAI uses 'call_' prefix.
   */
  private inferModelFromToolCallIds(events: CopilotEvent[]): string {
    const hints: Array<{ prefix: string; model: string }> = [
      { prefix: 'toolu_bdrk_', model: 'copilot-anthropic-auto' },
      { prefix: 'toolu_vrtx_', model: 'copilot-anthropic-auto' },
      { prefix: 'tooluse_', model: 'copilot-anthropic-auto' },
      { prefix: 'call_', model: 'copilot-openai-auto' },
    ];

    const modelCounts = new Map<string, number>();

    for (const e of events) {
      if (e.type !== 'assistant.message') continue;
      const data = e.data as { toolRequests?: Array<{ toolCallId?: string }> };
      for (const t of data.toolRequests ?? []) {
        const toolCallId = t.toolCallId ?? '';
        for (const hint of hints) {
          if (toolCallId.startsWith(hint.prefix)) {
            modelCounts.set(hint.model, (modelCounts.get(hint.model) ?? 0) + 1);
            break;
          }
        }
      }
    }

    if (modelCounts.size > 0) {
      return [...modelCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    }

    return 'copilot-auto';
  }

  private emptySession(identifier: string, project: string, ts: number): Session {
    return {
      id: identifier,
      provider: this.id,
      project,
      timestamp: ts,
      durationMs: 0,
      messages: [],
    };
  }

  normalizeToolName(rawName: string): string {
    if (TOOL_NAME_MAP[rawName]) return TOOL_NAME_MAP[rawName];
    const lower = rawName.toLowerCase();
    if (TOOL_NAME_MAP[lower]) return TOOL_NAME_MAP[lower];
    return rawName;
  }
}
