// ─────────────────────────────────────────────────────────────
// AgentLens – Pi Provider
// ─────────────────────────────────────────────────────────────

import { IProvider } from './base.js';
import type { Session, DateRange, Message, ToolUsage } from '../types/index.js';
import { accessSync, constants, readdirSync, statSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { streamJsonlFile } from '../utils/fs-stream.js';
import { isWithinRange } from '../utils/dates.js';
import { getPiDataDir } from '../utils/paths.js';

interface PiEntry {
  type: string;
  id?: string;
  timestamp?: string;
  cwd?: string;
  message?: {
    role?: string;
    content?: Array<{ type?: string; text?: string; name?: string; arguments?: Record<string, unknown> }>;
    model?: string;
    responseId?: string;
    usage?: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
    };
  };
}

const modelDisplayNames: Record<string, string> = {
  'gpt-5.4': 'GPT-5.4',
  'gpt-5.4-mini': 'GPT-5.4 Mini',
  'gpt-5': 'GPT-5',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
};

const toolNameMap: Record<string, string> = {
  bash: 'Bash',
  read: 'Read',
  edit: 'Edit',
  write: 'Write',
  glob: 'Glob',
  grep: 'Grep',
  task: 'Agent',
  dispatch_agent: 'Agent',
  fetch: 'WebFetch',
  search: 'WebSearch',
  todo: 'TodoWrite',
  patch: 'Patch',
};

export class PiProvider implements IProvider {
  readonly id = 'pi';
  readonly name = 'Pi';

  private sessionsDir = getPiDataDir();

  isAvailable(): boolean {
    try {
      accessSync(this.sessionsDir, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    if (!this.isAvailable()) return [];

    const discovered: string[] = [];

    try {
      const projectDirs = readdirSync(this.sessionsDir);
      
      for (const dirName of projectDirs) {
        const dirPath = join(this.sessionsDir, dirName);
        const dirStat = statSync(dirPath);
        
        if (!dirStat.isDirectory()) continue;

        let files: string[];
        try {
          files = readdirSync(dirPath);
        } catch {
          continue;
        }

        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue;
          
          const filePath = join(dirPath, file);
          const fileStat = statSync(filePath);
          
          if (dateRange) {
            if (isWithinRange(fileStat.mtimeMs, dateRange)) {
              discovered.push(filePath);
            }
          } else {
            discovered.push(filePath);
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return discovered;
  }

  async parseSession(identifier: string): Promise<Session> {
    const messages: Message[] = [];
    let project = basename(identifier, '.jsonl');
    let sessionId = project;
    let pendingUserMessage = '';

    try {
      const content = readFileSync(identifier, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      const dirName = basename(join(identifier, '..'));
      project = dirName;

      for (const line of lines) {
        let entry: PiEntry;
        try {
          entry = JSON.parse(line) as PiEntry;
        } catch {
          continue;
        }

        if (entry.type === 'session') {
          sessionId = entry.id ?? sessionId;
          continue;
        }

        if (entry.type !== 'message') continue;

        const msg = entry.message;
        if (!msg) continue;

        if (msg.role === 'user') {
          const texts = (msg.content ?? [])
            .filter(c => c.type === 'text')
            .map(c => c.text ?? '')
            .filter(Boolean);
          if (texts.length > 0) pendingUserMessage = texts.join(' ');
          continue;
        }

        if (msg.role !== 'assistant' || !msg.usage) continue;

        const { input, output, cacheRead, cacheWrite } = msg.usage;
        if (input === 0 && output === 0) continue;

        const model = msg.model ?? 'gpt-5';
        const responseId = msg.responseId ?? '';

        const message: Message = {
          id: `pi-${sessionId}-${responseId || entry.id || String(messages.length)}`,
          role: 'assistant',
          content: '',
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
          model: this.modelDisplayName(model),
          tokens: {
            input,
            output,
            cacheRead,
            cacheWrite,
          },
        };

        const toolCalls = (msg.content ?? []).filter(c => c.type === 'toolCall' && c.name);
        
        if (toolCalls.length > 0) {
          message.tools = toolCalls.map((t): ToolUsage => ({
            name: this.normalizeToolName(t.name!),
            input: t.arguments ?? '',
            outputLength: 0,
          }));

          const bashCommands = toolCalls
            .filter(c => c.name === 'bash')
            .flatMap(c => {
              const cmd = c.arguments?.['command'];
              return typeof cmd === 'string' ? [cmd] : [];
            });
          
          if (bashCommands.length > 0 && message.tools.length > 0) {
            for (const tool of message.tools) {
              if (tool.name === 'Bash') {
                tool.input = bashCommands[0];
              }
            }
          }
        }

        messages.push(message);
      }
    } catch (err) {
      // File read error
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

  private modelDisplayName(model: string): string {
    for (const [key, name] of Object.entries(modelDisplayNames)) {
      if (model.startsWith(key)) return name;
    }
    return model;
  }

  normalizeToolName(rawName: string): string {
    return toolNameMap[rawName] || rawName;
  }
}