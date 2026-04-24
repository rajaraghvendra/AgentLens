// ─────────────────────────────────────────────────────────────
// AgentLens – Optimizer
// ─────────────────────────────────────────────────────────────

import type { Session, WasteFinding, ToolUsage } from '../../types/index.js';
import config from '../../config/env.js';

export function analyzeInefficiencies(sessions: Session[]): WasteFinding[] {
  const findings: WasteFinding[] = [];
  
  if (sessions.length === 0) return findings;

  // Trackers
  const allBashOutputs: number[] = [];
  let continuousEdits = 0;
  let maxContinuousEdits = 0;
  let mcpUses = 0;
  let mcpErrors = 0;
  let currentFileEditTarget = '';
  let readWithoutEditCount = 0;
  let maxReadsWithoutEdit = 0;

  for (const session of sessions) {
    let sessionReadCount = 0;

    for (const msg of session.messages) {
      if (!msg.tools) continue;

      for (const tool of msg.tools) {
        const tName = tool.name;

        // Rule 1 Tracker
        if (tName === 'Bash' && typeof tool.outputLength === 'number') {
          allBashOutputs.push(tool.outputLength);
        }

        // Rule 2 Tracker (Edit retries)
        if (tName === 'Edit' && tool.input && typeof tool.input === 'object' && (tool.input as any).path) {
          const path = (tool.input as any).path;
          if (path === currentFileEditTarget) {
            continuousEdits++;
            maxContinuousEdits = Math.max(maxContinuousEdits, continuousEdits);
          } else {
            currentFileEditTarget = path;
            continuousEdits = 1;
          }
          sessionReadCount = 0; // reset reads logic
        } else {
          continuousEdits = 0;
        }

        // Rule 3 Tracker (MCP)
        if (tName.toLowerCase().includes('mcp') || (typeof tool.input === 'object' && (tool.input as any)?.server_name)) {
          mcpUses++;
          if (tool.isError) mcpErrors++;
        }

        // Rule 4 Tracker (Excessive Reads)
        if (tName === 'Read') {
          sessionReadCount++;
          maxReadsWithoutEdit = Math.max(maxReadsWithoutEdit, sessionReadCount);
        }
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
      severity: heavyBashOps.length > 15 ? 'High' : 'Medium',
      title: 'Uncapped Bash Output',
      description: `Detected ${heavyBashOps.length} terminal commands returning massive outputs (>5k chars). Agents waste context reading generic tool output.`,
      estimatedTokensWasted: tokenEst,
      estimatedCostWastedUSD: (tokenEst / 1_000_000) * 3.0,
      suggestedFix: `export BASH_MAX_OUTPUT_LENGTH=${config.maxBashOutput / 2}`
    });
  }

  // Evaluate Rule 2: Edit Retry Loops
  if (maxContinuousEdits > 3) {
    findings.push({
      severity: 'High',
      title: 'Edit Retry Loops Detected',
      description: `An agent edited the same file ${maxContinuousEdits} times in a row. This usually means it's stuck in a syntax error loop or failing to apply patches.`,
      estimatedTokensWasted: maxContinuousEdits * 4000,
      estimatedCostWastedUSD: (maxContinuousEdits * 4000 / 1_000_000) * 15.0,
      suggestedFix: 'Break prompt into smaller chunks or use an MCP testing server to dry-run.'
    });
  }

  // Evaluate Rule 3: Unused/Failing MCP Servers
  if (mcpUses > 0 && mcpErrors / mcpUses > 0.8) {
    findings.push({
      severity: 'Low',
      title: 'Failing MCP Servers',
      description: `An MCP server is consistently failing. The agent is wasting tokens querying an offline or buggy tool.`,
      estimatedTokensWasted: mcpErrors * 800,
      estimatedCostWastedUSD: (mcpErrors * 800 / 1_000_000) * 3.0,
      suggestedFix: 'Remove the problematic MCP server from clauderc.json or start the daemon.'
    });
  }

  // Evaluate Rule 4: Excessive File Reads
  if (maxReadsWithoutEdit > 10) {
    findings.push({
      severity: 'Medium',
      title: 'Context Blindness (High Reads)',
      description: `An agent read files ${maxReadsWithoutEdit} consecutive times without making edits. It may be lost trying to understand undocumented architecture.`,
      estimatedTokensWasted: maxReadsWithoutEdit * 3000,
      estimatedCostWastedUSD: (maxReadsWithoutEdit * 3000 / 1_000_000) * 3.0,
      suggestedFix: 'Create a CLAUDE.md summarizing the architecture so the agent doesn\'t have to brute-force read.'
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
