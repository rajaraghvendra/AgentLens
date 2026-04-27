// ─────────────────────────────────────────────────────────────
// AgentLens – Optimizer
// ─────────────────────────────────────────────────────────────

import type { Session, WasteFinding, Metrics } from '../../types/index.js';
import config from '../../config/env.js';

export function analyzeInefficiencies(sessions: Session[], metrics?: Metrics): WasteFinding[] {
  const findings: WasteFinding[] = [];
  
  if (sessions.length === 0) return findings;

  // Trackers
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

        // Rule 1 Tracker
        if (tName === 'Bash' && typeof tool.outputLength === 'number') {
          allBashOutputs.push(tool.outputLength);
        }

        // Rule 2 Tracker (Edit retries)
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

        // Rule 3 Tracker (MCP)
        if (tName.toLowerCase().includes('mcp') || (typeof tool.input === 'object' && (tool.input as any)?.server_name)) {
          mcpUses++;
          if (tool.isError) mcpErrors++;
        }

        // Rule 4 Tracker (Excessive Reads)
      }

      if (!hasEdit) {
        continuousEditTurns = 0;
      }

      // Read-only turn streak better reflects "lost in context" than raw tool-call count.
      if (hasRead && !hasEdit) {
        sessionReadOnlyTurns++;
        maxReadOnlyTurns = Math.max(maxReadOnlyTurns, sessionReadOnlyTurns);
      } else if (hasEdit) {
        sessionReadOnlyTurns = 0;
      }
    }
  }

  // Evaluate Rule 1: High Bash Output Waste
  const heavyBashOps = allBashOutputs.filter(len => len > config.maxBashOutput);
  if (heavyBashOps.length > 5) {
    const totalWastedChars = heavyBashOps.reduce((sum, val) => sum + val, 0);
    // Rough estimate: ~4 chars per token. Claude inputs are ~$3 / 1M tokens.
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

  // Evaluate Rule 2: Edit Retry Loops
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

  // Evaluate Rule 3: Unused/Failing MCP Servers
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

  // Evaluate Rule 4: Excessive File Reads
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

  return findings;
}

export function computeHealthScore(findings: WasteFinding[]): { score: number; grade: string } {
  const weights = { High: 15, Medium: 7, Low: 3 };
  const maxPenalty = 80;
  
  let penalty = 0;
  for (const f of findings) {
    penalty += weights[f.severity] || 0;
  }
  
  const score = Math.max(0, 100 - Math.min(maxPenalty, penalty));
  let grade: string;
  
  if (score >= 90) grade = 'A';
  else if (score >= 75) grade = 'B';
  else if (score >= 55) grade = 'C';
  else if (score >= 30) grade = 'D';
  else grade = 'F';
  
  return { score, grade };
}
