// ─────────────────────────────────────────────────────
// AgentLens – Enhanced Waste Detectors
// ─────────────────────────────────────────────────────

import type { Session, WasteFinding, ActivityCategory } from '../types/index.js';
import config from '../config/env.js';
import { classifyTurn } from './classifier/index.js';
import { PricingEngine } from './pricing/calculator.js';

interface ToolCall {
  name: string;
  input: string | Record<string, unknown>;
  output?: string;
  outputLength?: number;
  isError?: boolean;
  serverName?: string;
}

interface MessageWithTools {
  role: string;
  tools?: ToolCall[];
  model?: string;
  tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

/**
 * Detect redundant file reads (same file read multiple times without edits)
 */
function detectRedundantReads(sessions: Session[]): WasteFinding | null {
  const fileReadCounts = new Map<string, { count: number; sessionIds: string[] }>();
  let totalRedundantReads = 0;

  for (const session of sessions) {
    for (const msg of session.messages) {
      if (!msg.tools) continue;
      
      for (const tool of msg.tools) {
        if (tool.name === 'Read' && typeof tool.input === 'object' && tool.input) {
          const path = (tool.input as any).path || (tool.input as any).file_path;
          if (path && typeof path === 'string') {
            if (!fileReadCounts.has(path)) {
              fileReadCounts.set(path, { count: 0, sessionIds: [] });
            }
            const entry = fileReadCounts.get(path)!;
            entry.count++;
            if (!entry.sessionIds.includes(session.id)) {
              entry.sessionIds.push(session.id);
            }
            if (entry.count > 2) {
              totalRedundantReads++;
            }
          }
        }
      }
    }
  }

  if (totalRedundantReads < 5) return null;

  const topFiles = Array.from(fileReadCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([path, data]) => `${path} (${data.count} reads)`)
    .join(', ');

  const estimatedTokens = totalRedundantReads * 1500;
  
  return {
    kind: 'redundant-reads',
    severity: totalRedundantReads > 20 ? 'High' : 'Medium',
    title: 'Redundant File Reads',
    description: `Detected ${totalRedundantReads} redundant file reads. Files read multiple times without edits: ${topFiles}`,
    estimatedTokensWasted: estimatedTokens,
    estimatedCostWastedUSD: (estimatedTokens / 1_000_000) * 3.0,
    suggestedFix: 'Use context management or summarize file contents after first read.',
    confidence: 0.85,
    triggerValue: totalRedundantReads,
    expectedRange: '< 5 redundant reads',
    baselineWindow: 'current period',
  };
}

/**
 * Detect prompt loops (agent asking same thing repeatedly)
 */
function detectPromptLoops(sessions: Session[]): WasteFinding | null {
  const userMessages = new Map<string, number>();
  let loopCount = 0;

  for (const session of sessions) {
    for (const msg of session.messages) {
      if (msg.role === 'user' && msg.content) {
        const normalized = msg.content.toLowerCase().trim().replace(/\s+/g, ' ');
        const count = userMessages.get(normalized) || 0;
        userMessages.set(normalized, count + 1);
        if (count >= 2) loopCount++;
      }
    }
  }

  if (loopCount < 3) return null;

  const estimatedTokens = loopCount * 2000;
  
  return {
    kind: 'prompt-loops',
    severity: loopCount > 10 ? 'High' : 'Medium',
    title: 'Prompt Loops Detected',
    description: `Detected ${loopCount} repeated user messages. The agent may be stuck in a loop or user is re-asking the same question.`,
    estimatedTokensWasted: estimatedTokens,
    estimatedCostWastedUSD: (estimatedTokens / 1_000_000) * 3.0,
    suggestedFix: 'Review conversation flow and break loops with clearer instructions.',
    confidence: 0.78,
    triggerValue: loopCount,
    expectedRange: '< 3 repeated prompts',
    baselineWindow: 'current period',
  };
}

/**
 * Detect missing cache writes (sessions using lots of input tokens but no cache writes)
 */
function detectMissingCacheWrites(sessions: Session[]): WasteFinding | null {
  let totalInputTokens = 0;
  let totalCacheWrites = 0;
  let sessionCount = 0;

  for (const session of sessions) {
    let sessionInput = 0;
    let sessionCacheWrites = 0;
    
    for (const msg of session.messages) {
      if (msg.role === 'assistant' && msg.tokens) {
        sessionInput += msg.tokens.input || 0;
        sessionCacheWrites += msg.tokens.cacheWrite || 0;
      }
    }
    
    if (sessionInput > 10000 && sessionCacheWrites === 0) {
      totalInputTokens += sessionInput;
      sessionCount++;
    }
  }

  if (sessionCount < 2) return null;

  const estimatedSavings = totalInputTokens * 0.10; // 10% could be saved with cache
  
  return {
    kind: 'missing-cache-writes',
    severity: sessionCount > 5 ? 'High' : 'Medium',
    title: 'Missing Cache Writes',
    description: `Found ${sessionCount} sessions with high input token usage but no cache writes. Cache could reduce costs by ~10%.`,
    estimatedTokensWasted: Math.round(estimatedSavings),
    estimatedCostWastedUSD: (estimatedSavings / 1_000_000) * 3.0,
    suggestedFix: 'Enable prompt caching or use longer sessions that write to cache.',
    confidence: 0.82,
    triggerValue: sessionCount,
    expectedRange: 'Cache writes present in long sessions',
    baselineWindow: 'current period',
  };
}

/**
 * Detect inefficient tool use (agent using expensive tools when cheaper alternatives exist)
 */
function detectInefficientToolUse(sessions: Session[]): WasteFinding | null {
  let expensiveToolCalls = 0;
  let totalCost = 0;

  for (const session of sessions) {
    for (const msg of session.messages) {
      if (msg.role !== 'assistant' || !msg.tools) continue;
      
      for (const tool of msg.tools) {
        // Example: Using Bash for simple file reads instead of Read tool
        if (tool.name === 'Bash' && typeof tool.input === 'string') {
          const input = tool.input.toLowerCase();
          if (input.includes('cat ') || input.includes('less ') || input.includes('more ')) {
            expensiveToolCalls++;
            const costResult = PricingEngine.calculateMessageCost(msg.model || 'unknown', msg.tokens || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
            totalCost += costResult.cost;
          }
        }
      }
    }
  }

  if (expensiveToolCalls < 5) return null;

  return {
    kind: 'inefficient-tool-use',
    severity: expensiveToolCalls > 15 ? 'High' : 'Medium',
    title: 'Inefficient Tool Usage',
    description: `Detected ${expensiveToolCalls} cases where expensive tools (Bash) were used for operations that cheaper tools (Read) could handle.`,
    estimatedTokensWasted: expensiveToolCalls * 500,
    estimatedCostWastedUSD: totalCost,
    suggestedFix: 'Use Read tool for file reads instead of Bash commands like cat/less/more.',
    confidence: 0.75,
    triggerValue: expensiveToolCalls,
    expectedRange: '< 5 inefficient tool calls',
    baselineWindow: 'current period',
  };
}

/**
 * Detect long sessions without progress (many messages but no meaningful edits)
 */
function detectStagnantSessions(sessions: Session[]): WasteFinding | null {
  let stagnantCount = 0;
  let totalMessages = 0;

  for (const session of sessions) {
    const userMessages = session.messages.filter((m: any) => m.role === 'user');
    const editTools = session.messages.filter((m: any) => 
      m.tools?.some((t: any) => t.name === 'Edit' || t.name === 'Write')
    );

    if (userMessages.length > 20 && editTools.length === 0) {
      stagnantCount++;
      totalMessages += userMessages.length;
    }
  }

  if (stagnantCount < 2) return null;

  const estimatedTokens = totalMessages * 1000;
  
  return {
    kind: 'stagnant-sessions',
    severity: stagnantCount > 5 ? 'High' : 'Medium',
    title: 'Stagnant Sessions',
    description: `Found ${stagnantCount} sessions with ${totalMessages}+ messages but no edits. Agent may be stuck in discussion mode.`,
    estimatedTokensWasted: estimatedTokens,
    estimatedCostWastedUSD: (estimatedTokens / 1_000_000) * 3.0,
    suggestedFix: 'Set clearer goals or use Planning mode before diving into execution.',
    confidence: 0.80,
    triggerValue: stagnantCount,
    expectedRange: '< 2 stagnant sessions',
    baselineWindow: 'current period',
  };
}

/**
 * Main function to detect all waste patterns
 */
export function detectWaste(sessions: Session[]): WasteFinding[] {
  const findings: WasteFinding[] = [];

  if (sessions.length === 0) return findings;

  // Run all detectors
  const detectors = [
    detectRedundantReads,
    detectPromptLoops,
    detectMissingCacheWrites,
    detectInefficientToolUse,
    detectStagnantSessions,
  ];

  for (const detector of detectors) {
    const finding = detector(sessions);
    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

/**
 * Calculate enhanced health score based on all waste findings
 */
export function calculateHealthScore(findings: WasteFinding[]): { score: number; grade: string; breakdown: Record<string, number> } {
  const weights = { High: 15, Medium: 7, Low: 3 };
  const maxPenalty = 100;
  
  let penalty = 0;
  const breakdown: Record<string, number> = {};

  for (const f of findings) {
    const weight = weights[f.severity as keyof typeof weights] || 0;
    penalty += weight;
    const kind = f.kind;
    if (kind) {
      breakdown[kind] = (breakdown[kind] || 0) + weight;
    }
  }
  
  const score = Math.max(0, 100 - Math.min(maxPenalty, penalty));
  let grade: string;
  
  if (score >= 90) grade = 'A';
  else if (score >= 75) grade = 'B';
  else if (score >= 55) grade = 'C';
  else if (score >= 30) grade = 'D';
  else grade = 'F';
  
  return { score, grade, breakdown };
}
