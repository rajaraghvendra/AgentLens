import { IProvider } from './base.js';
import type { Session, DateRange, Message, ToolUsage, TokenUsage } from '../types/index.js';
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { isWithinRange } from '../utils/dates.js';
import { getCopilotDataDir, getCopilotDataDirCandidates, getPathLeaf } from '../utils/paths.js';

interface CopilotEvent {
  type: string;
  timestamp?: string;
  id?: string;
  parentId?: string | null;
  data: Record<string, unknown>;
}

export class CopilotProvider implements IProvider {
  readonly id = 'copilot';
  readonly name = 'GitHub Copilot';

  private sessionStateDir = getCopilotDataDir();
  private getSessionStateDirs(): string[] {
    return Array.from(new Set([this.sessionStateDir, ...getCopilotDataDirCandidates()]));
  }

  isAvailable(): boolean {
    for (const dir of this.getSessionStateDirs()) {
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

        if (event.type === 'system.message') {
          const data = event.data as Record<string, unknown>;
          if (typeof data.content === 'string') {
            const charCount = data.content.length;
            const estimatedTokens = Math.ceil(charCount / 4);
            messages.push({
              id: `copilot-${sessionId}-${messageIdCounter++}`,
              role: 'system',
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

          const inputChars = content.length;
          const inputTokens = Math.ceil(inputChars / 4);
          const outputTokens = Math.ceil(content.split(' ').length * 1.3);

          messages.push({
            id: `copilot-${sessionId}-${messageIdCounter++}`,
            role: 'assistant',
            content,
            timestamp: ts,
            model: currentModel,
            tools: messageTools,
            tokens: {
              input: inputTokens,
              output: outputTokens,
              cacheRead: 0,
              cacheWrite: 0,
            },
          });
        }

        if (event.type === 'assistant.turn_end') {
          messages.push({
            id: `copilot-${sessionId}-${messageIdCounter++}`,
            role: 'assistant',
            content: '[turn end]',
            timestamp: ts,
            model: currentModel,
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

  normalizeToolName(rawName: string): string {
    const map: Record<string, string> = {
      'view': 'View',
      'create': 'Write',
      'edit': 'Edit',
      'bash': 'Bash',
      'ask_user': 'Ask',
      'report_intent': 'Report',
      'search': 'Search',
      'grep': 'Grep',
    };
    return map[rawName] || rawName;
  }
}
