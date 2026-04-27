// ─────────────────────────────────────────────────────────────
// AgentLens – Insights Generator
// ─────────────────────────────────────────────────────────────

import type { Metrics, OptimizationEvent, ToolAdvice, WasteFinding } from '../../types/index.js';

export function generateInsights(
  metrics: Metrics,
  findings: WasteFinding[],
  events: OptimizationEvent[] = [],
  toolAdvice: ToolAdvice[] = [],
): string[] {
  const insights: string[] = [];

  // Insight 1: Spending pace
  const cost = metrics.overview.totalCostUSD;
  const currency = metrics.overview.localCurrency;
  const localCost = metrics.overview.totalCostLocal;
  const costStr = currency === 'USD' ? `$${cost.toFixed(2)}` : `${localCost.toFixed(2)} ${currency}`;
  
  if (cost > 10) {
    insights.push(`You spent ${costStr} this period across ${metrics.overview.sessionsCount} sessions.`);
  }

  // Insight 2: Top Activity
  const activities = Object.values(metrics.byActivity).sort((a, b) => b.totalTokens - a.totalTokens);
  if (activities.length > 0) {
    const top = activities[0];
    if (top.percentage > 40) {
      insights.push(`Your agents are highly focused on **${top.category}** (${top.percentage.toFixed(0)}% of workload).`);
    }
  }

  // Insight 3: Cache usage
  if (metrics.overview.cacheHitRate < 30 && cost > 1) {
    insights.push(`Your Context Cache efficiency is low (${metrics.overview.cacheHitRate.toFixed(1)}%). Break down large sessions to increase cache hits.`);
  }

  // Insight 4: Optimizer finding
  const highSeverity = findings.find(f => f.severity === 'High');
  if (highSeverity) {
    insights.push(`**Critical Inefficiency:** ${highSeverity.description} (Loss: ~$${highSeverity.estimatedCostWastedUSD.toFixed(2)})`);
  }

  const topEvent = events[0];
  if (topEvent) {
    insights.push(`**Active Alert:** ${topEvent.title}. ${topEvent.recommendedAction}`);
  }

  const topAdvice = toolAdvice[0];
  if (topAdvice) {
    insights.push(`**Top Advice:** ${topAdvice.description} ${topAdvice.suggestedAction}`);
  }

  if (insights.length === 0) {
    insights.push("Great job! Your AI sessions are highly optimized with no detected waste loops.");
  }

  return insights;
}
