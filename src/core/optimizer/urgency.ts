// ─────────────────────────────────────────────────────────────
// AgentLens – Urgency Scoring
// ─────────────────────────────────────────────────────────────

import type { WasteFinding } from '../../types/index.js';

const SEVERITY_WEIGHTS = { High: 15, Medium: 7, Low: 3 };

export interface ScoredFinding extends WasteFinding {
  urgencyScore: number;
}

export function scoreFindings(findings: WasteFinding[]): ScoredFinding[] {
  return findings
    .map(finding => {
      const severityWeight = SEVERITY_WEIGHTS[finding.severity as keyof typeof SEVERITY_WEIGHTS] || 0;
      const tokenScore = Math.min(10, finding.estimatedTokensWasted / 5000);
      const costScore = Math.min(10, finding.estimatedCostWastedUSD / 1.0);
      
      const urgencyScore = severityWeight + tokenScore + costScore;
      
      return { ...finding, urgencyScore };
    })
    .sort((a, b) => b.urgencyScore - a.urgencyScore);
}
