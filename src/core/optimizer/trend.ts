// ─────────────────────────────────────────────────────────────
// AgentLens – Trend Detection
// ─────────────────────────────────────────────────────────────

import type { Session, WasteFinding } from '../../types/index.js';

export type TrendStatus = 'active' | 'improving' | 'resolved';

export interface FindingWithTrend extends WasteFinding {
  trend: TrendStatus;
  previousValue?: number;
  currentValue?: number;
}

export function detectTrends(
  sessions: Session[],
  findings: WasteFinding[],
  now = Date.now()
): FindingWithTrend[] {
  const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;
  const recentCutoff = now - FORTY_EIGHT_HOURS;

  const recentSessions = sessions.filter(s => s.timestamp >= recentCutoff);
  const baselineSessions = sessions.filter(s => s.timestamp < recentCutoff);

  return findings.map(finding => {
    const triggerVal = typeof finding.triggerValue === 'number' ? finding.triggerValue : 0;
    
    if (recentSessions.length === 0) {
      return {
        ...finding,
        trend: 'active' as const,
        previousValue: triggerVal,
        currentValue: triggerVal,
      };
    }

    const recentRatio = sessions.length > 0 ? recentSessions.length / sessions.length : 0;
    const baselineRatio = sessions.length > 0 ? baselineSessions.length / sessions.length : 0;
    
    const currentValue = Math.round(triggerVal * recentRatio / (recentRatio || 0.01));
    const previousValue = Math.round(triggerVal * baselineRatio / (baselineRatio || 0.01));

    let trend: TrendStatus;
    if (currentValue === 0 && previousValue > 0) {
      trend = 'resolved';
    } else if (currentValue < previousValue * 0.7) {
      trend = 'improving';
    } else {
      trend = 'active';
    }

    return {
      ...finding,
      trend,
      previousValue,
      currentValue,
    };
  });
}

export function filterActiveFindings(findings: FindingWithTrend[]): FindingWithTrend[] {
  return findings.filter(f => f.trend !== 'resolved');
}

export function getTrendIcon(trend: TrendStatus): string {
  switch (trend) {
    case 'improving': return '↓ improving';
    case 'resolved': return '✓ resolved';
    default: return '● active';
  }
}
