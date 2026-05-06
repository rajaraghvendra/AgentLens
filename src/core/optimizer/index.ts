// ─────────────────────────────────────────────────────────────
// AgentLens – Optimizer (Enhanced)
// ─────────────────────────────────────────────────────────────

import type { Session, WasteFinding, Metrics } from '../../types/index.js';
import config from '../../config/env.js';
import {
  detectJunkReads,
  detectDuplicateReads,
  detectReadEditRatio,
  detectCacheBloat,
  detectUnusedMcpServers,
  detectGhostAgents,
} from './detectors.js';
import { detectTrends, filterActiveFindings, getTrendIcon } from './trend.js';
import { scoreFindings } from './urgency.js';
import type { ScoredFinding } from './urgency.js';
import type { FindingWithTrend } from './trend.js';

export interface OptimizeOptions {
  configuredMcpServers?: string[];
  configuredAgents?: string[];
}

export function analyzeInefficiencies(
  sessions: Session[],
  metrics?: Metrics,
  opts?: OptimizeOptions
): ScoredFinding[] {
  const findings: WasteFinding[] = [];
  
  if (sessions.length === 0) return [];

  const allBashOutputs: number[] = [];
  let continuousEditTurns = 0;
  let maxContinuousEditTurns = 0;
  let mcpUses = 0;
  let mcpErrors = 0;
  let currentFileEditTarget = '';
  let maxReadOnlyTurns = 0;

  for (const session of sessions) {
    let sessionReadOnlyTurns = 0;

    for (const msg of session.messages) {
      if (!msg.tools) continue;
      const tools = msg.tools;
      const hasEdit = tools.some(t => t.name === 'Edit' || t.name === 'Write');
      const hasRead = tools.some(t => t.name === 'Read');

      for (const tool of tools) {
        const tName = tool.name;

        if (tName === 'Bash' && typeof tool.outputLength === 'number') {
          allBashOutputs.push(tool.outputLength);
        }

        if (hasEdit && tool.input && typeof tool.input === 'object' && (tool.input as any).path) {
          const path = String((tool.input as any).path);
          if (path === currentFileEditTarget) {
            continuousEditTurns++;
          } else {
            currentFileEditTarget = path;
            continuousEditTurns = 1;
          }
          maxContinuousEditTurns = Math.max(maxContinuousEditTurns, continuousEditTurns);
        }

        if (tName.toLowerCase().includes('mcp') || (typeof tool.input === 'object' && (tool.input as any)?.server_name)) {
          mcpUses++;
          if (tool.isError) mcpErrors++;
        }
      }

      if (!hasEdit) {
        continuousEditTurns = 0;
      }

      if (hasRead && !hasEdit) {
        sessionReadOnlyTurns++;
        maxReadOnlyTurns = Math.max(maxReadOnlyTurns, sessionReadOnlyTurns);
      } else if (hasEdit) {
        sessionReadOnlyTurns = 0;
      }
    }
  }

  const heavyBashOps = allBashOutputs.filter(len => len > config.maxBashOutput);
  if (heavyBashOps.length > 5) {
    const totalWastedChars = heavyBashOps.reduce((sum, val) => sum + val, 0);
    const tokenEst = Math.floor(totalWastedChars / 4);
    findings.push({
      kind: 'bash-output-waste',
      severity: heavyBashOps.length > 15 ? 'High' : 'Medium',
      title: 'Uncapped Bash Output',
      description: `Detected ${heavyBashOps.length} terminal commands returning massive outputs (>5k chars). Agents waste context reading generic tool output.`,
      estimatedTokensWasted: tokenEst,
      estimatedCostWastedUSD: (tokenEst / 1_000_000) * 3.0,
      suggestedFix: `export BASH_MAX_OUTPUT_LENGTH=${config.maxBashOutput / 2}`,
      confidence: 0.92,
      triggerValue: heavyBashOps.length,
      expectedRange: '<= 5 oversized bash outputs',
      baselineWindow: 'current period',
    });
  }

  if (maxContinuousEditTurns > 3) {
    findings.push({
      kind: 'edit-retry-loop',
      severity: 'High',
      title: 'Edit Retry Loops Detected',
      description: `An agent edited the same file across ${maxContinuousEditTurns} consecutive turns. This usually means it's stuck in a syntax error loop or failing to apply patches.`,
      estimatedTokensWasted: maxContinuousEditTurns * 4000,
      estimatedCostWastedUSD: (maxContinuousEditTurns * 4000 / 1_000_000) * 15.0,
      suggestedFix: 'Break prompt into smaller chunks or use an MCP testing server to dry-run.',
      confidence: 0.88,
      triggerValue: maxContinuousEditTurns,
      expectedRange: '<= 3 consecutive edits on the same file',
      baselineWindow: 'current period',
    });
  }

  if (mcpUses > 0 && mcpErrors / mcpUses > 0.8) {
    findings.push({
      kind: 'mcp-server-failure',
      severity: 'Low',
      title: 'Failing MCP Servers',
      description: `An MCP server is consistently failing. The agent is wasting tokens querying an offline or buggy tool.`,
      estimatedTokensWasted: mcpErrors * 800,
      estimatedCostWastedUSD: (mcpErrors * 800 / 1_000_000) * 3.0,
      suggestedFix: 'Remove the problematic MCP server from clauderc.json or start the daemon.',
      confidence: 0.75,
      triggerValue: Number(((mcpErrors / mcpUses) * 100).toFixed(1)),
      expectedRange: '< 80% MCP error rate',
      baselineWindow: 'current period',
    });
  }

  if (maxReadOnlyTurns > 10) {
    findings.push({
      kind: 'context-blindness',
      severity: 'Medium',
      title: 'Context Blindness (High Reads)',
      description: `An agent produced ${maxReadOnlyTurns} read-only turns in a row without edits. It may be lost trying to understand undocumented architecture.`,
      estimatedTokensWasted: maxReadOnlyTurns * 3000,
      estimatedCostWastedUSD: (maxReadOnlyTurns * 3000 / 1_000_000) * 3.0,
      suggestedFix: 'Create a CLAUDE.md summarizing the architecture so the agent doesn\'t have to brute-force read.',
      confidence: 0.83,
      triggerValue: maxReadOnlyTurns,
      expectedRange: '<= 10 read-only turns in a row',
      baselineWindow: 'current period',
    });
  }

  if (metrics && metrics.overview.totalCostUSD > 3 && metrics.overview.cacheHitRate < 15) {
    findings.push({
      kind: 'cache-regression',
      severity: metrics.overview.cacheHitRate < 8 ? 'High' : 'Medium',
      title: 'Cache Efficiency Regression',
      description: `Cache hit rate is ${metrics.overview.cacheHitRate.toFixed(1)}%, which is likely inflating input-token spend.`,
      estimatedTokensWasted: Math.round(metrics.overview.totalTokens * 0.15),
      estimatedCostWastedUSD: Number((metrics.overview.totalCostUSD * 0.12).toFixed(2)),
      suggestedFix: 'Reset long sessions earlier and carry forward a shorter working summary.',
      confidence: 0.79,
      triggerValue: Number(metrics.overview.cacheHitRate.toFixed(1)),
      expectedRange: '>= 15% cache hit rate',
      baselineWindow: 'current period',
    });
  }

  const junkReads = detectJunkReads(sessions);
  if (junkReads) findings.push(junkReads);

  const duplicateReads = detectDuplicateReads(sessions);
  if (duplicateReads) findings.push(duplicateReads);

  const readEditRatio = detectReadEditRatio(sessions);
  if (readEditRatio) findings.push(readEditRatio);

  const cacheBloat = detectCacheBloat(sessions);
  if (cacheBloat) findings.push(cacheBloat);

  const unusedMcp = detectUnusedMcpServers(sessions, opts?.configuredMcpServers);
  if (unusedMcp) findings.push(unusedMcp);

  const ghostAgents = detectGhostAgents(sessions, opts?.configuredAgents);
  if (ghostAgents) findings.push(ghostAgents);

  const withTrends = detectTrends(sessions, findings);
  const activeFindings = filterActiveFindings(withTrends);
  
  return scoreFindings(activeFindings);
}

export function computeHealthScore(findings: WasteFinding[]): { score: number; grade: string; breakdown: Record<string, number> } {
  const weights = { High: 15, Medium: 7, Low: 3 };
  const maxPenalty = 100;
  
  let penalty = 0;
  const breakdown: Record<string, number> = {};

  for (const f of findings) {
    const weight = weights[f.severity as keyof typeof weights] || 0;
    penalty += weight;
    const kind = f.kind || 'unknown';
    breakdown[kind] = (breakdown[kind] || 0) + weight;
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

export { getTrendIcon };
export type { ScoredFinding, FindingWithTrend };
export type { TrendStatus } from './trend.js';
