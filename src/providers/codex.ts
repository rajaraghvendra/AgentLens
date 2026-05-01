// ─────────────────────────────────────────────────────────────
// AgentLens – Codex Provider
// ─────────────────────────────────────────────────────────────

import { IProvider } from './base.js';
import type { Session, DateRange, Message, ToolUsage } from '../types/index.js';
import { existsSync, statSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import config from '../config/env.js';
import { streamJsonlFile } from '../utils/fs-stream.js';
import { isWithinRange } from '../utils/dates.js';
import { getCodexDataDirCandidates, getPathLeaf } from '../utils/paths.js';

// ── Codex JSONL entry shapes ────────────────────────────────

interface CodexEntry {
  timestamp?: string;
  type?: string;
  payload?: {
    id?: string;
    type?: string;
    role?: string;
    cwd?: string;
    originator?: string;
    session_id?: string;
    model_provider?: string;
    model?: string;
    name?: string;
    content?: Array<{ type?: string; text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_tokens?: number;
      cache_write_tokens?: number;
    };
    tokens?: {
      input?: number;
      output?: number;
    };
    info?: {
      model?: string;
      model_name?: string;
      last_token_usage?: CodexTokenUsage;
      total_token_usage?: CodexTokenUsage;
    };
    tools?: Array<{
      name?: string;
      input?: Record<string, unknown>;
      output?: string;
    }>;
  };
}

interface CodexTokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

// ── Tool name normalization map ─────────────────────────────

const TOOL_NAME_MAP: Record<string, string> = {
  'Bash': 'Bash',
  'bash': 'Bash',
  'run_command': 'Bash',
  'shell': 'Bash',
  'exec_command': 'Bash',
  'Edit': 'Edit',
  'edit': 'Edit',
  'edit_file': 'Edit',
  'apply_diff': 'Edit',
  'apply_patch': 'Edit',
  'Write': 'Write',
  'write': 'Write',
  'write_to_file': 'Write',
  'write_file': 'Edit',
  'Read': 'Read',
  'read': 'Read',
  'read_file': 'Read',
  'view_file': 'Read',
  'ReadFile': 'Read',
  'read_dir': 'Glob',
  'Glob': 'Glob',
  'glob': 'Glob',
  'Grep': 'Grep',
  'grep': 'Grep',
  'spawn_agent': 'Agent',
  'close_agent': 'Agent',
  'wait_agent': 'Agent',
};

function estimateTokensFromContent(content: string): number {
  return Math.ceil(content.length / 4);
}

// ── CODEX_HOME env var support ──────────────────────────────
// CodeBurn respects CODEX_HOME; we should too.
function getCodexHome(): string {
  return process.env.CODEX_HOME || join(homedir(), '.codex');
}

// ── Session validation ──────────────────────────────────────
// Codex sessions start with a 'session_meta' entry whose
// originator starts with 'codex'. This distinguishes codex
// sessions from other tools that use the same format.
function isValidCodexSessionFirstLine(entry: CodexEntry): boolean {
  return entry.type === 'session_meta' &&
    typeof entry.payload?.originator === 'string' &&
    entry.payload.originator.toLowerCase().startsWith('codex');
}

export class CodexProvider implements IProvider {
  readonly id = 'codex';
  readonly name = 'Codex CLI';

  private sessionsDir = config.codexDir;
  private getSessionDirs(): string[] {
    return Array.from(new Set([
      this.sessionsDir,
      join(getCodexHome(), 'sessions'),
      ...getCodexDataDirCandidates(),
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
        const years = readdirSync(sessionsDir);
        
        for (const year of years) {
          if (!/^\d{4}$/.test(year)) continue;
          const yearPath = join(sessionsDir, year);
          try { if (!statSync(yearPath).isDirectory()) continue; } catch { continue; }
          
          let months: string[];
          try { months = readdirSync(yearPath); } catch { continue; }
          
          for (const month of months) {
            if (!/^\d{2}$/.test(month)) continue;
            const monthPath = join(yearPath, month);
            try { if (!statSync(monthPath).isDirectory()) continue; } catch { continue; }
            
            let days: string[];
            try { days = readdirSync(monthPath); } catch { continue; }
            
            for (const day of days) {
              if (!/^\d{2}$/.test(day)) continue;
              const dayPath = join(monthPath, day);
              try { if (!statSync(dayPath).isDirectory()) continue; } catch { continue; }
              
              let files: string[];
              try { files = readdirSync(dayPath); } catch { continue; }
              
              for (const file of files) {
                if (!file.startsWith('rollout-') || !file.endsWith('.jsonl')) continue;
                
                const filePath = join(dayPath, file);
                
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
          }
        }
      } catch {
        // Directory doesn't exist or is not readable
      }
    }

    return Array.from(discovered);
  }

  async parseSession(identifier: string): Promise<Session> {
    const messages: Message[] = [];
    let project = basename(identifier, '.jsonl').replace(/^rollout-/, '');
    let sessionTimestamp = Date.now();
    let sessionModel: string | undefined;
    let pendingTools: string[] = [];

    // Track cumulative token usage for delta calculation
    // (CodeBurn uses this pattern for Codex's cumulative token_count events)
    let prevCumulativeTotal = 0;
    let prevInput = 0;
    let prevCached = 0;
    let prevOutput = 0;
    let prevReasoning = 0;
    
    for await (const raw of streamJsonlFile<CodexEntry>(identifier)) {
      if (!raw.type) continue;
      
      if (raw.type === 'session_meta' && raw.payload) {
        if (raw.payload.cwd) {
          project = getPathLeaf(raw.payload.cwd) || project;
        }
        if (raw.payload.model) {
          sessionModel = raw.payload.model;
        }
        if (raw.timestamp) {
          sessionTimestamp = new Date(raw.timestamp).getTime();
        }
        continue;
      }

      // Track model changes across turns
      if (raw.type === 'turn_context' && raw.payload?.model) {
        sessionModel = raw.payload.model;
        continue;
      }

      // Collect tool calls from function_call events
      if (raw.type === 'response_item' && raw.payload?.type === 'function_call') {
        const rawName = raw.payload.name ?? '';
        pendingTools.push(TOOL_NAME_MAP[rawName] ?? rawName);
        continue;
      }

      // Collect edit tool from patch_apply_end events
      if (raw.type === 'event_msg' && raw.payload?.type === 'patch_apply_end') {
        pendingTools.push('Edit');
        continue;
      }
      
      // Handle response_item messages (original parsing path)
      if (raw.type === 'response_item' && raw.payload) {
        const p = raw.payload;
        
        if (p.type !== 'message') continue;
        const role = p.role === 'developer' ? 'assistant' : (p.role === 'user' ? 'user' : 'assistant');
        
        const content = p.content
          ?.filter((c): c is { type: string; text: string } => c && typeof c === 'object' && 'text' in c)
          .map(c => c.text)
          .join('\n') || '';
        
        let inputTokens = 0;
        let outputTokens = 0;
        let cacheReadTokens = 0;
        let cacheWriteTokens = 0;
        
        if (p.usage) {
          inputTokens = p.usage.input_tokens || 0;
          outputTokens = p.usage.output_tokens || 0;
          cacheReadTokens = p.usage.cache_read_tokens || 0;
          cacheWriteTokens = p.usage.cache_write_tokens || 0;
        } else if (p.tokens) {
          inputTokens = p.tokens.input || 0;
          outputTokens = p.tokens.output || 0;
        }

        const model = p.model || sessionModel || 'gpt-5.4';

        const msg: Message = {
          id: p.id || `codex-${messages.length}`,
          role,
          content: content,
          timestamp: raw.timestamp ? new Date(raw.timestamp).getTime() : Date.now(),
          model,
          tokens: {
            input: inputTokens > 0 ? inputTokens : (role === 'user' ? estimateTokensFromContent(content) : 0),
            output: outputTokens > 0 ? outputTokens : (role === 'assistant' ? estimateTokensFromContent(content) : 0),
            cacheRead: cacheReadTokens,
            cacheWrite: cacheWriteTokens,
          },
        };

        if (p.tools && Array.isArray(p.tools)) {
          msg.tools = p.tools.map((t): ToolUsage => ({
            name: this.normalizeToolName(t.name || ''),
            input: t.input || {},
            outputLength: t.output?.length,
          }));
        }

        // Attach any pending tool names from function_call events
        if (pendingTools.length > 0 && role === 'assistant') {
          if (!msg.tools) msg.tools = [];
          for (const toolName of pendingTools) {
            msg.tools.push({
              name: toolName,
              input: {},
            });
          }
          pendingTools = [];
        }

        messages.push(msg);
        continue;
      }

      // Handle event_msg with token_count (cumulative token tracking)
      if (raw.type === 'event_msg' && raw.payload?.type === 'token_count') {
        const info = raw.payload.info;
        if (!info) continue;

        const cumulativeTotal = info.total_token_usage?.total_tokens ?? 0;
        if (cumulativeTotal > 0 && cumulativeTotal === prevCumulativeTotal) continue;
        prevCumulativeTotal = cumulativeTotal;

        const last = info.last_token_usage;
        let inputTokens = 0;
        let cachedInputTokens = 0;
        let outputTokens = 0;
        let reasoningTokens = 0;

        if (last) {
          inputTokens = last.input_tokens ?? 0;
          cachedInputTokens = last.cached_input_tokens ?? 0;
          outputTokens = last.output_tokens ?? 0;
          reasoningTokens = last.reasoning_output_tokens ?? 0;
        } else if (cumulativeTotal > 0) {
          const total = info.total_token_usage;
          if (!total) continue;
          inputTokens = (total.input_tokens ?? 0) - prevInput;
          cachedInputTokens = (total.cached_input_tokens ?? 0) - prevCached;
          outputTokens = (total.output_tokens ?? 0) - prevOutput;
          reasoningTokens = (total.reasoning_output_tokens ?? 0) - prevReasoning;
        }

        if (!last) {
          const total = info.total_token_usage;
          if (total) {
            prevInput = total.input_tokens ?? 0;
            prevCached = total.cached_input_tokens ?? 0;
            prevOutput = total.output_tokens ?? 0;
            prevReasoning = total.reasoning_output_tokens ?? 0;
          }
        }

        const totalTokens = inputTokens + cachedInputTokens + outputTokens + reasoningTokens;
        if (totalTokens === 0) continue;

        // OpenAI includes cached tokens inside input_tokens;
        // normalize so inputTokens = non-cached only
        const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
        const model = raw.payload.model ?? raw.payload.info?.model ?? raw.payload.info?.model_name ?? sessionModel ?? 'gpt-5.4';

        const msg: Message = {
          id: `codex-tc-${messages.length}`,
          role: 'assistant',
          content: '',
          timestamp: raw.timestamp ? new Date(raw.timestamp).getTime() : Date.now(),
          model,
          tokens: {
            input: uncachedInputTokens,
            output: outputTokens,
            cacheRead: cachedInputTokens,
            cacheWrite: 0,
          },
        };

        // Attach pending tools
        if (pendingTools.length > 0) {
          msg.tools = pendingTools.map(name => ({
            name,
            input: {},
          }));
          pendingTools = [];
        }

        messages.push(msg);
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
