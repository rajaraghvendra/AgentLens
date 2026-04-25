import React from 'react';
import { Box, Text } from 'ink';
import { MetricCard } from './MetricCard.js';
import { ActivityBreakdown } from './ActivityBreakdown.js';
import { OptimizationFindings } from './OptimizationFindings.js';
import { InsightsPanel } from './InsightsPanel.js';
import type { EngineResult } from '../../../types/index.js';

interface DashboardProps {
  data: EngineResult;
  period: number;
}

export function Dashboard({ data, period }: DashboardProps) {
  const { metrics, findings, insights } = data;
  const { overview } = metrics;

  // Format currency values
  const formatCurrency = (amount: number, currency: string = 'USD'): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Format token values
  const formatTokens = (tokens: number): string => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    } else if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      {/* Metrics Grid */}
      <Box flexDirection="row" flexWrap="wrap" gap={2}>
        <MetricCard
          title="Total Spending"
          value={formatCurrency(overview.totalCostLocal, overview.localCurrency)}
          subtitle={`${formatTokens(overview.totalTokens)} tokens`}
          color="#10b981"
        />
        <MetricCard
          title="Active Sessions"
          value={overview.sessionsCount.toString()}
          subtitle={`Avg ${formatCurrency(overview.avgCostPerSession, 'USD')}/session`}
          color="#8b5cf6"
        />
        <MetricCard
          title="Cache Efficiency"
          value={overview.cacheHitRate > 0 ? `${overview.cacheHitRate.toFixed(1)}%` : "N/A"}
          subtitle="Context hit rate"
          color="#f59e0b"
        />
        {overview.budgetUSD && overview.budgetUSD > 0 && (
          <MetricCard
            title="Budget Utilization"
            value={`${((overview.totalCostUSD / overview.budgetUSD) * 100).toFixed(1)}%`}
            subtitle={`${formatCurrency(overview.totalCostUSD, 'USD')} of ${formatCurrency(overview.budgetUSD, 'USD')}`}
            color="#ef4444"
          />
        )}
      </Box>

      {/* Charts and Visualizations */}
      <Box flexDirection="row" gap={2} height={10}>
        <Box flex={2}>
          <ActivityBreakdown metrics={metrics} />
        </Box>
        <Box flex={1}>
          <OptimizationFindings findings={findings} />
        </Box>
      </Box>

      {/* Insights Panel */}
      <Box>
        <InsightsPanel insights={insights} />
      </Box>
    </Box>
  );
}